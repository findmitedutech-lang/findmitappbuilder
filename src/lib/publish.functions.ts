import { createServerFn } from "@tanstack/react-start";

export const publishApp = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string; name: string; code: string; token: string }) => {
    if (!/^[0-9a-f-]{36}$/i.test(d.id) || d.token.length < 20 || d.code.length > 2_000_000) throw new Error("Invalid input");
    return d;
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing } = await supabaseAdmin.from("published_apps").select("edit_token").eq("id", data.id).maybeSingle();
    if (existing && existing.edit_token !== data.token) return { ok: false as const, error: "Not allowed" };
    const published_at = new Date().toISOString();
    const { error } = await supabaseAdmin.from("published_apps").upsert({
      id: data.id, name: data.name.slice(0, 200), code: data.code, edit_token: data.token, published_at,
    });
    if (error) return { ok: false as const, error: "Could not publish" };
    return { ok: true as const, publishedAt: published_at };
  });

export const getPublishedApp = createServerFn({ method: "GET" })
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data }) => {
    if (!/^[0-9a-f-]{36}$/i.test(data.id)) return null;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin.from("published_apps").select("name, code").eq("id", data.id).maybeSingle();
    return row ?? null;
  });
