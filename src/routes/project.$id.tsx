import { createFileRoute, Link } from "@tanstack/react-router";
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Code2, Download, ExternalLink, FileCode2, History, KeyRound, Monitor, RotateCw, Smartphone, Tablet, X } from "lucide-react";
import { generateApp } from "@/lib/generate.functions";
import { checkSlug, publishApp, slugify } from "@/lib/publish.functions";
import { addVersion, deleteSecret, getAppKey, listSecrets, listVersions, setSecret } from "@/lib/cloud.functions";
import { getProject, getWorkspaceKey, syncProjects, updateProject, type Msg } from "@/lib/projects";
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

type Device = "desktop" | "tablet" | "mobile";
type Panel = null | "code" | "history" | "secrets";
type Version = { id: string; label: string; code: string; created_at: string };
const DEVICE_W: Record<Device, string> = { desktop: "100%", tablet: "768px", mobile: "375px" };

function Builder() {
  const { id } = Route.useParams();
  const [found, setFound] = useState<boolean | null>(null);
  const [name, setName] = useState("");
  const [mobileTab, setMobileTab] = useState<"chat" | "preview">("chat");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"chat" | "build">("chat");
  const [selectedFile, setSelectedFile] = useState("/App.tsx");
  const [device, setDevice] = useState<Device>("desktop");
  const [refreshKey, setRefreshKey] = useState(0);
  const [panel, setPanel] = useState<Panel>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [apiKey, setApiKey] = useState("");
  const [slug, setSlug] = useState("");
  const [slugOk, setSlugOk] = useState(true);
  const gen = useServerFn(generateApp);
  const pubFn = useServerFn(publishApp);
  const [pub, setPub] = useState<{ code?: string | undefined; at?: number | undefined; slug?: string | undefined }>({});
  const [publishing, setPublishing] = useState(false);
  const [pubError, setPubError] = useState("");
  const [secrets, setSecrets] = useState<{ name: string; allowed_host: string }[]>([]);
  const wsKey = useMemo(() => getWorkspaceKey(), []);
  const link = pub.at ? `${window.location.origin}/p/${pub.slug ?? id}` : "";
  const source = useMemo(() => parseProjectSource(code), [code]);
  const fileNames = source.kind === "react" ? Object.keys(source.files).sort() : [];
  const activeFile = source.kind === "react" && source.files[selectedFile] !== undefined ? selectedFile : "/App.tsx";

  const loadVersions = useCallback(() => {
    listVersions({ data: { key: wsKey, id } }).then(setVersions).catch(() => {});
  }, [id, wsKey]);
  const loadSecrets = useCallback(() => {
    listSecrets({ data: { key: wsKey, id } }).then(setSecrets).catch(() => {});
  }, [id, wsKey]);

  useEffect(() => {
    const init = () => {
      const p = getProject(id);
      if (!p) return false;
      setName(p.name);
      setMsgs(p.messages);
      setCode(p.code);
      setSlug(p.slug ?? slugify(p.name));
      setPub({ code: p.publishedCode, at: p.publishedAt, slug: p.slug });
      setFound(true);
      return true;
    };
    if (!init()) syncProjects().then(() => { if (!init()) setFound(false); }).catch(() => setFound(false));
  }, [id]);

  useEffect(() => {
    if (!found) return;
    getAppKey({ data: { key: wsKey, id } }).then((r) => setApiKey(r.apiKey)).catch(() => {});
    loadVersions();
    loadSecrets();
  }, [found, id, wsKey, loadVersions, loadSecrets]);

  useEffect(() => {
    if (found) updateProject(id, { messages: msgs, code, name, slug });
  }, [found, id, msgs, code, name, slug]);

  useEffect(() => {
    if (!slug) return setSlugOk(false);
    const t = setTimeout(() => checkSlug({ data: { id, slug } }).then((r) => setSlugOk(r.available)).catch(() => {}), 400);
    return () => clearTimeout(t);
  }, [slug, id]);

  const snapshot = (label: string, c: string) => {
    if (!c) return;
    addVersion({ data: { key: wsKey, id, label: label.slice(0, 300), code: c } }).then(loadVersions).catch(() => {});
  };

  const implement = (i: number, prompt: string) => {
    setMsgs((m) => m.map((x, j) => (j === i ? { ...x, done: true } : x)));
    setMode("build");
    void send(prompt, "build");
  };

  const publish = async () => {
    const p = getProject(id);
    if (!p || !code || !slugOk) return;
    const token = p.publishToken ?? crypto.randomUUID() + crypto.randomUUID();
    setPublishing(true);
    setPubError("");
    try {
      const r = await pubFn({ data: { id, name, code, token, slug } });
      if (r.ok) {
        const at = Date.now();
        updateProject(id, { publishToken: token, publishedCode: code, publishedAt: at, slug });
        setPub({ code, at, slug });
      } else setPubError(r.error);
    } catch {
      setPubError("Could not publish");
    } finally {
      setPublishing(false);
    }
  };

  const send = async (override?: string, forceMode?: "chat" | "build") => {
    const prompt = (override ?? input).trim();
    const useMode = forceMode ?? mode;
    if (!prompt || loading) return;
    const history = msgs.slice(-20).map((m) => ({ role: m.role, text: m.text.slice(0, 8000) }));
    setMsgs((m) => [...m, { role: "user", text: prompt }]);
    if (!override) setInput("");
    setLoading(true);
    try {
      const r = await gen({ data: { prompt, currentCode: code || undefined, mode: useMode, history, secretNames: secrets.map((s) => s.name) } });
      if (r.ok && r.mode === "build") {
        if (code && !versions.length) snapshot("Before AI changes", code);
        setCode(r.code);
        snapshot(r.summary || prompt, r.code);
        const changed = r.changed.length ? `\nChanged: ${r.changed.join(", ")}` : "";
        setMsgs((m) => [...m, { role: "ai", text: `${r.summary || "Done! Your app is updated in the preview."}${changed}` }]);
        setMobileTab("preview");
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

  const restore = (v: Version) => {
    if (code) snapshot("Before restore", code);
    setCode(v.code);
    snapshot(`Restored: ${v.label}`, v.code);
    setMsgs((m) => [...m, { role: "ai", text: `Restored the version "${v.label}".` }]);
  };

  const doExport = async () => {
    if (source.kind !== "react") return;
    const { exportZip } = await import("@/lib/zip");
    await exportZip(name, source.files);
  };

  const openNewTab = () => {
    if (link) window.open(link, "_blank", "noopener");
    else setPubError("Publish first to open your app in a new tab.");
  };

  if (found === false)
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-background text-foreground">
        <p>Project not found.</p>
        <Link to="/" className="text-primary underline">Back to projects</Link>
      </div>
    );
  if (found === null) return <div className="h-screen bg-background" />;

  const iconBtn = (active: boolean) => `rounded-md p-1.5 ${active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`;

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <header className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">← Projects</Link>
        <input aria-label="Project name" value={name} onChange={(e) => setName(e.target.value)} className="min-w-0 flex-1 rounded bg-transparent px-1 font-display text-lg font-bold outline-none focus:ring-2 focus:ring-ring" />
        <button onClick={() => setPanel(panel === "history" ? null : "history")} className={iconBtn(panel === "history")} title="Version history" aria-label="Version history"><History className="size-4" /></button>
        <button onClick={() => setPanel(panel === "secrets" ? null : "secrets")} className={iconBtn(panel === "secrets")} title="Secrets" aria-label="Secrets"><KeyRound className="size-4" /></button>
        <button onClick={doExport} disabled={source.kind !== "react"} className="flex items-center gap-1 rounded-md border border-border px-2 py-1.5 text-xs disabled:opacity-50" aria-label="Export ZIP"><Download className="size-3.5" /> ZIP</button>
        <span className="hidden text-xs text-muted-foreground lg:inline">{!pub.at ? "Not published" : pub.code === code && pub.slug === slug ? "Live · up to date" : "Unpublished changes"}</span>
        <button onClick={publish} disabled={!code || publishing || !slugOk} className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50">
          {publishing ? "Publishing…" : pub.at ? "Update" : "Publish"}
        </button>
      </header>
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted px-3 py-1.5 text-xs">
        <span className="text-muted-foreground">Link:</span>
        <span className="text-muted-foreground">{window.location.host}/p/</span>
        <input aria-label="App link" value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 50))} className="w-36 rounded border border-input bg-background px-1.5 py-0.5 font-mono" />
        <span className={slugOk ? "text-muted-foreground" : "text-destructive"}>{slugOk ? "available" : "taken or invalid"}</span>
        {link && (
          <>
            <a href={link} target="_blank" rel="noreferrer" className="truncate text-primary underline">{link}</a>
            <button onClick={() => navigator.clipboard.writeText(link)} className="rounded border border-border px-2 py-0.5">Copy</button>
          </>
        )}
        {pubError && <span className="text-destructive">{pubError}</span>}
      </div>
      <nav className="flex gap-1 border-b border-border p-2 md:hidden" aria-label="Workspace">
        {(["chat", "preview"] as const).map((t) => (
          <button key={t} onClick={() => setMobileTab(t)} className={`flex-1 rounded-md px-3 py-2 text-sm font-medium capitalize ${mobileTab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>{t}</button>
        ))}
      </nav>
      <main className="flex min-h-0 flex-1 overflow-hidden">
        <section className={`${mobileTab === "chat" ? "flex" : "hidden"} min-w-0 flex-1 flex-col border-border md:flex md:w-[42%] md:flex-none md:border-r`}>
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {msgs.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                  <div className="whitespace-pre-wrap">{m.text}</div>
                  {m.suggest && (
                    <div className="mt-3 rounded-xl border border-border bg-card p-3 text-card-foreground">
                      <p className="text-xs text-muted-foreground">Switch to Build mode to implement this?</p>
                      <p className="mt-1 text-xs italic">{m.suggest}</p>
                      <button disabled={m.done || loading} onClick={() => implement(i, m.suggest!)} className="mt-2 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50">
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
              <button key={md} onClick={() => setMode(md)} className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${mode === md ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{md}</button>
            ))}
            <span className="ml-auto self-center text-xs text-muted-foreground">{mode === "chat" ? "Discuss ideas — no changes" : "Changes your app files"}</span>
          </div>
          <div className="flex gap-2 p-3">
            <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder={mode === "chat" ? "Ask FindMit anything..." : "Ask FindMit to build something..."} className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
            <button onClick={() => send()} disabled={loading} className="rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50">Send</button>
          </div>
        </section>

        <section className={`${mobileTab === "preview" ? "flex" : "hidden"} relative min-w-0 flex-1 flex-col md:flex`}>
          <div className="flex items-center gap-1 border-b border-border px-3 py-1.5">
            <button onClick={() => setDevice("desktop")} className={iconBtn(device === "desktop")} aria-label="Desktop view"><Monitor className="size-4" /></button>
            <button onClick={() => setDevice("tablet")} className={iconBtn(device === "tablet")} aria-label="Tablet view"><Tablet className="size-4" /></button>
            <button onClick={() => setDevice("mobile")} className={iconBtn(device === "mobile")} aria-label="Mobile view"><Smartphone className="size-4" /></button>
            <div className="mx-2 min-w-0 flex-1 truncate rounded-md bg-muted px-2 py-1 font-mono text-xs text-muted-foreground">/{pub.slug ?? slug}</div>
            <button onClick={() => setRefreshKey((k) => k + 1)} className={iconBtn(false)} aria-label="Hard refresh"><RotateCw className="size-4" /></button>
            <button onClick={openNewTab} className={iconBtn(false)} aria-label="Open in new tab"><ExternalLink className="size-4" /></button>
            <button onClick={() => setPanel(panel === "code" ? null : "code")} className={iconBtn(panel === "code")} aria-label="Code"><Code2 className="size-4" /></button>
          </div>
          <div className="flex min-h-0 flex-1 justify-center overflow-auto bg-muted/40 p-3">
            <div key={refreshKey} style={{ width: DEVICE_W[device], maxWidth: "100%" }} className={`h-full min-h-0 ${device !== "desktop" ? "rounded-[1.5rem] border-8 border-foreground/80 shadow-xl" : ""} overflow-hidden`}>
              {source.kind === "react" ? (
                <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-muted-foreground">Starting React runtime…</div>}>
                  <ReactAppRunner files={source.files} apiKey={apiKey} bare={device !== "desktop"} />
                </Suspense>
              ) : source.kind === "html" ? (
                <iframe title="App preview" srcDoc={source.code} sandbox="allow-scripts allow-forms allow-modals" className="h-full w-full rounded-xl border border-border bg-card" />
              ) : (
                <div className="flex h-full w-full items-center justify-center rounded-xl border-2 border-dashed border-border px-6 text-center text-muted-foreground">Your live app preview will appear here</div>
              )}
            </div>
          </div>

          {panel && (
            <aside className="absolute inset-y-0 right-0 z-10 flex w-full max-w-xl flex-col border-l border-border bg-background shadow-2xl">
              <div className="flex items-center justify-between border-b border-border px-4 py-2">
                <span className="text-sm font-medium">{panel === "code" ? "Code" : panel === "history" ? "Version history" : "Secrets"}</span>
                <button onClick={() => setPanel(null)} aria-label="Close panel" className={iconBtn(false)}><X className="size-4" /></button>
              </div>
              {panel === "code" && (source.kind === "react" ? (
                <div className="flex min-h-0 flex-1">
                  <div className="w-44 shrink-0 overflow-y-auto border-r border-border p-2">
                    {fileNames.map((path) => (
                      <button key={path} onClick={() => setSelectedFile(path)} className={`flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left font-mono text-[11px] ${activeFile === path ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>
                        <FileCode2 className="size-3 shrink-0" /> <span className="truncate">{path}</span>
                      </button>
                    ))}
                  </div>
                  <textarea aria-label={`Edit ${activeFile}`} value={source.files[activeFile] ?? ""} onChange={(e) => editFile(e.target.value)} spellCheck={false} className="min-h-0 flex-1 resize-none bg-card p-3 font-mono text-xs leading-5 text-card-foreground outline-none" />
                </div>
              ) : <p className="p-4 text-sm text-muted-foreground">Build an app to see its files here.</p>)}
              {panel === "history" && (
                <div className="flex-1 space-y-2 overflow-y-auto p-4">
                  {versions.length === 0 && <p className="text-sm text-muted-foreground">Each build saves a version here.</p>}
                  {versions.map((v, i) => (
                    <div key={v.id} className="rounded-lg border border-border p-3">
                      <div className="text-sm">{v.label || "Version"}</div>
                      <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                        <span>{new Date(v.created_at).toLocaleString()}{i === 0 ? " · latest" : ""}</span>
                        <button onClick={() => restore(v)} disabled={v.code === code} className="rounded-md border border-border px-2 py-1 text-foreground disabled:opacity-40">{v.code === code ? "Current" : "Restore"}</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {panel === "secrets" && <SecretsPanel id={id} wsKey={wsKey} secrets={secrets} reload={loadSecrets} />}
            </aside>
          )}
        </section>
      </main>
    </div>
  );
}

function SecretsPanel({ id, wsKey, secrets, reload }: { id: string; wsKey: string; secrets: { name: string; allowed_host: string }[]; reload: () => void }) {
  const [n, setN] = useState("");
  const [v, setV] = useState("");
  const [h, setH] = useState("");
  const [err, setErr] = useState("");
  const save = async () => {
    setErr("");
    try {
      await setSecret({ data: { key: wsKey, id, name: n.trim().toUpperCase(), value: v, allowedHost: h.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "") } });
      setN(""); setV(""); setH("");
      reload();
    } catch {
      setErr("Use a NAME like OPENAI_API_KEY, a value, and a domain like api.openai.com.");
    }
  };
  return (
    <div className="flex-1 space-y-4 overflow-y-auto p-4 text-sm">
      <p className="text-muted-foreground">Secret keys stay on FindMit's server. Your app uses them as {"{{NAME}}"} through findmit.proxy, and each key is only sent to its allowed domain.</p>
      <div className="space-y-2 rounded-lg border border-border p-3">
        <input value={n} onChange={(e) => setN(e.target.value)} placeholder="NAME (e.g. OPENAI_API_KEY)" className="w-full rounded border border-input bg-background px-2 py-1.5 font-mono text-xs" />
        <input value={v} onChange={(e) => setV(e.target.value)} type="password" placeholder="Secret value" className="w-full rounded border border-input bg-background px-2 py-1.5 text-xs" />
        <input value={h} onChange={(e) => setH(e.target.value)} placeholder="Allowed domain (e.g. api.openai.com)" className="w-full rounded border border-input bg-background px-2 py-1.5 text-xs" />
        <button onClick={save} disabled={!n || !v || !h} className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50">Save secret</button>
        {err && <p className="text-xs text-destructive">{err}</p>}
      </div>
      {secrets.map((s) => (
        <div key={s.name} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
          <div>
            <div className="font-mono text-xs">{s.name}</div>
            <div className="text-xs text-muted-foreground">•••••••• → {s.allowed_host}</div>
          </div>
          <button onClick={() => deleteSecret({ data: { key: wsKey, id, name: s.name } }).then(reload)} className="text-xs text-destructive">Delete</button>
        </div>
      ))}
    </div>
  );
}
