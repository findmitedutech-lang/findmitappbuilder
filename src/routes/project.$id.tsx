import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { generateApp } from "@/lib/generate.functions";
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
  const gen = useServerFn(generateApp);

  useEffect(() => {
    const p = getProject(id);
    if (!p) return setFound(false);
    setName(p.name);
    setMsgs(p.messages);
    setCode(p.code);
    setFound(true);
  }, [id]);

  useEffect(() => {
    if (found) updateProject(id, { messages: msgs, code, name });
  }, [found, id, msgs, code, name]);

  const send = async () => {
    const prompt = input.trim();
    if (!prompt || loading) return;
    setMsgs((m) => [...m, { role: "user", text: prompt }]);
    setInput("");
    setLoading(true);
    try {
      const r = await gen({ data: { prompt, currentCode: code || undefined } });
      if (r.ok) {
        setCode(r.code);
        setMsgs((m) => [...m, { role: "ai", text: "Done! Open the Preview tab to see your app." }]);
      } else setMsgs((m) => [...m, { role: "ai", text: `Sorry: ${r.error}` }]);
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
        <span className="text-xs text-muted-foreground">Saved</span>
      </header>
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
                    {m.text}
                  </div>
                </div>
              ))}
              {loading && <div className="text-sm text-muted-foreground">Building your app…</div>}
            </div>
            <div className="flex gap-2 border-t border-border p-3">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
                placeholder="Ask FindMit to build something..."
                className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
              <button onClick={send} className="rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">Send</button>
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
