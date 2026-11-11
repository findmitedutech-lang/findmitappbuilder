import type { ProjectFiles } from "@/lib/react-project";
import { buildExportTree, importTree, isImportable } from "@/lib/zip";

/** GitHub runs fully in the browser with the user's own token (GitHub's API allows this); the token never leaves their device except to GitHub. */
const API = "https://api.github.com";
const TOKEN_KEY = "findmit_github_token";
const repoKey = (id: string) => `findmit_github_repo_${id}`;

export const getToken = () => (typeof window === "undefined" ? "" : localStorage.getItem(TOKEN_KEY) ?? "");
export const setToken = (t: string) => (t ? localStorage.setItem(TOKEN_KEY, t.trim()) : localStorage.removeItem(TOKEN_KEY));
export const getLinkedRepo = (projectId: string) => localStorage.getItem(repoKey(projectId)) ?? "";
export const setLinkedRepo = (projectId: string, fullName: string) =>
  fullName ? localStorage.setItem(repoKey(projectId), fullName) : localStorage.removeItem(repoKey(projectId));

async function gh<T>(path: string, init: RequestInit = {}, token = getToken()): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  if (!res.ok) {
    let msg = res.statusText;
    try { msg = ((await res.json()) as { message?: string }).message ?? msg; } catch { /* ignore */ }
    if (res.status === 401) msg = "GitHub rejected this token. Check it and try again.";
    const err = new Error(`GitHub: ${msg}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return (res.status === 204 ? null : await res.json()) as T;
}

export type GhUser = { login: string; avatar_url: string };
export const getUser = (token?: string) => gh<GhUser>("/user", {}, token);

export async function createRepo(name: string, isPrivate: boolean) {
  const r = await gh<{ full_name: string; html_url: string }>("/user/repos", {
    method: "POST",
    body: JSON.stringify({ name, private: isPrivate, auto_init: true, description: "Built with FindMit App Builder" }),
  });
  return r.full_name;
}

/** Pushes every project file as one commit on the default branch. */
export async function pushProject(fullName: string, projectName: string, files: ProjectFiles, message: string) {
  const repo = await gh<{ default_branch: string }>(`/repos/${fullName}`);
  const branch = repo.default_branch;
  const ref = await gh<{ object: { sha: string } }>(`/repos/${fullName}/git/ref/heads/${branch}`);
  const parent = await gh<{ tree: { sha: string } }>(`/repos/${fullName}/git/commits/${ref.object.sha}`);
  const tree = Object.entries(buildExportTree(projectName, files)).map(([path, content]) => ({ path, mode: "100644", type: "blob", content }));
  const newTree = await gh<{ sha: string }>(`/repos/${fullName}/git/trees`, {
    method: "POST",
    body: JSON.stringify({ base_tree: parent.tree.sha, tree }),
  });
  const commit = await gh<{ sha: string }>(`/repos/${fullName}/git/commits`, {
    method: "POST",
    body: JSON.stringify({ message, tree: newTree.sha, parents: [ref.object.sha] }),
  });
  await gh(`/repos/${fullName}/git/refs/heads/${branch}`, { method: "PATCH", body: JSON.stringify({ sha: commit.sha }) });
  return { sha: commit.sha, url: `https://github.com/${fullName}/commit/${commit.sha}` };
}

/** Accepts "owner/repo" or any github.com URL. */
export function parseRepo(input: string) {
  const m = input.trim().replace(/\.git$/, "").match(/(?:github\.com\/)?([\w.-]+)\/([\w.-]+)/);
  return m ? `${m[1]}/${m[2]}` : null;
}

export async function importRepo(input: string) {
  const fullName = parseRepo(input);
  if (!fullName) throw new Error("Enter a repo like owner/name or a GitHub link.");
  const repo = await gh<{ default_branch: string; name: string }>(`/repos/${fullName}`);
  const t = await gh<{ tree: { path: string; type: string; sha: string; size?: number }[] }>(
    `/repos/${fullName}/git/trees/${repo.default_branch}?recursive=1`,
  );
  const blobs = t.tree.filter((e) => e.type === "blob" && (e.size ?? 0) < 500_000);
  const sha = new Map(blobs.map((b) => [b.path, b.sha]));
  const paths = blobs.map((b) => b.path).filter(isImportable);
  if (paths.length > 300) throw new Error("This repo is too large to import (over 300 files).");
  const read = async (p: string) => {
    const b = await gh<{ content: string }>(`/repos/${fullName}/git/blobs/${sha.get(p)}`);
    const bin = atob(b.content.replace(/\n/g, ""));
    return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  };
  const result = await importTree(repo.name, paths, read);
  return { ...result, fullName };
}
