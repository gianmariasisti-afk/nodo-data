// apple-revoke: revokes nodo's Sign in with Apple tokens when an Apple user deletes their account
// (App Store guideline 5.1.1(v)). Called by the iOS app (app/native/native.js) just before delete_my_account.
//
// Body: { code }  the authorizationCode from a fresh Sign in with Apple sheet.
// The code is exchanged at Apple for a refresh token, which is then revoked.
// Body: { check: true }  configuration check, no account needed: exchanges a dummy code and reports
// whether Apple accepted nodo's client secret ("invalid_grant" = key OK, "invalid_client" = key wrong).
//
// Secrets (Supabase > Edge Functions > Secrets): APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_CLIENT_ID, APPLE_PRIVATE_KEY.
import { createClient } from "jsr:@supabase/supabase-js@2";

const APPLE = "https://appleid.apple.com";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64urlJson = (o: unknown) => b64url(new TextEncoder().encode(JSON.stringify(o)));

function env(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing secret ${name}`);
  return v;
}

/** Apple's client secret: an ES256 JWT signed with the Sign in with Apple key, valid for 5 minutes. */
async function clientSecret(): Promise<string> {
  const pem = env("APPLE_PRIVATE_KEY").replace(/\\n/g, "\n");
  const body = pem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const now = Math.floor(Date.now() / 1000);
  const head = b64urlJson({ alg: "ES256", kid: env("APPLE_KEY_ID") });
  const claims = b64urlJson({ iss: env("APPLE_TEAM_ID"), iat: now, exp: now + 300, aud: APPLE, sub: env("APPLE_CLIENT_ID") });
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(`${head}.${claims}`)));
  return `${head}.${claims}.${b64url(sig)}`;
}

async function exchange(code: string, secret: string) {
  const res = await fetch(`${APPLE}/auth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: env("APPLE_CLIENT_ID"), client_secret: secret, code, grant_type: "authorization_code" }),
  });
  return { ok: res.ok, body: await res.json().catch(() => ({})) as Record<string, string> };
}

function jwtSub(token: string): string | null {
  try {
    const p = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(p + "=".repeat((4 - (p.length % 4)) % 4))).sub ?? null;
  } catch { return null; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  let input: { code?: string; check?: boolean } = {};
  try { input = await req.json(); } catch { /* empty body */ }

  if (input.check) {
    const need = ["APPLE_TEAM_ID", "APPLE_KEY_ID", "APPLE_CLIENT_ID", "APPLE_PRIVATE_KEY"];
    const missing = need.filter((n) => !Deno.env.get(n));
    if (missing.length) {
      const seen = Object.keys(Deno.env.toObject()).filter((k) => /apple|team|key_id|client_id|private/i.test(k) && !k.startsWith("SUPABASE_"));
      return json({ keyAccepted: false, missing, similarNamesFound: seen });
    }
  }

  try {
    const secret = await clientSecret();

    if (input.check) {
      const r = await exchange("nodo-config-check", secret);
      const err = r.body.error ?? "";
      return json({ keyAccepted: err === "invalid_grant", apple: err || "ok" });
    }

    const auth = req.headers.get("Authorization") ?? "";
    const sb = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), { global: { headers: { Authorization: auth } } });
    const { data, error } = await sb.auth.getUser();
    if (error || !data.user) return json({ error: "Not signed in" }, 401);

    const apple = (data.user.identities ?? []).find((i) => i.provider === "apple");
    if (!apple) return json({ revoked: false, reason: "no Apple sign-in on this account" });
    if (!input.code) return json({ error: "Missing code" }, 400);

    const r = await exchange(input.code, secret);
    if (!r.ok) return json({ error: "Apple refused the code", apple: r.body.error ?? "unknown" }, 502);

    // The code must belong to the Apple ID linked to this nodo account.
    const appleSub = (apple.identity_data as Record<string, string> | undefined)?.sub ?? apple.id;
    if (r.body.id_token && jwtSub(r.body.id_token) !== appleSub) return json({ error: "Apple ID does not match this account" }, 403);

    const token = r.body.refresh_token ?? r.body.access_token;
    const hint = r.body.refresh_token ? "refresh_token" : "access_token";
    const rev = await fetch(`${APPLE}/auth/revoke`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: env("APPLE_CLIENT_ID"), client_secret: secret, token, token_type_hint: hint }),
    });
    if (!rev.ok) return json({ error: "Apple did not confirm the revocation", status: rev.status }, 502);
    return json({ revoked: true });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
