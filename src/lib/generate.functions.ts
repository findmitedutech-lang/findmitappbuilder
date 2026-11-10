import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { parseGeneratedProject, parseProjectSource } from "@/lib/react-project";

const BUILD_SYSTEM = `You are FindMit, an expert React app builder. Build or modify a complete multi-file React TypeScript application.

Return ONLY one JSON object with this shape, without markdown fences or explanation:
{"files":{"/App.tsx":"...","/index.tsx":"...","/styles.css":"..."},"deleted":[],"summary":"One short sentence about the change"}

Project rules:
- Always include /App.tsx, /index.tsx, and /styles.css. Add focused component files under /components/ when useful.
- The runner supplies React 19, React DOM, lucide-react, @tanstack/react-router, and Tailwind CSS. If another npm package is essential, include /package.json with a dependencies object and exact compatible versions.
- /index.tsx must mount the app with createRoot and import /styles.css.
- Build real multi-screen navigation with @tanstack/react-router when the app has multiple pages. Use a hash history so navigation works inside the preview. Use Link and Outlet correctly; every parent route renders Outlet.
- Use functional interactions, forms, buttons, navigation, and local React state. Persist useful local data with localStorage inside effects or event handlers.
- FindMit Cloud is built in. A file /findmit.ts is injected automatically (never create or return it). Import it with: import { findmit } from "./findmit" (adjust the relative path from subfolders, e.g. "../findmit").
  - Real accounts: await findmit.auth.signUp(email, password, name), findmit.auth.signIn(email, password), findmit.auth.signOut(), findmit.auth.getUser() (returns {id,email,name} or null), findmit.auth.onChange(cb).
  - Real shared database: await findmit.db.list(collection, { mine?: boolean }), findmit.db.create(collection, data) (returns the record with id, ownerId, createdAt), findmit.db.update(collection, id, data), findmit.db.remove(collection, id). Records created while signed in are owned by that user.
  - Third-party APIs with secret keys: await findmit.proxy(url, { method, headers, body }) and write secrets as {{SECRET_NAME}} placeholders, never real keys. Never use Firebase, Supabase, or placeholder API keys.
  - Use findmit.auth for any sign-in/sign-up and findmit.db for any data that should be shared or survive across devices (chat messages, posts, orders). Wrap calls in try/catch and show errors in the UI.
- Use Tailwind utility classes and lucide-react icons. Do not use external image URLs unless the user supplied them.
- When existing project files are provided, make a targeted change: return ONLY the files you add or change (each with COMPLETE contents), list removed paths in "deleted", and preserve all other working features. When starting from scratch, return every file.
- Do not return HTML documents, markdown, comments outside the JSON, ellipses, or truncated files.`;

const CHAT_SYSTEM = `You are FindMit in Chat mode: a friendly product and design advisor helping the user plan a multi-file React app before building it. Answer in plain, short language (no code blocks, no HTML). Ask clarifying questions when helpful and suggest concrete ideas. You cannot change the app in this mode.
When the conversation has reached something concrete that could be built or changed, end your reply with a final line exactly in this format:
BUILD_PROMPT: <one clear, self-contained instruction describing what to build or change>
Only include that line when there is something ready to implement.`;

const Hist = z.array(z.object({ role: z.enum(["user", "ai"]), text: z.string().max(8000) })).max(40);

async function callGemini(key: string, system: string, contents: unknown[], jsonMode = false) {
  const res = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents,
        ...(jsonMode
          ? {
              generationConfig: {
                responseMimeType: "application/json",
                responseJsonSchema: {
                  type: "OBJECT",
                  properties: {
                    files: { type: "OBJECT", additionalProperties: { type: "STRING" } },
                    summary: { type: "STRING" },
                    deleted: { type: "ARRAY", items: { type: "STRING" } },
                  },
                  required: ["files"],
                },
                maxOutputTokens: 65536,
              },
            }
          : {}),
      }),
    },
  );
  if (!res.ok) {
    console.error("Gemini error", res.status, await res.text());
    throw new Error(`Gemini request failed (${res.status}).`);
  }
  const json = (await res.json()) as {
    candidates?: { finishReason?: string; content?: { parts?: { text?: string; thought?: boolean }[] } }[];
  };
  const candidate = json.candidates?.[0];
  if (candidate?.finishReason === "MAX_TOKENS") throw new Error("The app was too large for one response. Ask for a smaller app or fewer features.");
  return candidate?.content?.parts?.filter((p) => !p.thought).map((p) => p.text ?? "").join("") ?? "";
}

