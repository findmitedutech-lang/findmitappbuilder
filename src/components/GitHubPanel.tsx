import { useEffect, useState } from "react";
import type { ProjectFiles } from "@/lib/react-project";
import { createRepo, getLinkedRepo, getToken, getUser, pushProject, setLinkedRepo, setToken, type GhUser } from "@/lib/github";
import { repoSlug } from "@/lib/zip";

const TOKEN_URL = "https://github.com/settings/tokens/new?scopes=repo&description=FindMit%20App%20Builder";

export function GitHubConnect({ onUser }: { onUser?: (u: GhUser | null) => void }) {
  const [user, setUser] = useState<GhUser | null>(null);
  const [token, setTok] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!getToken()) return onUser?.(null);
    getUser().then((u) => { setUser(u); onUser?.(u); }).catch(() => onUser?.(null));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const connect = async () => {
    setBusy(true); setErr("");
    try { const u = await getUser(token.trim()); setToken(token); setUser(u); onUser?.(u); }
    catch (e) { setErr(e instanceof Error ? e.message : "Could not connect."); }
    finally { setBusy(false); }
  };

  if (user) return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className="flex items-center gap-2"><img src={user.avatar_url} alt="" className="size-6 rounded-full" /> Connected as <b>@{user.login}</b></span>
      <button onClick={() => { setToken(""); setUser(null); onUser?.(null); }} className="text-xs text-muted-foreground underline">Disconnect</button>
    </div>
  );
  return (
    <div className="space-y-2 text-sm">
      <p className="text-xs text-muted-foreground">
        Create a GitHub token with <b>repo</b> access, then paste it here. It is saved only on this device.{" "}
        <a href={TOKEN_URL} target="_blank" rel="noreferrer" className="text-primary underline">Create token</a>
      </p>
      <div className="flex gap-2">
        <input type="password" value={token} onChange={(e) => setTok(e.target.value)} placeholder="ghp_…" className="flex-1 rounded-md border border-input bg-background px-3 py-2 font-mono text-xs" />
        <button onClick={connect} disabled={busy || token.trim().length < 10} className="rounded-md bg-primary px-3 text-primary-foreground disabled:opacity-50">{busy ? "…" : "Connect"}</button>
      </div>
      {err && <p className="text-xs text-destructive">{err}</p>}
    </div>
  );
}

export default function GitHubPanel({ projectId, name, files }: { projectId: string; name: string; files: ProjectFiles | null }) {
  const [user, setUser] = useState<GhUser | null>(null);
  const [repo, setRepo] = useState(() => getLinkedRepo(projectId));
  const [repoName, setRepoName] = useState(repoSlug(name));
  const [priv, setPriv] = useState(true);
  const [msg, setMsg] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setStatus("");
    try { await fn(); } catch (e) { setStatus(e instanceof Error ? e.message : "Something went wrong."); }
    finally { setBusy(false); }
  };

  const push = (full: string) => run(async () => {
    if (!files) throw new Error("Build your app first.");
    setStatus("Pushing…");
    const r = await pushProject(full, name, files, msg.trim() || `FindMit update: ${new Date().toLocaleString()}`);
    setMsg(""); setStatus(`Pushed ✓ ${r.sha.slice(0, 7)}`);
  });

  const create = () => run(async () => {
    setStatus("Creating repository…");
    const full = await createRepo(repoName.trim(), priv);
    setLinkedRepo(projectId, full); setRepo(full);
    await new Promise((r) => setTimeout(r, 1500));
    if (!files) throw new Error("Build your app first.");
    const r = await pushProject(full, name, files, "Initial commit from FindMit App Builder");
    setStatus(`Created and pushed ✓ ${r.sha.slice(0, 7)}`);
  });

  return (
    <div className="space-y-4 p-4 text-sm">
      <h3 className="font-semibold">GitHub</h3>
      <GitHubConnect onUser={setUser} />
      {user && !repo && (
        <div className="space-y-2 rounded-lg border border-border p-3">
          <div className="font-medium">Create a new repository</div>
          <input value={repoName} onChange={(e) => setRepoName(e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs" aria-label="Repository name" />
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={priv} onChange={(e) => setPriv(e.target.checked)} /> Private repository</label>
          <button onClick={create} disabled={busy || !repoName.trim()} className="w-full rounded-md bg-primary py-2 text-primary-foreground disabled:opacity-50">Create repo &amp; push</button>
          <button onClick={() => { const v = prompt("Existing repo (owner/name)"); if (v) { setLinkedRepo(projectId, v.trim()); setRepo(v.trim()); } }} className="w-full text-xs text-muted-foreground underline">Use an existing repo instead</button>
        </div>
      )}
      {user && repo && (
        <div className="space-y-2 rounded-lg border border-border p-3">
          <div className="flex items-center justify-between">
            <a href={`https://github.com/${repo}`} target="_blank" rel="noreferrer" className="font-mono text-xs text-primary underline">{repo}</a>
            <button onClick={() => { setLinkedRepo(projectId, ""); setRepo(""); }} className="text-xs text-muted-foreground underline">Unlink</button>
          </div>
          <input value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Describe your changes (optional)" className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs" />
          <button onClick={() => push(repo)} disabled={busy} className="w-full rounded-md bg-primary py-2 text-primary-foreground disabled:opacity-50">Push changes</button>
        </div>
      )}
      {status && <p className="text-xs text-muted-foreground">{status}</p>}
    </div>
  );
}
