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

  /* ---------- Files: a last panel to generate or request a page (since 2 Nov 2026) ----------
     The Files directory ends with "Not on the list?", after the policy areas and Other files. Two rows:
     - "Generate a page" goes to Today and focuses the one search field ("The file's name or procedure number"); search
       lists the procedures nodo doesn't follow under "Not followed by nodo yet", each with Generate page.
     - "Request a full page" opens a short sheet with one field and sends the existing request (usage event `request`,
       so it reaches the weekly requests recap), with "Write to hello@getnodo.eu" for anything more.
     "What's the difference?" opens the "Two kinds of file page" sheet. Usage: `files_generate`, and `view` / `files-request`.
     When promoted, the panel goes into the Files renderFilesView directly. */
  const flAddHtml = () => `<section class="fr-sec fl-add" aria-labelledby="flAddH">
      <div class="fr-sec__h"><h2 id="flAddH">Not on the list?</h2></div>
      <p class="cap fl-add__cap">For any other EU law in the making, generate a page now or ask nodo to follow it in full. <button class="linkbtn" type="button" data-ausheet="">What's the difference?</button></p>
      <div class="fr-list">
        <button class="fl-add__row" type="button" data-flgen><span class="fl-add__tx"><b>Generate a page</b><small>Ready now, built from the Parliament's procedure file</small></span>${icon("arrow")}</button>
        <button class="fl-add__row" type="button" data-flreq><span class="fl-add__tx"><b>Request a full page</b><small>nodo follows it and checks it. Most requested files first</small></span>${icon("arrow")}</button>
      </div></section>`;
  {
    const fv0 = renderFilesView;
    renderFilesView = function () {
      fv0();
      const p = $("flPanel"); if (p && !p.querySelector(".fl-add")) p.insertAdjacentHTML("beforeend", flAddHtml());
    };
  }
  function flReqSheet() {
    state.sheet = "flreq";
    if ($("sheet").hidden) layer.sheet = document.activeElement;
    $("sheet").innerHTML = `<div class="sheet__bar"><button class="eu-iconbtn eu-iconbtn--sm" type="button" data-sheet-close aria-label="Close">${icon("x")}</button></div>
      <div class="au-sh">
        <h2 id="sName" class="au-sh__h">Request a <b>full page</b></h2>
        <p class="au-sh__lead">Tell nodo which file to follow. The most requested files get a full page first, with cabinet staff, the Council working party, committee speakers and latest developments.</p>
        <div><span class="pr-lab" style="margin-top:0">Which file?</span><label class="eu-search"><input id="flReqQ" type="text" placeholder="Its name or procedure number" aria-label="The file's name or procedure number" autocomplete="off" enterkeyhint="send"></label></div>
        <div class="au-sh__acts">
          <button class="eu-btn eu-btn--brand eu-btn--block" type="button" data-flreqsend>Send request</button>
          <p class="cap au-sh__note">Want to say more? <button class="linkbtn" type="button" data-flreqmail>Write to ${NX_MAIL}</button></p>
        </div></div>`;
    $("scrim").hidden = false; $("sheet").hidden = false; $("sheet").scrollTop = 0;
    syncLayers();
    $("flReqQ").focus({ preventScroll: true });
    Track.log("view", { section: "files-request", item: "" });
  }
  function flReqSend() {
    const inp = $("flReqQ"), q = inp ? inp.value.trim() : "";
    if (q.length < 3) { toast("Type the file's name or procedure number"); if (inp) inp.focus(); return; }
    if (nxRequested().has(fold(q).trim())) { closeSheet(); return toast("Already requested. Thank you."); }
    const b = document.createElement("button"); b.dataset.nxreq = q;
    nxRequest(b); closeSheet();
  }
  document.addEventListener("click", (e) => {
    const t = e.target;
    if (t.closest("[data-flreq]")) return flReqSheet();
    if (t.closest("[data-flreqsend]")) return flReqSend();
    if (t.closest("[data-flreqmail]")) { const v = ($("flReqQ") || {}).value || ""; return nxMail("File request" + (v.trim() ? ": " + v.trim() : ""), ["I'd like nodo to follow: " + v.trim(), "Why it matters to me:"]); }
    if (!t.closest("[data-flgen]")) return;
    Track.log("files_generate", { section: "files", item: "" });
    setView("home");
    const q = $("hq"); if (!q) return;
    const ph = q.placeholder; q.placeholder = "The file's name or procedure number";
    q.addEventListener("blur", () => { if (!q.value) q.placeholder = ph; }, { once: true });
    q.focus({ preventScroll: true });
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target && e.target.id === "flReqQ") { e.preventDefault(); flReqSend(); } });
