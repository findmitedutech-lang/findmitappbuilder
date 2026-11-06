import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { createProject, deleteProject, listProjects, type Project } from "@/lib/projects";

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

  useEffect(() => setProjects(listProjects()), []);

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
        <button onClick={() => setCreating(true)} className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">
          + New project
        </button>
      </header>
      <main className="mx-auto max-w-4xl p-4">
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
