/** Builds the /findmit.ts file injected into every generated app so it can use FindMit Cloud. */
export function buildSdkFile(apiBase: string, apiKey: string) {
  return `// FindMit Cloud SDK — injected automatically. Do not edit.
const BASE = ${JSON.stringify(apiBase)};
const KEY = ${JSON.stringify(apiKey)};
const SKEY = "findmit-session-" + KEY.slice(-8);

export type FindMitUser = { id: string; email: string; name: string };
type Rec = { id: string; ownerId: string | null; createdAt: string; [k: string]: unknown };

const token = () => { try { return localStorage.getItem(SKEY) || ""; } catch { return ""; } };
const listeners = new Set<(u: FindMitUser | null) => void>();

async function call(path: string, body: unknown) {
  if (!KEY) throw new Error("FindMit Cloud is not connected for this app yet.");
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: { "content-type": "application/json", "x-findmit-key": KEY, ...(token() ? { authorization: "Bearer " + token() } : {}) },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

function setSession(t: string | null, user: FindMitUser | null) {
  try { t ? localStorage.setItem(SKEY, t) : localStorage.removeItem(SKEY); } catch {}
  listeners.forEach((l) => l(user));
}

export const findmit = {
  auth: {
    async signUp(email: string, password: string, name = ""): Promise<FindMitUser> {
      const r = await call("/auth", { action: "signUp", email, password, name }); setSession(r.token, r.user); return r.user;
    },
    async signIn(email: string, password: string): Promise<FindMitUser> {
      const r = await call("/auth", { action: "signIn", email, password }); setSession(r.token, r.user); return r.user;
    },
    async signOut() { try { await call("/auth", { action: "signOut" }); } finally { setSession(null, null); } },
    async getUser(): Promise<FindMitUser | null> {
      if (!token()) return null;
      const r = await call("/auth", { action: "me" }); return r.user;
    },
    onChange(fn: (u: FindMitUser | null) => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
  },
  db: {
    async list(collection: string, opts: { mine?: boolean; limit?: number } = {}): Promise<Rec[]> {
      return (await call("/data", { action: "list", collection, ...opts })).records;
    },
    async create(collection: string, data: Record<string, unknown>): Promise<Rec> {
      return (await call("/data", { action: "create", collection, data })).record;
    },
    async update(collection: string, id: string, data: Record<string, unknown>) { await call("/data", { action: "update", collection, id, data }); },
    async remove(collection: string, id: string) { await call("/data", { action: "delete", collection, id }); },
  },
  /** Call a third-party API. Use {{SECRET_NAME}} in url/headers/body; FindMit fills it in on the server. */
  async proxy(url: string, init: { method?: string; headers?: Record<string, string>; body?: string } = {}) {
    const res = await fetch(BASE + "/proxy", {
      method: "POST",
      headers: { "content-type": "application/json", "x-findmit-key": KEY },
      body: JSON.stringify({ url, method: init.method || "GET", headers: init.headers, body: init.body }),
    });
    return res;
  },
};
export default findmit;
`;
}
