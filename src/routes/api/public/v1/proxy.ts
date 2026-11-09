import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { CORS, admin, json, tenantFromRequest } from "@/lib/cloud.server";

const Body = z.object({
  url: z.string().url().max(2000),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).default("GET"),
  headers: z.record(z.string(), z.string().max(4000)).optional(),
  body: z.string().max(500_000).optional(),
});

// Secrets are referenced as {{SECRET_NAME}} and only substituted when the target host matches the secret's allowed host.
export const Route = createFileRoute("/api/public/v1/proxy")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const appId = await tenantFromRequest(request);
        if (!appId) return json({ error: "Invalid app key" }, 401);
        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return json({ error: "Invalid request" }, 400);
        const b = parsed.data;
        const target = new URL(b.url);
        if (target.protocol !== "https:") return json({ error: "Only https URLs are allowed" }, 400);
        const host = target.hostname.toLowerCase();
        const db = await admin();
        const { data: secrets } = await db.from("project_secrets").select("name, value, allowed_host").eq("project_id", appId);
        const map = new Map((secrets ?? []).map((s) => [s.name, s]));
        let blocked = "";
        const fill = (s: string) =>
          s.replace(/\{\{([A-Z][A-Z0-9_]*)\}\}/g, (_, name: string) => {
            const sec = map.get(name);
            if (!sec) { blocked = `Secret ${name} is not set`; return ""; }
            if (host !== sec.allowed_host && !host.endsWith(`.${sec.allowed_host}`)) { blocked = `Secret ${name} can only be sent to ${sec.allowed_host}`; return ""; }
            return sec.value;
          });
        const url = fill(b.url);
        const headers = Object.fromEntries(Object.entries(b.headers ?? {}).map(([k, v]) => [k, fill(v)]));
        const body = b.body ? fill(b.body) : undefined;
        if (blocked) return json({ error: blocked }, 400);
        try {
          const res = await fetch(url, { method: b.method, headers, body: b.method === "GET" ? undefined : body });
          const text = await res.text();
          return new Response(text, { status: res.status, headers: { ...CORS, "content-type": res.headers.get("content-type") ?? "text/plain" } });
        } catch {
          return json({ error: "Upstream request failed" }, 502);
        }
      },
    },
  },
});
