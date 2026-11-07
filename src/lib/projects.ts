export type Msg = { role: "user" | "ai"; text: string; suggest?: string; done?: boolean };
export interface Project {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  messages: Msg[];
  code: string;
  publishToken?: string;
  publishedCode?: string;
  publishedAt?: number;
}

const KEY = "findmit-projects";

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

export function getProject(id: string) {
  return listProjects().find((p) => p.id === id);
}

export function createProject(name: string): Project {
  const now = Date.now();
  const p: Project = {
    id: crypto.randomUUID(),
    name: name.trim() || "Untitled project",
    createdAt: now,
    updatedAt: now,
    messages: [{ role: "ai", text: "Hi! Describe the app you want to build." }],
    code: "",
  };
  saveAll([p, ...listProjects()]);
  return p;
}

export function updateProject(id: string, patch: Partial<Project>) {
  saveAll(listProjects().map((p) => (p.id === id ? { ...p, ...patch, updatedAt: Date.now() } : p)));
}

export function deleteProject(id: string) {
  saveAll(listProjects().filter((p) => p.id !== id));
}
