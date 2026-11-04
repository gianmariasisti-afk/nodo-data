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

  /* ---------- Download the MEPs you filtered (since 4 Nov 2026) ----------
     Once the Parliament list is filtered (group, committee, country or a search), a "Download" pill closes the row of
     active filters. It opens a sheet with Excel (.xlsx) or CSV and one switch, published email addresses (on). The file
     holds exactly the MEPs on screen, in the same order, and states the filters it was made with. It reuses the file
     export's writer and delivery (xpXlsx, xpCsv, xpDeliver): built on the device, share sheet or download, nothing
     uploaded. One "export" event is logged with item "meps", the format and the row count, never the contents. */
  const EPX = { fmt: "xlsx", mail: true };
  const epxAny = () => { const s = state.ep; return !!(s.q || s.country || s.committee || s.group); };
  function epxFilters() {
    const s = state.ep, out = [];
    if (s.group) out.push(["Political group", s.group]);
    if (s.committee) out.push(["Committee", `${s.committee} (${EP_CR() === "all" ? "members and substitutes" : "members"})`]);
    if (s.country) out.push(["Country", countryName(s.country)]);
    if (s.q) out.push(["Search", `"${s.q}"`]);
    return out;
  }
  const epxCap = () => epxFilters().map(([k, v]) => (k === "Committee" ? v.replace(" (", " · ").replace(")", "") : v)).join(" · ");
  function epxRows(o) {
    const k = state.ep.committee;
    return epRows.map((m) => {
      const cs = m.committees || [], mem = cs.filter((c) => c.role !== "Substitute"), sub = cs.filter((c) => c.role === "Substitute");
      const files = epFilesOf(m.key).map((x) => `${x.f.short} (${(ROLE_ONE[x.role] || "").toLowerCase()})`).join("; ");
      const r = [m.name, m.given || "", m.family || "", m.group || "", m.party || "", countryName(m.country),
        mem.map((c) => (c.role && c.role !== "Member" ? `${c.abbr || c.name} (${c.role.toLowerCase()})` : c.abbr || c.name)).join(", "),
        sub.map((c) => c.abbr || c.name).join(", ")];
      if (k) r.push((cs.find((c) => (c.abbr || c.name) === k) || {}).role || "");
      if (o.mail) r.push(m.email || "");
      r.push(m.profile || xpEpUrl(m), files);
      return r;
    });
  }
  function epxCols(o) {
    const k = state.ep.committee;
    return [["Name", 26], ["Given name", 16], ["Family name", 18], ["Political group", 14], ["National party", 22], ["Country", 14],
      ["Committees (member)", 30], ["Substitute in", 22], ...(k ? [[`Role in ${k}`, 14]] : []),
      ...(o.mail ? [["Published email", 34]] : []), ["Official profile", 44], ["On nodo files", 40]];
  }
  function epxAbout(n) {
    const day = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }), f = epxFilters();
    return [
      ["MEPs from nodo's Parliament directory"], [""],
      [`Exported on ${day}: ${n} of ${MEPS.length} MEPs, as filtered in the app.`],
      ...f.map(([k, v]) => [`${k}: ${v}`]), [""],
      ["Public sources: the European Parliament's Open Data Portal and MEP pages. Files from the Legislative Observatory."],
      ["Emails are the ones the Parliament publishes on each MEP's page."],
      ["Groups and committee seats change. Check before you rely on this list."],
      ["nodo built this file on your device and keeps no copy."],
    ];
  }
  function epxName(ext) {
    const s = state.ep, bits = [s.group, s.committee, s.country].filter(Boolean).join(", ");
    return `nodo - MEPs${bits ? " - " + bits.replace(/[\\/:*?"<>|]+/g, " ") : ""} - ${new Date().toISOString().slice(0, 10)}.${ext}`;
  }
  function epxBuild(o) {
    const cols = epxCols(o), table = [cols.map((c) => c[0]), ...epxRows(o)], about = epxAbout(epRows.length);
    if (o.fmt === "csv") return { n: epRows.length, blob: xpCsv([...table, [], ...about]), name: epxName("csv") };
    return { n: epRows.length, name: epxName("xlsx"), blob: xpXlsx([
      { name: "MEPs", rows: table, widths: cols.map((c) => c[1]), head: true },
      { name: "About this export", rows: about, widths: [110], head: false }]) };
  }
  function epxOpen() {
    state.sheet = "epx";
    if ($("sheet").hidden) layer.sheet = document.activeElement;
    const n = epRows.length;
    const fmt = (k, t, s) => `<label class="pe-fto xp-fmt"><input type="radio" name="epxfmt" value="${k}" data-epxfmt${EPX.fmt === k ? " checked" : ""}><span><b>${t}</b><small>${s}</small></span></label>`;
    $("sheet").innerHTML = `<div class="sheet__bar"><button class="eu-iconbtn eu-iconbtn--sm" type="button" data-sheet-close aria-label="Close">${icon("x")}</button></div>
      <div class="top"><div class="top__tx"><h2 id="sName">Download MEPs</h2><div class="cap">${esc(epxCap())} · ${n} ${pl(n, "MEP", "MEPs")}</div></div></div>
      <fieldset class="xp-grp"><legend class="xp-lg">Format</legend>
        ${fmt("xlsx", "Excel (.xlsx)", "Excel, Numbers, Google Sheets. Best for briefings")}
        ${fmt("csv", "CSV", "Semicolon-separated, for European Excel and CRMs")}</fieldset>
      <div class="xp-grp"><h3 class="xp-lg">Include</h3>
        <div class="yu-set xp-set"><span class="yu-set__tx" id="epxL-mail"><b>Published email addresses</b><span>As the Parliament publishes them</span></span>
        <button class="nx-switch" type="button" role="switch" data-epxsw="mail" aria-checked="${EPX.mail}" aria-labelledby="epxL-mail"></button></div></div>
      <p class="xp-note">The list on screen, in the same order: group, party, country, committees, profile link and the nodo files each MEP is on. Made on your device; nodo keeps no copy.</p>
      <button class="eu-btn eu-btn--brand eu-btn--block xp-go" type="button" data-epxgo${n ? "" : " disabled"}>${XP_SVG.dl}<span>${n ? `Download ${n} ${pl(n, "MEP", "MEPs")}` : "No MEP to download"}</span></button>`;
    $("scrim").hidden = false; $("sheet").hidden = false; $("sheet").scrollTop = 0;
    syncLayers();
    $("sheet").querySelector("[data-sheet-close]").focus({ preventScroll: true });
  }
  /* The pill closes the row of active filters; with a search alone, the row shows just the pill. */
  const epxRender0 = renderEp;
  renderEp = function () {
    epxRender0();
    const c = $("epChips"); if (!c) return;
    if (!epxAny() || !epRows.length) return;
    c.insertAdjacentHTML("beforeend", `<button class="ep-dl" type="button" data-epdl aria-label="Download these ${epRows.length} MEPs">${XP_SVG.dl}Download</button>`);
    c.hidden = false; $("epBarCap").hidden = true;
  };
  document.addEventListener("click", (e) => {
    const t = e.target;
    if (t.closest("[data-epdl]")) { e.preventDefault(); e.stopImmediatePropagation(); return epxOpen(); }
    if (state.sheet !== "epx") return;
    const sw = t.closest("[data-epxsw]"), go = t.closest("[data-epxgo]");
    if (sw) { e.preventDefault(); e.stopImmediatePropagation(); EPX.mail = !EPX.mail; sw.setAttribute("aria-checked", String(EPX.mail)); return; }
    if (go && !go.disabled) {
      e.preventDefault(); e.stopImmediatePropagation();
      let out; try { out = epxBuild({ ...EPX }); } catch { return toast("The download failed. Try again."); }
      xpDeliver(out).then((how) => {
        if (how === "cancelled") return;
        closeSheet();
        Track.log("export", { section: EPX.fmt, item: "meps", results: out.n });
        toast(how === "shared" ? "Download ready" : `Saved ${out.name}`, 2600);
      });
    }
  }, true);
  document.addEventListener("change", (e) => { const r = e.target.closest && e.target.closest("[data-epxfmt]"); if (r) EPX.fmt = r.value; }, true);
