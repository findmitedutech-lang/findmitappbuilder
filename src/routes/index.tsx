import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { generateApp } from "@/lib/generate.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "FindMit App Builder" },
      { name: "description", content: "Build websites and apps by chatting with AI." },
      { property: "og:title", content: "FindMit App Builder" },
      { property: "og:description", content: "Build websites and apps by chatting with AI." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

type Tab = "chat" | "preview" | "project";

function Index() {
  const [tab, setTab] = useState<Tab>("chat");
  const [msgs, setMsgs] = useState<{ role: "user" | "ai"; text: string }[]>([
    { role: "ai", text: "Hi! Describe the app you want to build." },
  ]);
  const [input, setInput] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const gen = useServerFn(generateApp);

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
      } else {
        setMsgs((m) => [...m, { role: "ai", text: `Sorry: ${r.error}` }]);
      }
    } catch {
      setMsgs((m) => [...m, { role: "ai", text: "Sorry, something went wrong." }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <h1 className="font-display text-lg font-bold">
          <span className="text-primary">FindMit</span> App Builder
        </h1>
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
          <div className="space-y-3 overflow-y-auto p-4 h-full">
            {[["Name", "Untitled project"], ["Status", code ? "Generated" : "Draft"], ["Files", code ? "1 (index.html)" : "0"]].map(([k, v]) => (
              <div key={k} className="flex justify-between rounded-lg border border-border bg-card p-4">
                <span className="text-muted-foreground">{k}</span>
                <span className="font-medium">{v}</span>
              </div>
            ))}
            {code && (
              <pre className="max-h-[60vh] overflow-auto rounded-lg border border-border bg-muted p-3 text-xs"><code>{code}</code></pre>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
