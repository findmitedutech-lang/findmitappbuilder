import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { createProject, deleteProject, getWorkspaceKey, listProjects, setWorkspaceKey, syncProjects, type Project } from "@/lib/projects";
import { importZip } from "@/lib/zip";
import { importRepo } from "@/lib/github";
import { GitHubConnect } from "@/components/GitHubPanel";
import { serializeProjectFiles } from "@/lib/react-project";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "FindMit App Builder — Your projects" },
      { name: "description", content: "Create and manage apps you build by chatting with AI." },
      { property: "og:title", content: "FindMit App Builder" },
      { property: "og:description", content: "Create and manage apps you build by chatting with AI." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();

  const [showKey, setShowKey] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    setProjects(listProjects());
    syncProjects().then(setProjects).catch(() => setStatus("Offline — showing projects on this device."));
  }, []);

  const onImport = async (f: File | undefined) => {
    if (!f) return;
    try {
      setStatus("Importing…");
      const { name, files } = await importZip(f);
      const p = createProject(name, { code: serializeProjectFiles(files) });
      navigate({ to: "/project/$id", params: { id: p.id } });
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Could not import this ZIP.");
    }
  };

  const [showGh, setShowGh] = useState(false);
  const [repoInput, setRepoInput] = useState("");
  const onGhImport = async () => {
    try {
      setStatus("Importing from GitHub…");
      const { name, files } = await importRepo(repoInput);
      const p = createProject(name, { code: serializeProjectFiles(files) });
      navigate({ to: "/project/$id", params: { id: p.id } });
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Could not import this repo.");
    }
  };

  const useKey = async () => {
    if (keyInput.trim().length < 20) return setStatus("That sync key looks too short.");
    setWorkspaceKey(keyInput);
    setStatus("Loading projects…");
    try { setProjects(await syncProjects()); setStatus("Projects synced from your other device."); setShowKey(false); }
    catch { setStatus("Could not sync with that key."); }
  };

  const create = () => {
    const p = createProject(name);
    navigate({ to: "/project/$id", params: { id: p.id } });
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <h1 className="font-display text-lg font-bold">
          <span className="text-primary">FindMit</span> App Builder
        </h1>
        <div className="flex flex-wrap justify-end gap-2">
        <button onClick={() => { setKeyInput(""); setShowKey((v) => !v); }} className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted">Sync devices</button>
        <button onClick={() => setShowGh((v) => !v)} className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted">Import GitHub</button>
        <label className="cursor-pointer rounded-md border border-border px-3 py-2 text-sm hover:bg-muted">
          Import ZIP
          <input type="file" accept=".zip" className="hidden" onChange={(e) => onImport(e.target.files?.[0])} />
        </label>
        <button onClick={() => setCreating(true)} className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">
          + New project
        </button>
        </div>
      </header>
      <main className="mx-auto max-w-4xl p-4">
        {status && <p className="mb-3 text-sm text-muted-foreground">{status}</p>}
        {showGh && (
          <div className="mb-4 space-y-3 rounded-xl border border-border bg-card p-4 text-sm">
            <div className="font-medium">Import from GitHub</div>
            <GitHubConnect />
            <p className="text-xs text-muted-foreground">Public repos work without connecting. Connect to import your private repos.</p>
            <div className="flex gap-2">
              <input value={repoInput} onChange={(e) => setRepoInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && onGhImport()} placeholder="owner/repo or GitHub link" className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-xs" />
              <button onClick={onGhImport} disabled={!repoInput.trim()} className="rounded-md bg-primary px-3 text-primary-foreground disabled:opacity-50">Import</button>
            </div>
          </div>
        )}
        {showKey && (
          <div className="mb-4 space-y-3 rounded-xl border border-border bg-card p-4 text-sm">
            <div>
              <div className="mb-1 font-medium">Your sync key</div>
              <p className="mb-2 text-xs text-muted-foreground">Keep it private. Paste it on another phone or computer to see the same projects.</p>
              <div className="flex gap-2">
                <input readOnly value={getWorkspaceKey()} className="flex-1 rounded-md border border-input bg-background px-3 py-2 font-mono text-xs" />
                <button onClick={() => navigator.clipboard.writeText(getWorkspaceKey()).then(() => setStatus("Sync key copied."))} className="rounded-md bg-secondary px-3 text-secondary-foreground">Copy</button>
              </div>
            </div>
            <div>
              <div className="mb-1 font-medium">Use a key from another device</div>
              <div className="flex gap-2">
                <input value={keyInput} onChange={(e) => setKeyInput(e.target.value)} placeholder="Paste sync key" className="flex-1 rounded-md border border-input bg-background px-3 py-2 font-mono text-xs" />
                <button onClick={useKey} className="rounded-md bg-primary px-3 text-primary-foreground">Use key</button>
              </div>
            </div>
          </div>
        )}
        {creating && (
          <div className="mb-4 rounded-xl border border-border bg-card p-4">
            <label className="mb-2 block text-sm font-medium">Project name</label>
            <div className="flex gap-2">
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && create()}
                placeholder="My awesome app"
                className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
              <button onClick={create} className="rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">Create</button>
              <button onClick={() => setCreating(false)} className="rounded-md px-3 text-sm text-muted-foreground hover:bg-muted">Cancel</button>
            </div>
          </div>
        )}
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Your projects</h2>
        {projects.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-border p-10 text-center text-muted-foreground">
            No projects yet. Tap "+ New project" to start building.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {projects.map((p) => (
              <div key={p.id} className="rounded-xl border border-border bg-card p-4">
                <Link to="/project/$id" params={{ id: p.id }} className="block">
                  <div className="font-medium">{p.name}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {p.code ? "Generated" : "Draft"} · Edited {new Date(p.updatedAt).toLocaleString()}
                  </div>
                </Link>
                <button
                  onClick={() => {
                    if (confirm(`Delete "${p.name}"?`)) {
                      deleteProject(p.id);
                      setProjects(listProjects());
                    }
                  }}
                  className="mt-3 text-xs text-destructive hover:underline"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
