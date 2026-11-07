import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const BUILD_SYSTEM = `You are FindMit, an expert web app builder. Produce ONE complete, self-contained HTML document (inline <style> and <script>, CDN libraries allowed, e.g. Tailwind CDN) that implements the user's request. If existing code is provided, modify it according to the request. Reply with ONLY the HTML document, no markdown fences, no explanation.`;

const CHAT_SYSTEM = `You are FindMit in Chat mode: a friendly product and design advisor helping the user plan an app before building it. Answer in plain, short language (no code blocks, no HTML). Ask clarifying questions when helpful and suggest concrete ideas. You cannot change the app in this mode.
When the conversation has reached something concrete that could be built or changed, end your reply with a final line exactly in this format:
BUILD_PROMPT: <one clear, self-contained instruction describing what to build or change>
Only include that line when there is something ready to implement.`;

const Hist = z.array(z.object({ role: z.enum(["user", "ai"]), text: z.string().max(8000) })).max(40);

async function callGemini(key: string, system: string, contents: unknown[]) {
  const res = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents }),
    },
  );
  if (!res.ok) {
    console.error("Gemini error", res.status, await res.text());
    throw new Error(`Gemini request failed (${res.status}).`);
  }
  const json = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  return json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
}

export const generateApp = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        prompt: z.string().min(1).max(4000),
        currentCode: z.string().max(200000).optional(),
        mode: z.enum(["chat", "build"]).default("build"),
        history: Hist.optional(),
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
      const userText = data.currentCode ? `Existing code:\n${data.currentCode}\n\nRequest: ${data.prompt}` : data.prompt;
      let code = await callGemini(key, BUILD_SYSTEM, [{ role: "user", parts: [{ text: userText }] }]);
      code = code.replace(/^\s*```(?:html)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
      if (!code) return { ok: false as const, error: "Gemini returned no code." };
      return { ok: true as const, mode: "build" as const, code };
    } catch (e) {
      console.error(e);
      return { ok: false as const, error: e instanceof Error ? e.message : "Could not reach Gemini." };
    }
  });
