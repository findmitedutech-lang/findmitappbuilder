import { cloudDeleteProject, cloudListProjects, cloudSaveProject } from "@/lib/cloud.functions";

export type Msg = { role: "user" | "ai"; text: string; suggest?: string; done?: boolean };
export interface Project {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  messages: Msg[];
  code: string;
  slug?: string;
  publishToken?: string;
  publishedCode?: string;
  publishedAt?: number;
}

const KEY = "findmit-projects";
const WS = "findmit-workspace";

/** Private workspace key: owns this browser's cloud projects. Paste it on another device to see the same projects. */
export function getWorkspaceKey() {
  let k = localStorage.getItem(WS);
  if (!k) {
    k = crypto.randomUUID() + crypto.randomUUID();
    localStorage.setItem(WS, k);
  }
  return k;
}

export function setWorkspaceKey(k: string) {
  localStorage.setItem(WS, k.trim());
  localStorage.setItem(KEY, "[]");
}

export function listProjects(): Project[] {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) || "[]") as Project[];
    return all.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

function saveAll(all: Project[]) {
  localStorage.setItem(KEY, JSON.stringify(all));
}

const timers = new Map<string, ReturnType<typeof setTimeout>>();
function pushToCloud(p: Project) {
  clearTimeout(timers.get(p.id));
  timers.set(
    p.id,
    setTimeout(() => {
      void cloudSaveProject({ data: { key: getWorkspaceKey(), id: p.id, project: p as unknown as Record<string, unknown> } }).catch(() => {});
    }, 800),
  );
}

/** Pulls cloud projects into this browser, and uploads any local-only projects. */
export async function syncProjects(): Promise<Project[]> {
  const key = getWorkspaceKey();
  const remote = (await cloudListProjects({ data: { key } })) as unknown as Project[];
  const local = listProjects();
  const byId = new Map<string, Project>();
  for (const p of remote) byId.set(p.id, p);
  for (const p of local) {
    const r = byId.get(p.id);
    if (!r || p.updatedAt > r.updatedAt) {
      byId.set(p.id, p);
      pushToCloud(p);
    }
  }
  const merged = [...byId.values()];
  saveAll(merged);
  return listProjects();
}

export function getProject(id: string) {
  return listProjects().find((p) => p.id === id);
}

export function createProject(name: string, extra: Partial<Project> = {}): Project {
  const now = Date.now();
  const p: Project = {
    id: crypto.randomUUID(),
    name: name.trim() || "Untitled project",
    createdAt: now,
    updatedAt: now,
    messages: [{ role: "ai", text: "Hi! Describe the app you want to build." }],
    code: "",
    ...extra,
  };
  saveAll([p, ...listProjects()]);
  pushToCloud(p);
  return p;
}

export function updateProject(id: string, patch: Partial<Project>) {
  let updated: Project | undefined;
  saveAll(listProjects().map((p) => (p.id === id ? (updated = { ...p, ...patch, updatedAt: Date.now() }) : p)));
  if (updated) pushToCloud(updated);
}

export function deleteProject(id: string) {
  saveAll(listProjects().filter((p) => p.id !== id));
  void cloudDeleteProject({ data: { key: getWorkspaceKey(), id } }).catch(() => {});
}
