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
