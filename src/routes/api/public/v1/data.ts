import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { CORS, admin, json, sessionUser, tenantFromRequest } from "@/lib/cloud.server";

const Body = z.object({
  action: z.enum(["list", "create", "update", "delete"]),
  collection: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/),
  id: z.string().uuid().optional(),
  data: z.record(z.string(), z.unknown()).optional(),
  mine: z.boolean().optional(),
  limit: z.number().int().min(1).max(500).optional(),
});

export const Route = createFileRoute("/api/public/v1/data")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const appId = await tenantFromRequest(request);
        if (!appId) return json({ error: "Invalid app key" }, 401);
        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return json({ error: "Invalid request" }, 400);
        const b = parsed.data;
        if (b.data && JSON.stringify(b.data).length > 100_000) return json({ error: "Record too large" }, 413);
        const userId = await sessionUser(request, appId);
        const db = await admin();
        if (b.action === "list") {
          let q = db.from("app_records").select("id, data, owner_id, created_at").eq("app_id", appId).eq("collection", b.collection).order("created_at", { ascending: false }).limit(b.limit ?? 200);
          if (b.mine) {
            if (!userId) return json({ error: "Sign in required" }, 401);
            q = q.eq("owner_id", userId);
          }
          const { data } = await q;
          return json({ records: (data ?? []).map((r) => ({ id: r.id, ownerId: r.owner_id, createdAt: r.created_at, ...(r.data as object) })) });
        }
        if (b.action === "create") {
          const { count } = await db.from("app_records").select("id", { count: "exact", head: true }).eq("app_id", appId);
          if ((count ?? 0) > 20_000) return json({ error: "Storage limit reached" }, 429);
          const { data, error } = await db.from("app_records").insert({ app_id: appId, collection: b.collection, owner_id: userId, data: (b.data ?? {}) as never }).select("id, created_at").single();
          if (error) return json({ error: "Could not save" }, 500);
          return json({ record: { id: data.id, ownerId: userId, createdAt: data.created_at, ...(b.data ?? {}) } });
        }
        if (!b.id) return json({ error: "id required" }, 400);
        const { data: row } = await db.from("app_records").select("owner_id").eq("id", b.id).eq("app_id", appId).eq("collection", b.collection).maybeSingle();
        if (!row) return json({ error: "Not found" }, 404);
        if (row.owner_id && row.owner_id !== userId) return json({ error: "Not allowed" }, 403);
        if (b.action === "update") {
          await db.from("app_records").update({ data: (b.data ?? {}) as never }).eq("id", b.id);
          return json({ ok: true });
        }
        await db.from("app_records").delete().eq("id", b.id);
        return json({ ok: true });
      },
    },
  },
});
