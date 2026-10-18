  /* ======================= nodo preview features =======================
     Source: next/features.js. tools/preview/build.mjs injects this file into the app's main script just before
     start-up, so it runs inside the same scope and uses the app's own helpers (row, icon, esc, searchAll, openFile,
     showProfile, Track, state, store). Nothing here reaches the live app until it is promoted.

     1. Forgiving search: a typo or an unknown word no longer ends in "Nothing matches".
     2. Request a file: a search that finds no curated file offers "Request a full page" (logged as a usage event).
     3. Automatic pages: every Parliament report and opinion in nodo's MEP activity data, with its rapporteur and shadows.
     4. MEP activity: a report or opinion card opens its automatic page ("Who works on it").
     5. Curated file pages: a provenance line under the title (checked date, sources, Observatory).
     6. Files view: "Your files", what moved this week, and email and alert settings.
     7. "Which files do you track?": asked once after sign-in, reachable any time from the Files view.
     8. "Your week": what the Monday email would hold. Nothing is sent yet.
     9. Country pages: a photo of a national monument, cut into five columns, above the country code.
    10. Country pages: a band in the national flag's colours under the columns.
     ===================================================================== */
  const NX = { docs: null, byId: new Map(), loading: null, vocab: null, pick: null, ASKED: "nodo.next.askedFiles", REQ: "nodo.next.requested" };
  const nxRequested = () => { try { return new Set(JSON.parse(store.get(NX.REQ) || "[]")); } catch { return new Set(); } };
  const nxClip = (s, n) => (String(s).length > n ? String(s).slice(0, n).replace(/\s+\S*$/, "") + "…" : String(s));
  const nxEp = (id) => { const e = BYKEY.get("ep:" + id); return e ? e.o : null; };

  /* ---------- 3. automatic pages: the reports index ---------- */
  function nxLoadDocs() {
    if (NX.docs) return Promise.resolve(NX.docs);
    if (NX.loading) return NX.loading;
    NX.loading = fetchJson("data/reports.json").then((d) => {
      const docs = Array.isArray(d.docs) ? d.docs : [];
      docs.forEach((r) => {
        const raps = r.rap.map(nxEp).filter(Boolean);
        r._raps = raps;
        r._rapLabel = raps.length ? raps.map((m) => m.name).join(", ") : r.rapName || "";
        r._hay = words([r.title, r.cmte, r.kind, r.ref, r._rapLabel].join(" "));
        r._nm = words(r.title);
        r._key = fold(r.title).replace(/[^a-z0-9]+/g, " ").trim().slice(0, 70);
        NX.byId.set(r.id, r);
      });
      NX.docs = docs; NX.vocab = null;
      if (state.view === "home" && state.hq) renderHome();
      if (NX.dq && $("nxdres")) $("nxdres").innerHTML = nxAnyHtml(NX.dq);
      return docs;
    }).catch(() => { NX.loading = null; return []; });
    return NX.loading;
  }
  /* Report titles spell files out in full, so the acronyms people type are expanded before matching ("eu ets" → eu emissions trading). */
  const NX_ALIAS = {
    ets: "emissions trading", cbam: "carbon border adjustment", afir: "alternative fuels infrastructure", eudr: "deforestation",
    csrd: "corporate sustainability reporting", csddd: "corporate sustainability due diligence", cs3d: "corporate sustainability due diligence",
    sep: "standard essential patents", seps: "standard essential patents", gdpr: "data protection", dsa: "digital services", dma: "digital markets",
    nzia: "net zero industry", crma: "critical raw materials", ppwr: "packaging waste", epbd: "energy performance of buildings",
    mff: "multiannual financial framework", gsp: "generalised scheme of preferences", cra: "cyber resilience", ehds: "health data space",
    psd3: "payment services", mica: "crypto assets", amla: "anti money laundering", gei: "global europe", ndici: "global europe",
  };
  const nxExpand = (t) => t.flatMap((x) => (NX_ALIAS[x] ? NX_ALIAS[x].split(" ") : [x]));
  function nxDocs(t) {
    if (!NX.docs) { nxLoadDocs(); return null; }
    if (!t.length) return [];
    const run = (u) => NX.docs.filter((r) => hits(r._hay, u)).sort((a, b) => (hits(b._nm, u) - hits(a._nm, u)) || (b.rap.length - a.rap.length) || (a.date < b.date ? 1 : -1));
    const plain = run(t);
    if (!t.some((x) => NX_ALIAS[x])) return plain;
    const seen = new Set(plain.map((r) => r.id));
    return [...plain, ...run(nxExpand(t)).filter((r) => !seen.has(r.id))];
  }

  /* ---------- 1. forgiving search ---------- */
  /* Edit distance with swaps (optimal string alignment), stopping once it passes max. */
  function nxDist(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    let p2 = null, p1 = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i]; let low = i;
      for (let j = 1; j <= b.length; j++) {
        let v = Math.min(p1[j] + 1, cur[j - 1] + 1, p1[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (p2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, p2[j - 2] + 1);
        cur.push(v); if (v < low) low = v;
      }
      if (low > max) return max + 1;
      p2 = p1; p1 = cur;
    }
    return p1[b.length];
  }
  function nxVocab() {
    if (NX.vocab) return NX.vocab;
    const set = new Set();
    const add = (s) => words(s).trim().split(" ").forEach((w) => { if (w.length >= 3) set.add(w); });
    MEPS.forEach((m) => add(m.name)); COLL.forEach((c) => add(c.name + " " + c.portfolio.join(" "))); CAB.forEach((m) => add(m.name));
    FILES.forEach((f) => add(f.short + " " + f.title));
    (NX.docs || []).forEach((r) => add(r.title + " " + r.cmte));
    return (NX.vocab = [...set]);
  }
  /* Names first: a person whose name is close to every word typed ("bernard lange" → Bernd Lange). */
  function nxPerson(t) {
    const long = t.filter((x) => x.length >= 3);
    if (!long.length) return null;
    let best = null, bs = Infinity;
    for (const m of [...MEPS, ...COLL, ...CAB]) {
      const nw = words(m.name).trim().split(" ");
      let sum = 0;
      for (const x of long) {
        const max = x.length <= 4 ? 1 : 2;
        let d = max + 1;
        for (const w of nw) {
          if (w.startsWith(x)) { d = 0; break; }
          if (x.length >= 4) d = Math.min(d, nxDist(x, w, max), w.length > x.length ? nxDist(x, w.slice(0, x.length), max) + 0.5 : max + 1);
        }
        if (d > max) { sum = Infinity; break; }
        sum += d;
      }
      if (sum > 0 && sum < bs) { bs = sum; best = m; }
    }
    return best ? words(best.name).trim() : null;
  }
  /* Then words: each word the data does not contain is swapped for the closest word it does contain.
     A word with nothing close stays unfixed, so the search ends in the request card instead of a looser guess. */
  function nxFix(t) {
    const V = nxVocab(); let changed = false, lost = false;
    const out = t.map((x) => {
      if (x.length < 4 || V.some((w) => w.startsWith(x))) return x;
      const max = x.length <= 5 ? 1 : 2;
      let best = null, bd = max + 1;
      for (const w of V) {
        const d = Math.min(nxDist(x, w, max), w.length > x.length ? nxDist(x, w.slice(0, x.length), max) + 0.5 : max + 1);
        if (d < bd || (d === bd && best && Math.abs(w.length - x.length) < Math.abs(best.length - x.length))) { bd = d; best = w; }
      }
      if (!best) { lost = true; return x; }
      changed = true;
      return best;
    });
    return changed && !lost ? out : null;
  }
  const nxCount = (r) => r.fl.length + r.com.length + r.cab.length + r.ep.length + r.co.length + ((r.rp && r.rp.length) || 0);
  const nxSearchBase = searchAll;
  searchAll = function (q) {
    const r = nxSearchBase(q);
    if (!r) return r;
    r.rp = nxDocs(r.t);
    if (nxCount(r) || !r.t.some((x) => x.length >= 4)) return r;
    for (const fq of [nxPerson(r.t), (nxFix(r.t) || []).join(" ")]) {
      if (!fq) continue;
      const r2 = nxSearchBase(fq);
      if (!r2) continue;
      r2.rp = nxDocs(r2.t);
      if (nxCount(r2)) { r2.fixedTo = fq; return r2; }
    }
    return r;
  };

  /* ---------- 2. request a file + search results ---------- */
  const nxDocRow = (d) => row({ attrs: tap(`data-nxdoc="${esc(d.id)}"`), lead: disc("file"), name: esc(nxClip(d.title, 140)),
    meta: esc([d.kind + " · " + d.cmte, d._rapLabel ? "Rapporteur " + d._rapLabel : "", d.date ? fdDate(d.date, true) : ""].filter(Boolean).join(" · ")), wrap: true,
    extra: `<span class="eu-row__tags"><span class="eu-group tag">Automatic page</span></span>`, tail: go });
  function nxRequestCard(q, lead) {
    const done = nxRequested().has(fold(q).trim());
    return `<div class="block nx-req"><p><b>${lead}</b></p>
      <p class="cap">A full page adds the Commission lead, cabinet contacts, the Council and checked sources. The most requested files get one first.</p>
      <button class="eu-btn ${done ? "" : "eu-btn--brand "}eu-btn--block" type="button" data-nxreq="${esc(q)}"${done ? " disabled" : ""}>${done ? "Requested" + icon("check") : "Request a full page for “" + esc(nxClip(q, 40)) + "”"}</button></div>`;
  }
  const nxResultsBase = resultsHtml;
  resultsHtml = function (r, q) {
    const base = r.fl.length + r.com.length + r.cab.length + r.ep.length + r.co.length;
    const fix = r.fixedTo ? `<div class="hint nx-fix"><span>No exact match for “${esc(q)}”. Showing results for <b>${esc(r.fixedTo)}</b>.</span></div>` : "";
    const docs = r.rp == null
      ? `<p class="cap nx-wait">Searching Parliament reports and opinions…</p>`
      : r.rp.length ? `<h3>Parliament reports and opinions <small>${r.rp.length}</small></h3><div class="list">${r.rp.slice(0, 8).map(nxDocRow).join("")}</div>
        ${r.rp.length > 8 ? `<p class="cap nx-more">Showing 8 of ${r.rp.length}. Add a word to narrow it down.</p>` : ""}` : "";
    /* A search for a person is not a missing file: no request card when a name matched. */
    const named = [...r.ep, ...r.com, ...r.cab].some((m) => m._nm && hits(m._nm, r.t));
    const ask = !r.fl.length && q.trim().length >= 3 && !named
      ? nxRequestCard(q, base || (r.rp && r.rp.length) ? "Not among nodo's curated files yet" : "Nothing in nodo matches this yet") : "";
    return fix + (base ? nxResultsBase(r, q) : "") + docs + ask;
  };
  function nxRequest(btn) {
    const q = btn.dataset.nxreq, k = fold(q).trim(), set = nxRequested();
    if (set.has(k)) return;
    set.add(k); store.set(NX.REQ, JSON.stringify([...set].slice(-200)));
    Track.log("request", { section: "file", query: q.slice(0, 200) }); Track.flush();
    btn.disabled = true; btn.classList.remove("eu-btn--brand"); btn.innerHTML = "Requested" + icon("check");
    toast("Request sent. Thank you.");
  }

  /* ---------- 3. automatic page ---------- */
  function nxOpenDoc(id) {
    const d = NX.byId.get(id);
    if (!d) { if (!NX.docs) nxLoadDocs().then(() => { if (NX.byId.has(id)) nxOpenDoc(id); else toast("This document is not in nodo's data yet"); }); else toast("This document is not in nodo's data yet"); return; }
    state.open = "doc:" + id;
    const shs = d.sh.map(nxEp).filter(Boolean).sort((a, b) => a.family.localeCompare(b.family));
    const related = NX.docs.filter((x) => x.id !== d.id && x._key === d._key);
    const rap = d._raps.length ? `<div class="list">${d._raps.map(rowMep).join("")}</div>`
      : d.rapName ? `<div class="hint"><span>${esc(d.rapName)}. Not in nodo's list of current MEPs.</span></div>` : `<div class="hint"><span>No rapporteur recorded yet.</span></div>`;
    const pdf = safeUrl(d.pdf);
    showProfile(`
      <div class="tb">${backBtn}${icon("back")}</button><span class="tbr"><span class="eu-group tag nx-auto">Automatic page</span></span></div>
      <div class="hero"><div class="eu-row__tags"><span class="eu-group tag">${esc(d.kind)}</span><span class="eu-group tag">${esc(d.cmte)}</span></div>
        <h2 class="eu-headline nx-doctitle" id="pName"><strong>${esc(d.title)}</strong></h2>
        <p class="bio">${esc(d.kind)} in ${esc(d.cmte)}${d.date ? " · " + esc(fdDate(d.date, true)) : ""}${d.ref ? " · " + esc(d.ref) : ""}</p></div>
      <div class="stats"><div><b>${d._raps.length || (d.rapName ? 1 : 0)}</b><span>Rapporteur</span></div><div><b>${d.sh.length}</b><span>${pl(d.sh.length, "Shadow", "Shadows")}</span></div></div>
      <h3>Rapporteur</h3>${rap}
      <h3>Shadows <small>${shs.length}</small></h3>${shs.length ? `<div class="list">${shs.map(rowMep).join("")}</div>` : `<div class="hint"><span>No shadows recorded for this document.</span></div>`}
      ${related.length ? `<h3>Same file, other committees <small>${related.length}</small></h3><div class="list">${related.map(nxDocRow).join("")}</div>` : ""}
      ${pdf ? `<h3>Document</h3><div class="list">${extRow(esc(d.kind + (d.ref ? " " + d.ref : "")) + " <small>PDF</small>", esc(pdf))}</div>` : ""}
      ${nxRequestCard(d.title, "Not on an automatic page")}
      <p class="foot">Built automatically from the Parliament's open data, through nodo's daily MEP activity update. Shadows are the MEPs the Parliament lists as working on this document. Check the document before external use.</p>`);
  }
  const nxRouteBase = openRoute;
  openRoute = function (key) {
    if (key && key.startsWith("doc:")) return nxOpenDoc(key.slice(4));
    if (key === "week:me") return nxOpenWeek();
    return nxRouteBase(key);
  };
  ROUTE_ATTR.doc = "nxdoc";

  /* ---------- 4. MEP activity: reports open their automatic page ---------- */
  const nxFeedCardBase = feedCard;
  feedCard = function (it, idx, last) {
    const h = nxFeedCardBase(it, idx, last);
    if (it.type !== "report" && it.type !== "opinion") return h;
    nxLoadDocs();
    const btn = `<button class="fd-open nx-who" type="button" data-nxdoc="${esc(it.id)}">Rapporteur and shadows${FD_SVG.next}</button>`;
    return h.includes(`<div class="fd-ft">`) ? h.replace(`<div class="fd-ft">`, `<div class="fd-ft">${btn}`) : h.replace("</article>", `<div class="fd-ft">${btn}</div></article>`);
  };

  /* ---------- 5. curated file page: where the data comes from ---------- */
  const nxOpenFileBase = openFile;
  openFile = function (id, keep, startTab) {
    nxOpenFileBase(id, keep, startTab);
    const f = FILE_BY[id], hero = document.querySelector("#profileBody .hero");
    if (!f || !hero || hero.querySelector(".nx-prov")) return;
    const asOf = DATA.fl && DATA.fl.asOf, n = (f.sources || []).filter((x) => safeUrl(x.url)).length;
    const obs = f.procedure ? "https://oeil.europarl.europa.eu/oeil/en/procedure-file?reference=" + encodeURIComponent(f.procedure) : "";
    hero.insertAdjacentHTML("beforeend", `<div class="nx-prov">
      ${asOf ? `<span class="eu-group tag tg-ok">${icon("check")}Checked ${esc(fdDate(asOf, true))}</span>` : ""}
      ${n ? `<button class="nx-lnk" type="button" data-ftab="next">${n} ${pl(n, "source", "sources")}</button>` : ""}
      ${obs ? `<a class="nx-lnk" href="${esc(obs)}" target="_blank" rel="noopener">${esc(f.procedure)} on the Observatory${icon("ext")}</a>` : ""}</div>`);
  };

  /* ---------- 6. Files view: your files, what moved, email and alerts ---------- */
  const nxWeekFrom = () => isoD(addD(new Date(), -7));
  const nxMoved = (f) => { const from = nxWeekFrom(), t = todayIso(); return (UPD.tl[f.id] || []).filter((e) => e.date && e.date >= from && e.date <= t && (e.kind !== "scheduled" || e.date <= t)); };
  const nxNotify = () => Object.assign({ weekly: false, alerts: false }, (state.profile && state.profile.notify) || {});
  const nxSwitch = (k, label, sub) => `<div class="nx-set"><span class="nx-set__tx"><b>${label}</b><span class="cap">${sub}</span></span>
    <button class="nx-switch" type="button" role="switch" data-nxset="${k}" aria-checked="${nxNotify()[k]}" aria-label="${label}"></button></div>`;
  function nxFilesHtml() {
    const fol = followedFiles();
    const moved = fol.filter((f) => nxMoved(f).length), still = fol.filter((f) => !nxMoved(f).length);
    const movedRow = (f) => { const ev = nxMoved(f), last = ev[ev.length - 1];
      return row({ attrs: tap(`data-file="${esc(f.id)}" data-filetab="upd"`), lead: `<span class="nx-dotlead">${disc(fileIc(f))}<i class="nx-dot"></i></span>`, name: esc(f.short),
        meta: esc(`${ev.length} ${pl(ev.length, "change", "changes")} this week · ${last.title}${last.date ? " · " + fdDate(last.date) : ""}`), wrap: true, tail: followBtn(f.id, f.short) }); };
    return `<section class="nx-yours" aria-labelledby="nxYoursH">
      <h3 id="nxYoursH">Your files <small>${fol.length}</small></h3>
      ${fol.length ? "" : `<div class="hint"><span>Follow the files you work on. They come first here, and the Monday email covers them.</span></div>`}
      ${moved.length ? `<p class="cap nx-sub">Moved in the last 7 days</p><div class="list">${moved.map(movedRow).join("")}</div>` : ""}
      ${still.length ? `<p class="cap nx-sub">${moved.length ? "No change this week" : "No change in the last 7 days"}</p><div class="list">${still.map(homeFile).join("")}</div>` : ""}
      <div class="nx-acts"><button class="eu-btn eu-btn--block" type="button" data-nxpick>${icon("star")}Choose the files you track</button>
        ${fol.length ? `<button class="eu-btn eu-btn--outline eu-btn--block" type="button" data-nxweek>${icon("mail")}Preview your Monday email</button>` : ""}</div>
      <div class="block nx-notify">${nxSwitch("weekly", "Monday email", "What moved on your files last week")}${nxSwitch("alerts", "Stage and date alerts", "The same day a stage or a date changes")}
        <p class="cap">${esc((state.profile && state.profile.email) || "Your sign-in email")} · Testing: nothing is sent yet.</p></div>
      <h3>All files <small>${FILES.length}</small></h3></section>`;
  }
  const nxFilesViewBase = renderFilesView;
  renderFilesView = function () {
    nxFilesViewBase();
    if (FILES.length) $("filesBody").insertAdjacentHTML("afterbegin", nxFilesHtml());
    const allH = $("filesBody").querySelector(".nx-yours > h3:last-of-type");
    (allH || $("filesBody")).insertAdjacentHTML(allH ? "beforebegin" : "beforeend", `<section class="nx-any" aria-labelledby="nxAnyH">
      <h3 id="nxAnyH">Any other file</h3>
      <p class="cap nx-sub">Search every Parliament report and opinion in nodo: who the rapporteur and the shadows are.</p>
      <label class="eu-search">${icon("search")}<input id="nxdq" type="search" placeholder="A file, an acronym or a committee" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Search Parliament reports and opinions" value="${esc(NX.dq || "")}"></label>
      <div id="nxdres" aria-live="polite">${nxAnyHtml(NX.dq || "")}</div></section>`);
  };
  function nxAnyHtml(q) {
    const t = terms(q);
    if (!t.length) return "";
    const rp = nxDocs(t);
    if (rp == null) return `<p class="cap nx-wait">Loading Parliament reports and opinions…</p>`;
    return (rp.length ? `<div class="list">${rp.slice(0, 10).map(nxDocRow).join("")}</div>${rp.length > 10 ? `<p class="cap nx-more">Showing 10 of ${rp.length}. Add a word to narrow it down.</p>` : ""}`
      : `<div class="hint"><span>No Parliament report or opinion matches “${esc(q)}”.</span></div>`) + (q.trim().length >= 3 ? nxRequestCard(q, rp.length ? "Want a full page?" : "Not in nodo yet") : "");
  }
  let nxDqTimer = 0;
  document.addEventListener("input", (e) => {
    if (e.target.id !== "nxdq") return;
    NX.dq = e.target.value;
    clearTimeout(nxDqTimer);
    nxDqTimer = setTimeout(() => {
      const host = $("nxdres"); if (!host) return;
      host.innerHTML = nxAnyHtml(NX.dq);
      const t = terms(NX.dq); if (t.length && NX.docs) Track.search("files-docs", NX.dq, nxDocs(t).length);
    }, 250);
  });
  function nxSetNotify(k, btn) {
    if (!state.profile) state.profile = {};
    const n = nxNotify(); n[k] = !n[k];
    state.profile.notify = n; saveProfile();
    Track.log("notify", { section: k, item: n[k] ? "on" : "off" });
    btn.setAttribute("aria-checked", String(n[k]));
    toast(n[k] ? (k === "weekly" ? "Monday email on (testing, nothing is sent yet)" : "Alerts on (testing, nothing is sent yet)") : k === "weekly" ? "Monday email off" : "Alerts off");
  }

  /* ---------- 7. which files do you track? ---------- */
  function nxPickHtml(auto) {
    const n = NX.pick.size;
    return `<div class="sheet__bar"><button class="eu-iconbtn eu-iconbtn--sm" type="button" data-sheet-close aria-label="Close">${icon("x")}</button></div>
      <div class="top"><div class="top__tx"><h2 id="sName">Which files do you track?</h2><div class="cap">You get a Monday email when they move, and an alert when a stage or a date changes.</div></div></div>
      <div class="chips wrap nx-pick" role="group" aria-label="Files">${FILES.map((f) => `<button class="eu-chip" type="button" data-nxpf="${esc(f.id)}" aria-pressed="${NX.pick.has(f.id)}">${esc(f.short)}</button>`).join("")}</div>
      <p class="cap nx-sub">Not listed? Search for it on Home. Any Parliament report or opinion opens there, and you can request a full page.</p>
      <button class="eu-btn eu-btn--brand eu-btn--block" type="button" data-nxpdone>${n ? `Follow ${n} ${pl(n, "file", "files")}` : "Follow no files"}</button>
      ${auto ? `<button class="eu-btn eu-btn--block nx-skip" type="button" data-sheet-close>Skip for now</button>` : ""}`;
  }
  function nxOpenPick(auto) {
    if (!FILES.length) return;
    NX.pick = new Set(followedFiles().map((f) => f.id)); NX.pickAuto = !!auto;
    state.sheet = "nxpick";
    if ($("sheet").hidden) layer.sheet = document.activeElement;
    $("sheet").innerHTML = nxPickHtml(auto);
    $("scrim").hidden = false; $("sheet").hidden = false; $("sheet").scrollTop = 0;
    syncLayers();
    const first = $("sheet").querySelector("[data-nxpf]"); if (first) first.focus({ preventScroll: true });
  }
  function nxPickDone() {
    const before = new Set(state.follow);
    FILES.forEach((f) => {
      const want = NX.pick.has(f.id);
      if (want && !before.has(f.id)) { state.follow.add(f.id); Track.log("follow", { section: "file", item: f.id }); }
      if (!want && before.has(f.id)) { state.follow.delete(f.id); Track.log("unfollow", { section: "file", item: f.id }); }
    });
    saveFollow(); closeSheet();
    renderFiles(); renderNews(); renderSpot();
    if (state.view === "files") renderFilesView();
    const n = followedFiles().length;
    toast(n ? `Following ${n} ${pl(n, "file", "files")}` : "Not following any file");
  }
  function nxMaybeAsk(tries = 0) {
    if (store.get(NX.ASKED) || !acct.user || !FILES.length) return;
    const busy = !$("onb").hidden || !$("sheet").hidden || !$("profile").hidden || state.touring;
    if (busy) { if (tries < 40) setTimeout(() => nxMaybeAsk(tries + 1), 3000); return; }
    store.set(NX.ASKED, "1");
    nxOpenPick(true);
  }
  const nxSignedBase = onSignedIn;
  onSignedIn = async function (user) {
    await nxSignedBase(user);
    if (acct.user) setTimeout(() => nxMaybeAsk(), 1500);
  };

  /* ---------- 8. your week: the Monday email, shown in the app ---------- */
  function nxOpenWeek() {
    state.open = "week:me";
    const fol = followedFiles(), t = todayIso(), from = nxWeekFrom();
    const moved = fol.map((f) => ({ f, ev: nxMoved(f) })).filter((x) => x.ev.length);
    const ahead = fol.flatMap((f) => stepsAhead(f).filter((s) => s.date).map((s) => ({ f, s }))).sort((a, b) => (a.s.date < b.s.date ? -1 : 1)).slice(0, 8);
    const loading = UPD.status === "loading";
    const block = ({ f, ev }) => `<div class="block nx-wk"><p class="nx-wk__h"><i class="nx-dot"></i><b>${esc(f.short)}</b></p>
      <div class="list">${ev.slice(-4).reverse().map((e) => evRow(e)).join("")}</div>
      ${nextStep(f) ? `<p class="cap nx-sub">Next: ${esc(nextLine(f))}</p>` : ""}
      <button class="eu-btn eu-btn--sm" type="button" data-file="${esc(f.id)}" data-filetab="upd">Open the timeline</button></div>`;
    showProfile(`
      <div class="tb">${backBtn}${icon("back")}</button></div>
      <div class="hero"><p class="cap">${esc(fdDate(from, true))} to ${esc(fdDate(t, true))} · you follow ${fol.length} ${pl(fol.length, "file", "files")}</p>
        <h2 class="eu-headline" id="pName">${loading ? "Your <strong>week</strong>" : `<strong>${moved.length}</strong> of your files moved this week`}</h2>
        <p class="bio">This is what the Monday email would hold. Sending is not switched on yet.</p></div>
      ${loading ? `<div class="hint"><span>The timelines are still loading.</span></div>`
        : moved.length ? moved.map(block).join("") : `<div class="hint"><span>None of your files moved in the last 7 days.</span></div>`}
      ${ahead.length ? `<h3>Coming up on your files</h3><div class="list">${ahead.map(({ f, s }) => row({ attrs: tap(`data-file="${esc(f.id)}" data-filetab="next"`), lead: disc("cal"), name: esc(s.what), meta: esc(fdDate(s.date, true) + " · " + f.short), wrap: true })).join("")}</div>` : ""}
      <p class="foot">Each step links to its file and its official source. Built from the Parliament's open data, the Council calendar and nodo's file data.</p>`);
  }

  /* ---------- clicks ---------- */
  document.addEventListener("click", (e) => {
    const t = e.target;
    const dc = t.closest("[data-nxdoc]"); if (dc) { e.stopPropagation(); return nxOpenDoc(dc.dataset.nxdoc); }
    const rq = t.closest("[data-nxreq]"); if (rq) return nxRequest(rq);
    if (t.closest("[data-nxpick]")) return nxOpenPick(false);
    if (t.closest("[data-nxweek]")) return nxOpenWeek();
    const st = t.closest("[data-nxset]"); if (st) return nxSetNotify(st.dataset.nxset, st);
    const pf = t.closest("[data-nxpf]");
    if (pf) { const id = pf.dataset.nxpf; NX.pick.has(id) ? NX.pick.delete(id) : NX.pick.add(id); pf.setAttribute("aria-pressed", String(NX.pick.has(id)));
      const d = $("sheet").querySelector("[data-nxpdone]"), n = NX.pick.size; if (d) d.textContent = n ? `Follow ${n} ${pl(n, "file", "files")}` : "Follow no files"; return; }
    if (t.closest("[data-nxpdone]")) return nxPickDone();
  }, true);
  nxLoadDocs();

  /* ---------- 9. country pages: a monument photo cut into columns ----------
     One photo per country, served from next/monuments/. The five strips are one picture: each strip shows its own
     slice, offset by its column, so the photo reads whole across the gaps. Countries without an entry keep the
     plain page. The photo loads only when the country page opens. */
  /* r: photo height ÷ width. f: how far down the photo the columns start (share of its height).
     z: zoom (1 = the photo spans the five columns). x: sideways shift when zoomed (share of the columns' width).
     Years only where a source gives a single completion or opening date. */
  const NX_MON = {
    AT: { name: "Votivkirche", place: "Vienna", year: "1879", credit: "Daniel Koo", r: 1.506, f: 0.04 },
    BE: { name: "Grand-Place", place: "Brussels", credit: "Alicia Abeloos", r: 1.5, f: 0 },
    BG: { name: "Alexander Nevsky Cathedral", place: "Sofia", year: "1912", credit: "Alf Redo", r: 1.504, f: 0.12 },
    CY: { name: "Petra tou Romiou", place: "Paphos", credit: "Dylan Sosso", r: 1.25, f: 0.2 },
    CZ: { name: "St Nicholas Church", place: "Prague", credit: "Samuel Quek", r: 1.5, f: 0.08 },
    DE: { name: "Brandenburg Gate", place: "Berlin", year: "1791", credit: "Tim Hüfner", r: 1.5, f: 0.04 },
    DK: { name: "Nyhavn", place: "Copenhagen", year: "1673", credit: "Daria Strategy", r: 1.25, f: 0.15 },
    EE: { name: "Town Hall Square", place: "Tallinn", credit: "Judith Prins", r: 1.5, f: 0.04 },
    EL: { name: "Acropolis", place: "Athens", credit: "Ken Nagata", r: 1.5, f: 0.05 },
    ES: { name: "Casa Batlló", place: "Barcelona", year: "1906", credit: "Theodor Vasile", r: 1.652, f: 0.3 },
    FI: { name: "Helsinki Cathedral", place: "Helsinki", credit: "Illia Panasenko", r: 1.5, f: 0.3 },
    FR: { name: "Eiffel Tower", place: "Paris", year: "1889", credit: "Pedro Gandra", r: 1.5, f: 0 },
    HR: { name: "City walls", place: "Dubrovnik", credit: "mana5280", r: 1.246, f: 0.18 },
    HU: { name: "Chain Bridge", place: "Budapest", year: "1849", credit: "Ákos Szócska", r: 1.5, f: 0.25 },
    IE: { name: "Rock of Cashel", place: "Tipperary", credit: "Irina Shishkina", r: 1.333, f: 0 },
    IT: { name: "Colosseum", place: "Rome", year: "AD 80", credit: "Redd Francisco", r: 1.5, f: 0.25 },
    LT: { name: "Cathedral Bell Tower", place: "Vilnius", credit: "Tadas Petrokas", r: 1.25, f: 0 },
    LU: { name: "Grund", place: "Luxembourg City", credit: "Alena Praslova", r: 1.333, f: 0.25 },
    LV: { name: "House of the Blackheads", place: "Riga", credit: "Aleksei Smagin", r: 1.5, f: 0.2 },
    MT: { name: "Valletta", place: "Malta", credit: "Reuben Farrugia", r: 1.333, f: 0.1 },
    NL: { name: "Canal houses", place: "Amsterdam", credit: "Matheo JBT", r: 1.25, f: 0.08 },
    PL: { name: "Palace of Culture and Science", place: "Warsaw", year: "1955", credit: "Victor Malyushev", r: 1.333, f: 0.02 },
    PT: { name: "Belém Tower", place: "Lisbon", year: "1519", credit: "Angel Ceballos", r: 1.778, f: 0.2 },
    RO: { name: "Romanian Athenaeum", place: "Bucharest", year: "1888", credit: "Emilia Morariu", r: 1.25, f: 0.1 },
    SE: { name: "Stockholm City Hall", place: "Stockholm", year: "1923", credit: "Stockholm Paris Studio", r: 1.333, f: 0.22, z: 1.3, x: 0.15 },
    SI: { name: "Bled Island", place: "Bled", credit: "Pavel Golasowski", r: 1.25, f: 0.1 },
    SK: { name: "Bratislava Castle", place: "Bratislava", credit: "Martin Katler", r: 1.25, f: 0.37, z: 1.8, x: 0.4 },
  };
  const NX_COLS = [0, 28, 14, 28, 0];
  /* ---------- 10. country pages: the flag band ----------
     A thin band in the national flag's colours under the columns, right of the country code.
     Colours: each country's specified values (law, decree or government guide) where one exists; sources in next/README.md. */
  const nxStripes = (dir, list) => { const t = list.reduce((a, x) => a + (x[1] || 1), 0); let at = 0;
    return `linear-gradient(${dir}, ${list.map(([c, w = 1]) => { const a = at; at += w; return `${c} ${(a / t * 100).toFixed(2)}% ${(at / t * 100).toFixed(2)}%`; }).join(", ")})`; };
  const nxH = (...l) => nxStripes("to bottom", l), nxV = (...l) => nxStripes("to right", l);
  const nxCross = (field, arm, x) => ({ bg: `linear-gradient(to bottom, transparent 33.33%, ${arm} 33.33% 66.66%, transparent 66.66%), ${field}`,
    parts: [`left:${x}%;top:0;width:5px;height:100%;background:${arm}`] });
  const nxDot = (at, bg, w = 10) => `left:calc(${at}% - ${w / 2}px);top:1px;width:${w}px;height:10px;border-radius:5px;background:${bg};box-shadow:0 0 0 2px var(--surface)`;
  const NX_FLAG = {
    AT: { bg: nxH(["#C8102E"], ["#FFFFFF"], ["#C8102E"]) },
    BE: { bg: nxV(["#000000"], ["#FDDA24"], ["#EF3340"]) },
    BG: { bg: nxH(["#FFFFFF"], ["#00966E"], ["#D62612"]) },
    CY: { bg: "#FFFFFF", parts: [nxDot(50, "#D57800", 24), nxDot(42, "#4E5B31", 6), nxDot(58, "#4E5B31", 6)] },
    CZ: { bg: nxH(["#FFFFFF"], ["#D7141A"]), parts: ["left:0;top:0;width:22px;height:100%;background:#11457E;clip-path:polygon(0 0,100% 50%,0 100%)"] },
    DE: { bg: nxH(["#000000"], ["#D00000"], ["#FFCE00"]) },
    DK: nxCross("#C8102E", "#FFFFFF", 35),
    EE: { bg: nxH(["#0072CE"], ["#000000"], ["#FFFFFF"]) },
    EL: { bg: `repeating-linear-gradient(to bottom, #014488 0 1.333px, #FFFFFF 1.333px 2.667px)`,
      parts: ["left:0;top:0;width:22px;height:6.67px;background:linear-gradient(to right, transparent 40%, #FFFFFF 40% 60%, transparent 60%), linear-gradient(to bottom, transparent 30%, #FFFFFF 30% 70%, transparent 70%), #014488"] },
    ES: { bg: nxH(["#AD1519"], ["#FABD00", 2], ["#AD1519"]) },
    FI: nxCross("#FFFFFF", "#18447E", 28),
    FR: { bg: nxV(["#000091"], ["#FFFFFF"], ["#E1000F"]) },
    HR: { bg: nxH(["#FF0000"], ["#FFFFFF"], ["#171796"]), parts: [nxDot(50, "repeating-conic-gradient(#FF0000 0 25%, #FFFFFF 0 50%) 0 0 / 4px 4px")] },
    HU: { bg: nxH(["#CE2939"], ["#FFFFFF"], ["#477050"]) },
    IE: { bg: nxV(["#169B62"], ["#FFFFFF"], ["#FF883E"]) },
    IT: { bg: nxV(["#008C45"], ["#F4F5F0"], ["#CD212A"]) },
    LT: { bg: nxH(["#FDB913"], ["#006A44"], ["#C1272D"]) },
    LU: { bg: nxH(["#EF3340"], ["#FFFFFF"], ["#00A3E0"]) },
    LV: { bg: nxH(["#9D2235", 2], ["#FFFFFF", 1], ["#9D2235", 2]) },
    MT: { bg: nxV(["#FFFFFF"], ["#CF142B"]) },
    NL: { bg: nxH(["#AD1D25"], ["#FFFFFF"], ["#1E4785"]) },
    PL: { bg: nxH(["#E9E8E7"], ["#D4213D"]) },
    PT: { bg: nxV(["#006600", 2], ["#FF0000", 3]), parts: [nxDot(40, "#FFE900")] },
    RO: { bg: nxV(["#002B7F"], ["#FCD116"], ["#CE1126"]) },
    SE: nxCross("#005583", "#FFC200", 31),
    SI: { bg: nxH(["#FFFFFF"], ["#0000FF"], ["#FF0000"]), parts: [nxDot(22, "#0000FF")] },
    SK: { bg: nxH(["#FFFFFF"], ["#0035AD"], ["#D21034"]), parts: [nxDot(18, "#D21034")] },
  };
  const nxFlagBand = (cc) => { const f = NX_FLAG[cc === "GR" ? "EL" : cc]; if (!f) return "";
    return `<span class="nx-flag" style="background:${f.bg}">${(f.parts || []).map((p) => `<i style="${p}"></i>`).join("")}</span>`; };
  const nxCountryBase = openCountry;
  openCountry = function (cc) {
    nxCountryBase(cc);
    const m = NX_MON[cc === "GR" ? "EL" : cc], body = $("profileBody");
    if (!m || !body) return;
    const tb = body.querySelector(".tb"), hero = body.querySelector(".hero");
    if (!tb || !hero || hero.querySelector(".nx-mon")) return;
    tb.insertAdjacentHTML("beforeend", `<p class="nx-mon__place"><b>${esc(m.name)}</b><span>${esc(m.year ? m.place + " · " + m.year : m.place)}</span></p>`);
    hero.classList.add("nx-mon-hero");
    const src = "monuments/" + (cc === "GR" ? "el" : cc.toLowerCase()) + ".jpg";
    hero.insertAdjacentHTML("afterbegin", `<div class="nx-mon" aria-hidden="true" style="--r:${m.r};--f:${m.f};--z:${m.z || 1};--x:${m.x || 0}">${NX_COLS.map((off, i) =>
      `<span class="nx-mon__col" style="--off:${off}px;--i:${i}"><img src="${src}" alt="" decoding="async"></span>`).join("")}
      ${nxFlagBand(cc)}<span class="nx-mon__credit">Photo: ${esc(m.credit)} / Unsplash</span></div>`);
  };
  /* ===================== end of nodo preview features ===================== */
