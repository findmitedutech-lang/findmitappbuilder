import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { CORS, admin, hashPassword, json, randomToken, sessionUser, sha256, tenantFromRequest, verifyPassword } from "@/lib/cloud.server";

const Body = z.object({
  action: z.enum(["signUp", "signIn", "me", "signOut"]),
  email: z.string().email().max(200).optional(),
  password: z.string().min(6).max(200).optional(),
  name: z.string().max(100).optional(),
});

async function startSession(appId: string, userId: string) {
  const token = randomToken(32);
  const db = await admin();
  await db.from("app_sessions").insert({ token: await sha256(token), app_id: appId, user_id: userId, expires_at: new Date(Date.now() + 30 * 864e5).toISOString() });
  return token;
}

export const Route = createFileRoute("/api/public/v1/auth")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const appId = await tenantFromRequest(request);
        if (!appId) return json({ error: "Invalid app key" }, 401);
        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return json({ error: "Enter a valid email and a password of at least 6 characters." }, 400);
        const b = parsed.data;
        const db = await admin();
        if (b.action === "signUp" || b.action === "signIn") {
          if (!b.email || !b.password) return json({ error: "Email and password required" }, 400);
          const email = b.email.toLowerCase();
          const { data: existing } = await db.from("app_users").select("id, email, name, password_hash").eq("app_id", appId).eq("email", email).maybeSingle();
          if (b.action === "signUp") {
            if (existing) return json({ error: "An account with this email already exists." }, 409);
            const { data: u, error } = await db.from("app_users").insert({ app_id: appId, email, name: b.name ?? "", password_hash: await hashPassword(b.password) }).select("id, email, name").single();
            if (error) return json({ error: "Could not create account" }, 500);
            return json({ user: u, token: await startSession(appId, u.id) });
          }
          if (!existing || !(await verifyPassword(b.password, existing.password_hash))) return json({ error: "Wrong email or password." }, 401);
          return json({ user: { id: existing.id, email: existing.email, name: existing.name }, token: await startSession(appId, existing.id) });
        }
        const userId = await sessionUser(request, appId);
        if (b.action === "signOut") {
          const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
          if (token) await db.from("app_sessions").delete().eq("token", await sha256(token));
          return json({ ok: true });
        }
        if (!userId) return json({ user: null });
        const { data: u } = await db.from("app_users").select("id, email, name").eq("id", userId).maybeSingle();
        return json({ user: u ?? null });
      },
    },
  },
});
