// push-send: nodo's push notifications (approved 16 Nov 2026). Decides per person with plan.js and sends through
// Apple's push service (APNs). Started by pg_cron every weekday at :30 (see supabase/push.sql).
//
// Calls:
//   cron   header x-nodo-cron = push_settings.cron_secret, body {}   the scheduled run
//          body { dry: true }                                          same run, nothing sent or written (returns the plan)
//   admin  Authorization: Bearer <signed-in admin's token>, body { test: true }
//          sends "nodo test" to the admin's own phones, to check the setup end to end
//
// Secrets (Supabase > Edge Functions > Secrets): APNS_KEY_ID, APNS_PRIVATE_KEY (the .p8 text), APNS_TEAM_ID
// (falls back to APPLE_TEAM_ID). Optional APNS_TOPIC (default eu.getnodo.app). The cron secret is generated in
// public.push_settings.cron_secret (service role only), which the pg_cron job also reads.
// Deployed with verify_jwt off: it checks the cron secret or the admin itself.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { brussels, planFor } from "./plan.js";

const DATA = "https://gianmariasisti-afk.github.io/nodo-data/v1/";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const env = (n: string, fallback?: string) => {
  const v = (Deno.env.get(n) ?? (fallback ? Deno.env.get(fallback) : undefined))?.trim();
  if (!v) throw new Error(`Missing secret ${n}`);
  return v;
};

/* ---------- APNs ---------- */
const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64urlJson = (o: unknown) => b64url(new TextEncoder().encode(JSON.stringify(o)));
let jwtCache: { token: string; at: number } | null = null;
async function apnsJwt(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (jwtCache && now - jwtCache.at < 40 * 60) return jwtCache.token; // Apple accepts a token for up to an hour
  const pem = env("APNS_PRIVATE_KEY").replace(/\\n/g, "\n");
  const der = Uint8Array.from(atob(pem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "").replace(/\s+/g, "")), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const head = b64urlJson({ alg: "ES256", kid: env("APNS_KEY_ID") });
  const claims = b64urlJson({ iss: env("APNS_TEAM_ID", "APPLE_TEAM_ID"), iat: now });
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(`${head}.${claims}`)));
  jwtCache = { token: `${head}.${claims}.${b64url(sig)}`, at: now };
  return jwtCache.token;
}

type Msg = { kind: string; title: string; body: string; event_ids: string[]; file_ids: string[] };
type Device = { token: string; user_id: string; env: string; platform: string };

