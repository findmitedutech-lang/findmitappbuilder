import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const SYSTEM = `You are FindMit, an expert web app builder. Produce ONE complete, self-contained HTML document (inline <style> and <script>, CDN libraries allowed, e.g. Tailwind CDN) that implements the user's request. If existing code is provided, modify it according to the request. Reply with ONLY the HTML document, no markdown fences, no explanation.`;

export const generateApp = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({ prompt: z.string().min(1).max(4000), currentCode: z.string().max(200000).optional() }).parse(d),
  )
  .handler(async ({ data }) => {
    const key = process.env["GOOGLE_API_KEY"];
    if (!key) return { ok: false as const, error: "Gemini key is missing." };
    const userText = data.currentCode
      ? `Existing code:\n${data.currentCode}\n\nRequest: ${data.prompt}`
      : data.prompt;
    try {
      const res = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: SYSTEM }] },
            contents: [{ role: "user", parts: [{ text: userText }] }],
          }),
        },
      );
      if (!res.ok) {
        console.error("Gemini error", res.status, await res.text());
        return { ok: false as const, error: `Gemini request failed (${res.status}).` };
      }
      const json = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      let code = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
      code = code.replace(/^\s*```(?:html)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
      if (!code) return { ok: false as const, error: "Gemini returned no code." };
      return { ok: true as const, code };
    } catch (e) {
      console.error(e);
      return { ok: false as const, error: "Could not reach Gemini." };
    }
  });
