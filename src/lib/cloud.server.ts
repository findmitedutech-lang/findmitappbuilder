// Server-only helpers shared by FindMit server functions and public API routes.
export async function sha256(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function randomToken(bytes = 24) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return Array.from(a).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hashPassword(password: string, salt = randomToken(16)) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: new TextEncoder().encode(salt), iterations: 100_000, hash: "SHA-256" },
    key,
    256,
  );
  const hex = Array.from(new Uint8Array(bits)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${salt}:${hex}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [salt] = stored.split(":");
  if (!salt) return false;
  return (await hashPassword(password, salt)) === stored;
}

export async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Throws unless the workspace key owns the project (or the project does not exist yet and allowNew). */
export async function assertOwner(workspaceKey: string, projectId: string, allowNew = false) {
  const db = await admin();
  const hash = await sha256(workspaceKey);
  const { data } = await db.from("builder_projects").select("workspace_hash").eq("id", projectId).maybeSingle();
  if (!data) {
    if (allowNew) return hash;
    throw new Error("Project not found");
  }
  if (data.workspace_hash !== hash) throw new Error("Not allowed");
  return hash;
}

export async function ensureTenant(projectId: string) {
  const db = await admin();
  const { data } = await db.from("app_tenants").select("api_key").eq("project_id", projectId).maybeSingle();
  if (data) return data.api_key;
  const api_key = `fm_${randomToken(20)}`;
  await db.from("app_tenants").insert({ project_id: projectId, api_key });
  return api_key;
}

export async function tenantFromRequest(request: Request) {
  const key = request.headers.get("x-findmit-key") ?? "";
  if (!/^fm_[0-9a-f]{40}$/.test(key)) return null;
  const db = await admin();
  const { data } = await db.from("app_tenants").select("project_id").eq("api_key", key).maybeSingle();
  return data?.project_id ?? null;
}

export async function sessionUser(request: Request, appId: string) {
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const db = await admin();
  const { data } = await db.from("app_sessions").select("user_id, expires_at").eq("token", await sha256(token)).eq("app_id", appId).maybeSingle();
  if (!data || new Date(data.expires_at).getTime() < Date.now()) return null;
  return data.user_id;
}

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, x-findmit-key, authorization",
};

export const json = (body: unknown, status = 200) => Response.json(body, { status, headers: CORS });
