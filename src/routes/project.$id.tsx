import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { generateApp } from "@/lib/generate.functions";
import { publishApp } from "@/lib/publish.functions";
import { getProject, updateProject, type Msg } from "@/lib/projects";

export const Route = createFileRoute("/project/$id")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Project builder — FindMit App Builder" },
      { name: "description", content: "Chat with AI to build and preview your app." },
      { property: "og:title", content: "Project builder — FindMit App Builder" },
      { property: "og:description", content: "Chat with AI to build and preview your app." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Builder,
});

type Tab = "chat" | "preview" | "project";

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
  const implement = (i: number, prompt: string) => {
    setMsgs((m) => m.map((x, j) => (j === i ? { ...x, done: true } : x)));
    setMode("build");
    void send(prompt, "build");
  };
  const gen = useServerFn(generateApp);
  const pubFn = useServerFn(publishApp);
  const [pub, setPub] = useState<{ code?: string | undefined; at?: number | undefined }>({});
  const [publishing, setPublishing] = useState(false);
  const [pubError, setPubError] = useState("");
  const link = pub.at && typeof window !== "undefined" ? `${window.location.origin}/p/${id}` : "";

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
        setMsgs((m) => [...m, { role: "ai", text: "Done! Open the Preview tab to see your app." }]);
      } else if (r.ok && r.mode === "chat") {
        setMsgs((m) => [...m, { role: "ai", text: r.text, ...(r.suggest ? { suggest: r.suggest } : {}) }]);
      } else if (!r.ok) setMsgs((m) => [...m, { role: "ai", text: `Sorry: ${r.error}` }]);
    } catch {
      setMsgs((m) => [...m, { role: "ai", text: "Sorry, something went wrong." }]);
    } finally {
      setLoading(false);
    }
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
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="flex-1 rounded bg-transparent px-1 font-display text-lg font-bold outline-none focus:ring-2 focus:ring-ring"
        />
        <span className="text-xs text-muted-foreground">
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
      {link && (
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted px-4 py-2 text-sm">
          <span className="text-muted-foreground">Live link:</span>
          <a href={link} target="_blank" rel="noreferrer" className="truncate text-primary underline">{link}</a>
          <button onClick={() => navigator.clipboard.writeText(link)} className="rounded border border-border px-2 py-0.5 text-xs">Copy</button>
          {pubError && <span className="text-destructive">{pubError}</span>}
        </div>
      )}
      <nav className="flex gap-1 border-b border-border p-2">
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
      <main className="flex-1 overflow-hidden">
        {tab === "chat" && (
          <div className="flex h-full flex-col">
            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {msgs.map((m, i) => (
                <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                    <div className="whitespace-pre-wrap">{m.text}</div>
                    {m.suggest && (
                      <div className="mt-3 rounded-xl border border-border bg-card p-3">
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
              {loading && <div className="text-sm text-muted-foreground">{mode === "build" ? "Building your app…" : "Thinking…"}</div>}
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
                {mode === "chat" ? "Discuss ideas — no changes" : "Changes your app"}
              </span>
            </div>
            <div className="flex gap-2 p-3">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
                placeholder={mode === "chat" ? "Ask FindMit anything..." : "Ask FindMit to build something..."}
                className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
              <button onClick={() => send()} className="rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">Send</button>
            </div>
          </div>
        )}
        {tab === "preview" && (
          <div className="flex h-full items-center justify-center p-4">
            {code ? (
              <iframe title="App preview" srcDoc={code} sandbox="allow-scripts allow-forms allow-modals" className="h-full w-full rounded-xl border border-border bg-card" />
            ) : (
              <div className="flex h-full w-full items-center justify-center rounded-xl border-2 border-dashed border-border text-muted-foreground">
                Your app preview will appear here
              </div>
            )}
          </div>
        )}
        {tab === "project" && (
          <div className="h-full space-y-3 overflow-y-auto p-4">
            {[["Name", name], ["Status", code ? "Generated" : "Draft"], ["Files", code ? "1 (index.html)" : "0"]].map(([k, v]) => (
              <div key={k} className="flex justify-between rounded-lg border border-border bg-card p-4">
                <span className="text-muted-foreground">{k}</span>
                <span className="font-medium">{v}</span>
              </div>
            ))}
            {code && <pre className="max-h-[60vh] overflow-auto rounded-lg border border-border bg-muted p-3 text-xs"><code>{code}</code></pre>}
          </div>
        )}
      </main>
    </div>
  );
}
