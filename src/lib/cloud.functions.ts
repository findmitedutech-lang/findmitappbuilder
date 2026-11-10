import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Key = z.string().min(32).max(200);
const Id = z.string().uuid();

export const cloudListProjects = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ key: Key }).parse(d))
  .handler(async ({ data }) => {
    const { admin, sha256 } = await import("./cloud.server");
    const db = await admin();
    const { data: rows } = await db.from("builder_projects").select("data").eq("workspace_hash", await sha256(data.key)).order("updated_at", { ascending: false });
    return JSON.stringify((rows ?? []).map((r) => r.data));
  });

export const cloudSaveProject = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ key: Key, id: Id, project: z.record(z.string(), z.unknown()) }).parse(d))
  .handler(async ({ data }) => {
    const { admin, assertOwner } = await import("./cloud.server");
    const hash = await assertOwner(data.key, data.id, true);
    if (JSON.stringify(data.project).length > 4_000_000) throw new Error("Project too large");
    const db = await admin();
    const { error } = await db.from("builder_projects").upsert({ id: data.id, workspace_hash: hash, data: data.project as never, updated_at: new Date().toISOString() });
    if (error) throw new Error("Could not save");
    return { ok: true };
  });

export const cloudDeleteProject = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ key: Key, id: Id }).parse(d))
  .handler(async ({ data }) => {
    const { admin, assertOwner } = await import("./cloud.server");
    await assertOwner(data.key, data.id);
    const db = await admin();
    await db.from("builder_projects").delete().eq("id", data.id);
    await db.from("project_versions").delete().eq("project_id", data.id);
    await db.from("project_secrets").delete().eq("project_id", data.id);
    return { ok: true };
  });

export const listVersions = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ key: Key, id: Id }).parse(d))
  .handler(async ({ data }) => {
    const { admin, assertOwner } = await import("./cloud.server");
    await assertOwner(data.key, data.id);
    const db = await admin();
    const { data: rows } = await db.from("project_versions").select("id, label, code, created_at").eq("project_id", data.id).order("created_at", { ascending: false }).limit(50);
    return rows ?? [];
  });

export const addVersion = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ key: Key, id: Id, label: z.string().max(300), code: z.string().max(2_000_000) }).parse(d))
  .handler(async ({ data }) => {
    const { admin, assertOwner } = await import("./cloud.server");
    await assertOwner(data.key, data.id);
    const db = await admin();
    await db.from("project_versions").insert({ project_id: data.id, label: data.label, code: data.code });
    return { ok: true };
  });

export const getAppKey = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ key: Key, id: Id }).parse(d))
  .handler(async ({ data }) => {
    const { assertOwner, ensureTenant } = await import("./cloud.server");
    await assertOwner(data.key, data.id);
    return { apiKey: await ensureTenant(data.id) };
  });

export const listSecrets = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ key: Key, id: Id }).parse(d))
  .handler(async ({ data }) => {
    const { admin, assertOwner } = await import("./cloud.server");
    await assertOwner(data.key, data.id);
    const db = await admin();
    const { data: rows } = await db.from("project_secrets").select("name, allowed_host, updated_at").eq("project_id", data.id).order("name");
    return rows ?? [];
  });

export const setSecret = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({
      key: Key, id: Id,
      name: z.string().regex(/^[A-Z][A-Z0-9_]{1,63}$/),
      value: z.string().min(1).max(4000),
      allowedHost: z.string().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/i).max(200),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const { admin, assertOwner } = await import("./cloud.server");
    await assertOwner(data.key, data.id);
    const db = await admin();
    const { error } = await db.from("project_secrets").upsert(
      { project_id: data.id, name: data.name, value: data.value, allowed_host: data.allowedHost.toLowerCase(), updated_at: new Date().toISOString() },
      { onConflict: "project_id,name" },
    );
    if (error) throw new Error("Could not save secret");
    return { ok: true };
  });

export const deleteSecret = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ key: Key, id: Id, name: z.string().max(64) }).parse(d))
  .handler(async ({ data }) => {
    const { admin, assertOwner } = await import("./cloud.server");
    await assertOwner(data.key, data.id);
    const db = await admin();
    await db.from("project_secrets").delete().eq("project_id", data.id).eq("name", data.name);
    return { ok: true };
  });
