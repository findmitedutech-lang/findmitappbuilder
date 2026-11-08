import { createFileRoute, Link } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { FileCode2, FolderOpen } from "lucide-react";
import { generateApp } from "@/lib/generate.functions";
import { publishApp } from "@/lib/publish.functions";
import { getProject, updateProject, type Msg } from "@/lib/projects";
import { parseProjectSource, serializeProjectFiles } from "@/lib/react-project";

const ReactAppRunner = lazy(() => import("@/components/ReactAppRunner"));

export const Route = createFileRoute("/project/$id")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Project builder — FindMit App Builder" },
      { name: "description", content: "Chat with AI to build and preview your multi-file React app." },
      { property: "og:title", content: "Project builder — FindMit App Builder" },
      { property: "og:description", content: "Chat with AI to build and preview your multi-file React app." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Builder,
});

type Tab = "chat" | "preview" | "project";

function RunnerFallback() {
  return <div className="flex h-full min-h-105 items-center justify-center rounded-xl border border-border bg-card text-sm text-muted-foreground">Starting React runtime…</div>;
}

function Builder() {
  const { id } = Route.useParams();
  const [found, setFound] = useState<boolean | null>(null);
  const [name, setName] = useState("");
  const [tab, setTab] = useState<Tab>("chat");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"chat" | "build">("chat");
  const [selectedFile, setSelectedFile] = useState("/App.tsx");
  const gen = useServerFn(generateApp);
  const pubFn = useServerFn(publishApp);
  const [pub, setPub] = useState<{ code?: string | undefined; at?: number | undefined }>({});
  const [publishing, setPublishing] = useState(false);
  const [pubError, setPubError] = useState("");
  const link = pub.at && typeof window !== "undefined" ? `${window.location.origin}/p/${id}` : "";
  const source = useMemo(() => parseProjectSource(code), [code]);
  const fileNames = source.kind === "react" ? Object.keys(source.files).sort() : [];
  const activeFile = source.kind === "react" && source.files[selectedFile] !== undefined ? selectedFile : "/App.tsx";

  const implement = (i: number, prompt: string) => {
    setMsgs((m) => m.map((x, j) => (j === i ? { ...x, done: true } : x)));
    setMode("build");
    void send(prompt, "build");
  };

  const publish = async () => {
    const p = getProject(id);
    if (!p || !code) return;
    const token = p.publishToken ?? crypto.randomUUID() + crypto.randomUUID();
    setPublishing(true);
    setPubError("");
    try {
      const r = await pubFn({ data: { id, name, code, token } });
      if (r.ok) {
        const at = Date.now();
        updateProject(id, { publishToken: token, publishedCode: code, publishedAt: at });
        setPub({ code, at });
      } else setPubError(r.error);
    } catch {
      setPubError("Could not publish");
    } finally {
      setPublishing(false);
    }
  };

  useEffect(() => {
    const p = getProject(id);
    if (!p) return setFound(false);
    setName(p.name);
    setMsgs(p.messages);
    setCode(p.code);
    setPub({ code: p.publishedCode, at: p.publishedAt });
    setFound(true);
  }, [id]);

  useEffect(() => {
    if (found) updateProject(id, { messages: msgs, code, name });
  }, [found, id, msgs, code, name]);

  const send = async (override?: string, forceMode?: "chat" | "build") => {
    const prompt = (override ?? input).trim();
    const useMode = forceMode ?? mode;
    if (!prompt || loading) return;
    const history = msgs.slice(-20).map((m) => ({ role: m.role, text: m.text.slice(0, 8000) }));
    setMsgs((m) => [...m, { role: "user", text: prompt }]);
    if (!override) setInput("");
    setLoading(true);
    try {
      const r = await gen({ data: { prompt, currentCode: code || undefined, mode: useMode, history } });
      if (r.ok && r.mode === "build") {
        setCode(r.code);
        setSelectedFile("/App.tsx");
        setMsgs((m) => [...m, { role: "ai", text: "Done! Your multi-file React app is ready in Preview. You can inspect and edit every file in Project." }]);
        setTab("preview");
      } else if (r.ok && r.mode === "chat") {
        setMsgs((m) => [...m, { role: "ai", text: r.text, ...(r.suggest ? { suggest: r.suggest } : {}) }]);
      } else if (!r.ok) setMsgs((m) => [...m, { role: "ai", text: `Sorry: ${r.error}` }]);
    } catch {
      setMsgs((m) => [...m, { role: "ai", text: "Sorry, something went wrong." }]);
    } finally {
      setLoading(false);
    }
  };

  const editFile = (contents: string) => {
    if (source.kind !== "react") return;
    setCode(serializeProjectFiles({ ...source.files, [activeFile]: contents }));
  };

  if (found === false)
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-background text-foreground">
        <p>Project not found.</p>
        <Link to="/" className="text-primary underline">Back to projects</Link>
      </div>
    );
  if (found === null) return <div className="h-screen bg-background" />;

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">← Projects</Link>
        <input
          aria-label="Project name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="min-w-0 flex-1 rounded bg-transparent px-1 font-display text-lg font-bold outline-none focus:ring-2 focus:ring-ring"
        />
        <span className="hidden text-xs text-muted-foreground sm:inline">
          {!pub.at ? "Not published" : pub.code === code ? "Live · up to date" : "Unpublished changes"}
        </span>
        <button
          onClick={publish}
          disabled={!code || publishing}
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {publishing ? "Publishing…" : pub.at ? "Update" : "Publish"}
        </button>
      </header>
      {(link || pubError) && (
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted px-4 py-2 text-sm">
          {link && (
            <>
              <span className="text-muted-foreground">Live link:</span>
              <a href={link} target="_blank" rel="noreferrer" className="truncate text-primary underline">{link}</a>
              <button onClick={() => navigator.clipboard.writeText(link)} className="rounded border border-border px-2 py-0.5 text-xs">Copy</button>
            </>
          )}
          {pubError && <span className="text-destructive">{pubError}</span>}
        </div>
      )}
      <nav className="flex gap-1 border-b border-border p-2" aria-label="Project workspace">
        {(["chat", "preview", "project"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium capitalize transition-colors ${
              tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
            }`}
          >
            {t}
          </button>
        ))}
      </nav>
      <main className="min-h-0 flex-1 overflow-hidden">
        {tab === "chat" && (
          <div className="flex h-full flex-col">
            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {msgs.map((m, i) => (
                <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                    <div className="whitespace-pre-wrap">{m.text}</div>
                    {m.suggest && (
                      <div className="mt-3 rounded-xl border border-border bg-card p-3 text-card-foreground">
                        <p className="text-xs text-muted-foreground">Switch to Build mode to implement this?</p>
                        <p className="mt-1 text-xs italic">{m.suggest}</p>
                        <button
                          disabled={m.done || loading}
                          onClick={() => implement(i, m.suggest!)}
                          className="mt-2 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
                        >
                          {m.done ? "Switched to Build mode" : "Switch to Build mode"}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {loading && <div className="text-sm text-muted-foreground">{mode === "build" ? "Building your React files…" : "Thinking…"}</div>}
            </div>
            <div className="flex gap-1 border-t border-border px-3 pt-2">
              {(["chat", "build"] as const).map((md) => (
                <button
                  key={md}
                  onClick={() => setMode(md)}
                  className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${mode === md ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
                >
                  {md}
                </button>
              ))}
              <span className="ml-auto self-center text-xs text-muted-foreground">
                {mode === "chat" ? "Discuss ideas — no changes" : "Changes your app files"}
              </span>
            </div>
            <div className="flex gap-2 p-3">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
                placeholder={mode === "chat" ? "Ask FindMit anything..." : "Ask FindMit to build something..."}
                className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
              <button onClick={() => send()} disabled={loading} className="rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50">Send</button>
            </div>
          </div>
        )}
        {tab === "preview" && (
          <div className="h-full min-h-0 p-4">
            {source.kind === "react" ? (
              <Suspense fallback={<RunnerFallback />}><ReactAppRunner files={source.files} /></Suspense>
            ) : source.kind === "html" ? (
              <iframe title="App preview" srcDoc={source.code} sandbox="allow-scripts allow-forms allow-modals" className="h-full w-full rounded-xl border border-border bg-card" />
            ) : (
              <div className="flex h-full w-full items-center justify-center rounded-xl border-2 border-dashed border-border px-6 text-center text-muted-foreground">
                Your live React app preview will appear here
              </div>
            )}
          </div>
        )}
        {tab === "project" && (
          <div className="h-full min-h-0 overflow-hidden">
            {source.kind === "react" ? (
              <div className="flex h-full min-h-0 flex-col md:flex-row">
                <aside className="shrink-0 overflow-y-auto border-b border-border bg-muted/40 p-3 md:w-64 md:border-r md:border-b-0">
                  <div className="mb-3 flex items-center gap-2 px-2 text-xs font-medium text-muted-foreground">
                    <FolderOpen className="size-4" /> PROJECT FILES · {fileNames.length}
                  </div>
                  <div className="flex gap-1 overflow-x-auto md:flex-col">
                    {fileNames.map((path) => (
                      <button
                        key={path}
                        onClick={() => setSelectedFile(path)}
                        className={`flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-left font-mono text-xs md:shrink ${activeFile === path ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                      >
                        <FileCode2 className="size-3.5 shrink-0" /> {path}
                      </button>
                    ))}
                  </div>
                </aside>
                <section className="flex min-h-0 min-w-0 flex-1 flex-col">
                  <div className="flex items-center justify-between border-b border-border px-4 py-2">
                    <span className="truncate font-mono text-xs text-muted-foreground">{activeFile}</span>
                    <span className="ml-3 shrink-0 text-xs text-muted-foreground">Editable · auto-saved</span>
                  </div>
                  <textarea
                    aria-label={`Edit ${activeFile}`}
                    value={source.files[activeFile] ?? ""}
                    onChange={(e) => editFile(e.target.value)}
                    spellCheck={false}
                    className="min-h-0 flex-1 resize-none bg-card p-4 font-mono text-xs leading-6 text-card-foreground outline-none focus:ring-1 focus:ring-inset focus:ring-ring"
                  />
                </section>
              </div>
            ) : source.kind === "html" ? (
              <div className="h-full space-y-3 overflow-y-auto p-4">
                <div className="rounded-lg border border-border bg-muted p-3 text-sm text-muted-foreground">Legacy single-file app. Send a Build mode request to migrate it to multi-file React.</div>
                <pre className="overflow-auto rounded-lg border border-border bg-muted p-3 text-xs"><code>{source.code}</code></pre>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center p-6 text-center text-muted-foreground">Build an app to see its React files here.</div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
