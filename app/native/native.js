/* nodo native bridge. Loaded only in the iOS/Android app (app/scripts/build-www.mjs adds it after config.js);
   the web app never loads it. index.html calls window.nodoNative when it exists:
   - oauth(provider, client): Apple uses the native Sign in with Apple sheet and Supabase signInWithIdToken;
     other providers open in the system browser and come back through the eu.getnodo.app://auth link.
   - webUrl: where email links (magic link, confirm, reset) send people. The app cannot receive https links yet,
     so they land on the web app; people can also type the code from the email in the app. */
(function () {
  "use strict";
  const Cap = window.Capacitor;
  if (!Cap || !Cap.isNativePlatform || !Cap.isNativePlatform()) return;
  if (typeof Cap.registerPlugin !== "function") { console.error("nodo: capacitor.js is not loaded; native sign-in is off"); return; }

  const CALLBACK = "eu.getnodo.app://auth";
  const WEB_URL = "https://gianmariasisti-afk.github.io/nodo-data/";
  const platform = Cap.getPlatform();

  const App = Cap.registerPlugin("App");
  const Browser = Cap.registerPlugin("Browser");
  const AppleSignIn = Cap.registerPlugin("NodoAppleSignIn");

  /* Sign in with Apple is offered on iOS, first in the list (App Store guideline 4.8). */
  const cfg = window.NODO_CONFIG || {};
  if (platform === "ios") cfg.providers = ["apple", ...(cfg.providers || []).filter((p) => p !== "apple")];

  const randomNonce = () => {
    const b = new Uint8Array(32); crypto.getRandomValues(b);
    return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  };

  async function apple(client) {
    const nonce = randomNonce();
    /* The plugin sends the SHA-256 of the nonce to Apple; Supabase checks the raw nonce against the token. */
    let res;
    try { res = await AppleSignIn.authorize({ nonce }); }
    catch (e) { if (e && e.code === "CANCELED") return; throw e; }
    const { error } = await client.auth.signInWithIdToken({ provider: "apple", token: res.identityToken, nonce });
    if (error) throw error;
    /* Apple sends the name only the first time someone signs in to nodo. Keep it on the account. */
    const full = [res.givenName, res.familyName].filter(Boolean).join(" ").trim();
    if (full) { try { await client.auth.updateUser({ data: { full_name: full, name: full } }); } catch { /* the name can be set in the profile */ } }
  }

  let pending = null;
  async function browserFlow(provider, client) {
    const { data, error } = await client.auth.signInWithOAuth({
      provider: provider === "linkedin" ? "linkedin_oidc" : provider,
      options: { redirectTo: CALLBACK, skipBrowserRedirect: true },
    });
    if (error) throw error;
    pending = client;
    await Browser.open({ url: data.url, presentationStyle: "popover" });
  }

  /* The provider sends people back to eu.getnodo.app://auth with a code (PKCE) or tokens in the fragment (implicit). */
  App.addListener("appUrlOpen", async ({ url }) => {
    if (!url || !url.startsWith(CALLBACK)) return;
    const client = pending; pending = null;
    try { await Browser.close(); } catch { /* already closed */ }
    if (!client) return;
    const u = new URL(url.replace(CALLBACK, "https://callback.invalid/auth"));
    const frag = new URLSearchParams(u.hash.slice(1));
    const code = u.searchParams.get("code");
    if (code) await client.auth.exchangeCodeForSession(code);
    else if (frag.get("access_token")) await client.auth.setSession({ access_token: frag.get("access_token"), refresh_token: frag.get("refresh_token") });
  });

  window.nodoNative = {
    platform,
    webUrl: WEB_URL,
    async oauth(provider, client) {
      if (provider === "apple" && platform === "ios") return apple(client);
      return browserFlow(provider, client);
    },
  };
})();
