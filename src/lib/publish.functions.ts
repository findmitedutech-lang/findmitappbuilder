import { createServerFn } from "@tanstack/react-start";

const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/;

export function slugify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50) || "app";
}

export const publishApp = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string; name: string; code: string; token: string; slug: string }) => {
    if (!/^[0-9a-f-]{36}$/i.test(d.id) || d.token.length < 20 || d.code.length > 2_000_000 || !SLUG.test(d.slug)) throw new Error("Invalid input");
    return d;
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing } = await supabaseAdmin.from("published_apps").select("edit_token").eq("id", data.id).maybeSingle();
    if (existing && existing.edit_token !== data.token) return { ok: false as const, error: "Not allowed" };
    const { data: taken } = await supabaseAdmin.from("published_apps").select("id").eq("slug", data.slug).neq("id", data.id).maybeSingle();
    if (taken) return { ok: false as const, error: `The link "${data.slug}" is already taken. Choose another.` };
    const published_at = new Date().toISOString();
    const { error } = await supabaseAdmin.from("published_apps").upsert({
      id: data.id, name: data.name.slice(0, 200), code: data.code, edit_token: data.token, published_at, slug: data.slug,
    });
    if (error) return { ok: false as const, error: "Could not publish" };
    return { ok: true as const, publishedAt: published_at, slug: data.slug };
  });

export const checkSlug = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string; slug: string }) => d)
  .handler(async ({ data }) => {
    if (!SLUG.test(data.slug)) return { available: false };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: taken } = await supabaseAdmin.from("published_apps").select("id").eq("slug", data.slug).neq("id", data.id).maybeSingle();
    return { available: !taken };
  });

export const getPublishedApp = createServerFn({ method: "GET" })
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const isUuid = /^[0-9a-f-]{36}$/i.test(data.id);
    if (!isUuid && !SLUG.test(data.id)) return null;
    const { data: row } = await supabaseAdmin.from("published_apps").select("id, name, code").eq(isUuid ? "id" : "slug", data.id).maybeSingle();
    if (!row) return null;
    const { data: t } = await supabaseAdmin.from("app_tenants").select("api_key").eq("project_id", row.id).maybeSingle();
    return { name: row.name, code: row.code, apiKey: t?.api_key ?? "" };
  });
