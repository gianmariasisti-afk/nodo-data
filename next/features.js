  /* ======================= nodo preview features =======================
     Source: next/features.js. tools/preview/build.mjs injects this file into the app's main script just before
     start-up, so it runs inside the same scope and uses the app's own helpers. Nothing here reaches the live app
     until it is promoted (tools/preview/promote.mjs). Everything up to 2026-10-31 was promoted on 2026-10-31. */

  /* ---------- Speeches open in the verbatim report (since 31 Oct 2026) ----------
     A speech card had no action: nodo holds neither its text nor a document link. It now links the Parliament's
     verbatim report at the speech's own anchor. scripts/build-activity.mjs stores `url` (the debate page,
     CRE-10-<date>-ITM-<n>_EN.html#<speech id>) from the next activity run; until then, and for any speech without it,
     the link is built from the speech id (MTG-PL-<date>-OTH-<speech id>) to the full-day report, which carries the
     same anchors (checked on 31 Oct 2026). The provisional report shows each speech in the language it was given in
     until the translations are out. Feature patch "speech card link" in tools/preview/build.mjs calls fdSpeechAct. */
  function fdSpeechUrl(it) {
    if (!it || it.type !== "speech") return "";
    if (/^https:\/\/www\.europarl\.europa\.eu\/doceo\/document\/CRE-[\w-]+_EN\.html#\d+$/.test(it.url || "")) return it.url;
    const m = /^MTG-PL-(\d{4}-\d{2}-\d{2})-OTH-(\d+)$/.exec(String(it.id || ""));
    return m ? `https://www.europarl.europa.eu/doceo/document/CRE-10-${m[1]}_EN.html#${m[2]}` : "";
  }
  function fdSpeechAct(it) {
    const u = fdSpeechUrl(it);
    return u ? `<a class="fd-open" href="${esc(u)}" target="_blank" rel="noopener" aria-label="Read the verbatim of ${esc(it.title || "this speech")} (opens the Parliament's site)">Read the verbatim${FD_SVG.ext}</a>` : "";
  }

  /* ---------- Email sign-in hint (since 11 Nov 2026) ----------
     People who joined with Apple or Google have no nodo password, yet "Already have an account? Sign in" opens the
     email form. The form now says so and repeats the social buttons (the same providers as the first screen: Apple
     joins Google in the iOS app). Feature patch "email sign-in hint" in tools/preview/build.mjs calls it. */
  function socialAltHtml() {
    const alt = Object.entries(PROVIDERS).filter(([k]) => !LIVE || (CFG.providers || []).includes(k));
    if (!alt.length) return "";
    const names = alt.map(([, v]) => v.name).join(" or ");
    return `<div class="auth-social-alt"><p class="fine">Joined with ${names}? You have no nodo password. Use ${alt.length > 1 ? "those buttons" : "the button"} instead.</p>
      ${alt.map(([k, v]) => `<button class="eu-btn eu-btn--outline eu-btn--block" data-prov="${k}" type="button"><span class="pmark" aria-hidden="true">${v.mark}</span>Continue with ${v.name}</button>`).join("")}</div>`;
  }

  /* ---------- Error reporting (since 11 Nov 2026) ----------
     A script error used to leave a blank screen and no trace. Now each distinct error goes to the usage log as an
     "error" event (section: error / promise / startup, item: the message, query: file and line), at most 10 per
     session. Errors from before the session is restored wait up to a minute for it; nothing is logged signed out.
     A failure during start-up shows the boot screen again with a Try again button instead of a blank page
     (feature patch "startup catch" in tools/preview/build.mjs calls window.nxBootFailed). The data notice says so. */
  const ERR = { n: 0, seen: new Set(), pend: [] };
  function errReport(kind, e, where) {
    const msg = String((e && (e.message || e.reason)) || e || "unknown").replace(/\s+/g, " ").slice(0, 160);
    if (ERR.n >= 10 || msg === "Script error." || ERR.seen.has(kind + msg)) return;
    ERR.seen.add(kind + msg); ERR.n++;
    const at = where || ((e && e.stack) ? (String(e.stack).split("\n").find((l) => /:\d+:\d+/.test(l)) || "") : "");
    const row = { section: kind, item: msg, query: String(at).trim().replace(/^at\s+/, "").slice(-120) || null };
    if (LIVE && acct.user) Track.log("error", row); else ERR.pend.push(row);
  }
  addEventListener("error", (ev) => {
    if (!ev.error && !ev.message) return;
    errReport("error", ev.error || ev.message, ev.filename ? `${ev.filename.split("/").pop()}:${ev.lineno}:${ev.colno}` : "");
  });
  addEventListener("unhandledrejection", (ev) => errReport("promise", ev.reason));
  (function errFlush(t) {
    if (ERR.pend.length && LIVE && acct.user) ERR.pend.splice(0).forEach((r) => Track.log("error", r));
    if (ERR.pend.length && t < 30) setTimeout(() => errFlush(t + 1), 2000);
  })(0);
  window.nxBootFailed = (e) => {
    errReport("startup", e);
    setTimeout(() => {
      bootMsg.textContent = "nodo hit a problem while opening. Try again. If it keeps happening, write to hello@getnodo.eu.";
      bootRetry.onclick = () => location.reload();
      bootRetry.hidden = false; boot.hidden = false;
    }, 0);
  };

  /* ---------- Portraits out of the first download (since 11 Nov 2026) ----------
     Portraits are separate files (v1/portraits/), loaded as they are shown. Offline, or if one is missing, the image
     is hidden rather than shown broken; the coloured disc behind it stays. Patches "light data files" and
     "portrait addresses" in tools/preview/build.mjs. */
  document.addEventListener("error", (e) => {
    const t = e.target;
    if (t && t.tagName === "IMG" && /\/portraits\//.test(t.src || "")) t.style.visibility = "hidden";
  }, true);