export const generateApp = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        prompt: z.string().min(1).max(4000),
        currentCode: z.string().max(2_000_000).optional(),
        mode: z.enum(["chat", "build"]).default("build"),
        history: Hist.optional(),
        secretNames: z.array(z.string().max(64)).max(50).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const key = process.env["GOOGLE_API_KEY"];
    if (!key) return { ok: false as const, error: "Gemini key is missing." };
    try {
      if (data.mode === "chat") {
        const contents = [
          ...(data.history ?? []).map((m) => ({ role: m.role === "ai" ? "model" : "user", parts: [{ text: m.text }] })),
          {
            role: "user",
            parts: [{ text: (data.currentCode ? "(The user already has an app built.)\n" : "") + data.prompt }],
          },
        ];
        const text = (await callGemini(key, CHAT_SYSTEM, contents)).trim();
        const m = text.match(/\n?BUILD_PROMPT:\s*(.+)\s*$/);
        const reply = m ? text.slice(0, m.index).trim() : text;
        return { ok: true as const, mode: "chat" as const, text: reply || "Ready to build this.", suggest: m?.[1]?.trim() };
      }

      const existing = data.currentCode ? parseProjectSource(data.currentCode) : { kind: "empty" as const };
      const secretsNote = `\nSecrets configured in the vault (use as {{NAME}} via findmit.proxy): ${data.secretNames?.length ? data.secretNames.join(", ") : "none"}. If the request needs a secret that is missing, still build it with a {{NAME}} placeholder and mention in the summary that the user must add NAME in the Secrets panel.`;
      const userText =
        existing.kind === "react"
          ? `Existing project files (JSON):\n${JSON.stringify(existing.files)}\n\nRequest: ${data.prompt}\n\nReturn only changed/new files plus deleted paths.${secretsNote}`
          : existing.kind === "html"
            ? `Existing legacy HTML app:\n${existing.code}\n\nRequest: ${data.prompt}\n\nReturn the complete app in the multi-file React JSON format, preserving its design and behavior.${secretsNote}`
            : data.prompt + secretsNote;
      const merge = (raw: string) => {
        if (existing.kind !== "react") return { text: raw, summary: "" };
        const cleaned = raw.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
        const obj = JSON.parse(cleaned.slice(cleaned.indexOf("{"), cleaned.lastIndexOf("}") + 1)) as { files?: Record<string, string>; deleted?: string[]; summary?: string };
        const files: Record<string, string> = { ...existing.files };
        for (const d of obj.deleted ?? []) delete files[d.startsWith("/") ? d : `/${d}`];
        for (const [k, v] of Object.entries(obj.files ?? {})) files[k.startsWith("/") ? k : `/${k}`] = v;
        delete files["/findmit.ts"];
        return { text: JSON.stringify({ files }), summary: obj.summary ?? "", changed: Object.keys(obj.files ?? {}) };
      };
      const summaryOf = (raw: string) => {
        try { return (JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)) as { summary?: string }).summary ?? ""; } catch { return ""; }
      };
      const { validateReactFiles } = await import("@/lib/validate-react-project.server");
      let response = await callGemini(key, BUILD_SYSTEM, [{ role: "user", parts: [{ text: userText }] }], true);
      let issues: string[] = [];

      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const merged = merge(response);
          const project = parseGeneratedProject(merged.text);
          delete project.files["/findmit.ts"];
          issues = validateReactFiles(project.files);
          if (!issues.length) {
            if (project.code.length > 2_000_000) return { ok: false as const, error: "The generated project is too large. Ask for a smaller app." };
            const changed = "changed" in merged ? merged.changed : Object.keys(project.files);
            return { ok: true as const, mode: "build" as const, code: project.code, summary: merged.summary || summaryOf(response), changed: changed ?? [] };
          }
        } catch (error) {
          issues = [error instanceof Error ? error.message : "The response was not a valid project."];
        }

        console.warn("Gemini project response needs repair", issues);
        if (attempt < 2) {
          response = await callGemini(
            key,
            `${BUILD_SYSTEM}\nThe previous response contained errors. Repair it now. Check every JSX opening and closing tag, every import, and every JSON string. Return every complete file and nothing except the valid JSON object.`,
            [{
              role: "user",
              parts: [{ text: `Original request:\n${userText}\n\nErrors to fix:\n${issues.join("\n")}\n\nPrevious response:\n${response}` }],
            }],
            true,
          );
        }
      }

      return { ok: false as const, error: "Gemini could not finish valid React files. Please try a smaller request." };
    } catch (e) {
      console.error(e);
      return { ok: false as const, error: e instanceof Error ? e.message : "Could not reach Gemini." };
    }
  });