/** Sends one notification to one phone. gone = Apple says the token is dead: remove the device. */
async function apns(d: Device, m: Msg): Promise<{ ok: boolean; gone?: boolean; reason?: string }> {
  if (d.platform !== "ios") return { ok: false, reason: "platform not supported yet" };
  const host = d.env === "sandbox" ? "https://api.sandbox.push.apple.com" : "https://api.push.apple.com";
  const payload = {
    aps: { alert: { title: m.title, body: m.body }, "thread-id": `nodo-${m.kind}`, ...(m.kind === "move" || m.kind === "test" ? { sound: "default" } : {}) },
    nodo: { kind: m.kind, files: m.file_ids.slice(0, 20) },
  };
  const res = await fetch(`${host}/3/device/${d.token}`, {
    method: "POST",
    headers: {
      authorization: `bearer ${await apnsJwt()}`,
      "apns-topic": Deno.env.get("APNS_TOPIC")?.trim() || "eu.getnodo.app",
      "apns-push-type": "alert",
      "apns-priority": m.kind === "move" || m.kind === "test" ? "10" : "5",
      "apns-expiration": String(Math.floor(Date.now() / 1000) + 12 * 3600),
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (res.ok) return { ok: true };
  const reason = ((await res.json().catch(() => ({}))) as { reason?: string }).reason || `HTTP ${res.status}`;
  return { ok: false, reason, gone: res.status === 410 || reason === "BadDeviceToken" || reason === "Unregistered" || reason === "DeviceTokenNotForTopic" };
}

/* ---------- data ---------- */
async function getJson(path: string) {
  const res = await fetch(DATA + path + "?t=" + Date.now(), { headers: { "cache-control": "no-cache" } });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

type Upd = { id: string; fileId: string; kind: string; title: string; date?: string; personId?: string; firstSeen?: string };

async function loadUpdates(db: ReturnType<typeof createClient>, write: boolean) {
  const [u, files, press] = await Promise.all([getJson("updates/updates.json"), getJson("files.json"), getJson("press.json").catch(() => ({ files: {} }))]);
  const list = Array.isArray(files) ? files : files.files || [];
  const fileBy: Record<string, unknown> = Object.fromEntries(list.map((f: { id: string }) => [f.id, f]));
  const events = (u.events || []) as Upd[];
  const scheduled = events.filter((e) => e.kind === "scheduled");
  const items: Upd[] = events.filter((e) => e.kind !== "scheduled");
  for (const [fileId, arr] of Object.entries(press.files || {})) {
    for (const p of arr as { id: string; date?: string; text?: string }[]) items.push({ id: "press:" + p.id, fileId, kind: "press", title: p.text || "", date: p.date });
  }

  // First-seen times: new ids get now; on the very first run everything is seeded as old.
  const ids = items.map((x) => x.id);
  const seen = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 300) {
    const { data, error } = await db.from("push_seen").select("id, first_seen").in("id", ids.slice(i, i + 300));
    if (error) throw error;
    (data || []).forEach((r: { id: string; first_seen: string }) => seen.set(r.id, r.first_seen));
  }
  const { count } = await db.from("push_seen").select("id", { count: "exact", head: true });
  const stamp = count ? new Date().toISOString() : "2000-01-01T00:00:00Z";
  const fresh = ids.filter((id) => !seen.has(id));
  if (write && fresh.length) {
    for (let i = 0; i < fresh.length; i += 500) {
      const { error } = await db.from("push_seen").upsert(fresh.slice(i, i + 500).map((id) => ({ id, first_seen: stamp })), { onConflict: "id", ignoreDuplicates: true });
      if (error) throw error;
    }
  }
  fresh.forEach((id) => seen.set(id, stamp));
  items.forEach((x) => (x.firstSeen = seen.get(x.id)));
  return { items, scheduled, fileBy, seeded: !count, newIds: count ? fresh.length : 0 };
}

/* ---------- runs ---------- */
async function testRun(db: ReturnType<typeof createClient>, userId: string) {
  const { data: devs } = await db.from("push_devices").select("token, user_id, env, platform").eq("user_id", userId);
  const m: Msg = { kind: "test", title: "nodo test", body: "Notifications reach this phone. Tapping this opens Today.", event_ids: [], file_ids: [] };
  const results = [];
  for (const d of (devs || []) as Device[]) {
    const r = await apns(d, m);
    if (r.gone) await db.from("push_devices").delete().eq("token", d.token);
    results.push({ env: d.env, ok: r.ok, reason: r.reason });
  }
  await db.from("push_log").insert({ user_id: userId, kind: "test", title: m.title, body: m.body, devices: results.length, delivered: results.filter((r) => r.ok).length, error: results.find((r) => !r.ok)?.reason ?? null });
  return { devices: results.length, results };
}

async function scheduledRun(db: ReturnType<typeof createClient>, dry: boolean, at?: string) {
  const now = at ? new Date(at) : new Date();
  const { data: set } = await db.from("push_settings").select("enabled, audience").eq("id", 1).maybeSingle();
  if (!set || !set.enabled) return { skipped: "turned off in push_settings" };
  const b = brussels(now);

  const data = await loadUpdates(db, !dry);
  if (b.dow > 5 || b.hour < 8 || b.hour > 18) return { skipped: "outside weekdays 08:00-19:00 Brussels", brussels: b, seeded: data.seeded, newIds: data.newIds };

  let q = db.from("push_devices").select("token, user_id, env, platform");
  if (set.audience === "admins") {
    const { data: ad } = await db.from("admins").select("user_id");
    q = q.in("user_id", (ad || []).map((a: { user_id: string }) => a.user_id));
  }
  const { data: devs, error: dErr } = await q;
  if (dErr) throw dErr;
  const byUser = new Map<string, Device[]>();
  for (const d of (devs || []) as Device[]) { if (!byUser.has(d.user_id)) byUser.set(d.user_id, []); byUser.get(d.user_id)!.push(d); }
  const users = [...byUser.keys()];
  if (!users.length) return { brussels: b, people: 0, sent: 0, seeded: data.seeded, newIds: data.newIds };

  const [{ data: states }, { data: logs }] = await Promise.all([
    db.from("user_state").select("user_id, body").in("user_id", users),
    db.from("push_log").select("user_id, sent_at, kind, event_ids").in("user_id", users).gte("sent_at", new Date(now.getTime() - 30 * 86400e3).toISOString()),
  ]);
  const bodyOf = new Map((states || []).map((s: { user_id: string; body: unknown }) => [s.user_id, s.body]));
  const out = { brussels: b, people: users.length, sent: 0, delivered: 0, removed: 0, seeded: data.seeded, newIds: data.newIds, plans: [] as unknown[] };

  for (const uid of users) {
    const m = planFor({ now, body: bodyOf.get(uid) || {}, updates: data.items, scheduled: data.scheduled, fileBy: data.fileBy, sent: (logs || []).filter((l: { user_id: string }) => l.user_id === uid) }) as Msg | null;
    if (!m) continue;
    if (dry) { out.plans.push({ user: uid.slice(0, 8), ...m }); continue; }
    let ok = 0, err: string | undefined;
    for (const d of byUser.get(uid)!) {
      try {
        const r = await apns(d, m);
        if (r.ok) ok++; else err = r.reason;
        if (r.gone) { await db.from("push_devices").delete().eq("token", d.token); out.removed++; }
      } catch (e) { err = String((e as Error).message || e).slice(0, 300); }
    }
    // Logged even when Apple refused, so a broken setup does not resend the same updates every hour.
    await db.from("push_log").insert({ user_id: uid, kind: m.kind, title: m.title, body: m.body, event_ids: m.event_ids, file_ids: m.file_ids, devices: byUser.get(uid)!.length, delivered: ok, error: err ?? null });
    out.sent++; if (ok) out.delivered++;
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
  const body = await req.json().catch(() => ({})) as { dry?: boolean; test?: boolean; at?: string };
  try {
    const cron = req.headers.get("x-nodo-cron");
    if (cron) {
      const { data: cs } = await db.from("push_settings").select("cron_secret").eq("id", 1).maybeSingle();
      if (!cs || !cs.cron_secret || cron !== cs.cron_secret) return json({ error: "forbidden" }, 403);
      return json(await scheduledRun(db, !!body.dry, body.dry ? body.at : undefined));
    }
    // Signed-in admin: test send to their own phones, or a dry run.
    const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: u } = await db.auth.getUser(token);
    if (!u?.user) return json({ error: "sign in first" }, 401);
    const { data: ad } = await db.from("admins").select("user_id").eq("user_id", u.user.id).maybeSingle();
    if (!ad) return json({ error: "admins only" }, 403);
    if (body.test) return json(await testRun(db, u.user.id));
    return json(await scheduledRun(db, true, body.at));
  } catch (e) {
    console.error(e);
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
