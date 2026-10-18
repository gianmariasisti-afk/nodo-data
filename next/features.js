  /* ======================= nodo preview features =======================
     Source: next/features.js. tools/preview/build.mjs injects this file into the app's main script just before
     start-up, so it runs inside the same scope and uses the app's own helpers (row, icon, esc, searchAll, openFile,
     showProfile, Track, state, store). Nothing here reaches the live app until it is promoted.

     1. Home, "the Monday edition" (in testing since 18 Oct 2026):
        - a masthead on the deep ground: date and week number, a headline that names the week, search, and a week card
          (Monday to Friday, the plenary, dated steps on your files that week, the agenda or the next plenary);
        - Your files: each followed file with a five-step track from idea to law, what moved in the last 7 days and the next date;
        - Who ties them together: the people named on more than one of your files;
        - Coming up: dated steps on your files and plenary sittings in the four weeks after this one;
        - Saved people and Recently viewed, restyled; then Browse: the Parliament, Commission, Council and Calendar tiles as one compact row.
        - Removed from Home: the calendar hero, the news block, the Files tile, cabinet of the day, the country desk and seats by group.
        - The tab bar takes the edition's look: the current tab is a light pill (app-wide in the preview).
        With no followed file, the sections use all of nodo's files and say so.

     Features 1 to 8 of the previous round were promoted to the live app on 18 Oct 2026.
     ===================================================================== */

  /* ---------- 1. home: the Monday edition ---------- */
  const ED_STAGE = ["pre-proposal", "positions-in-preparation", "council-negotiating-box", "trilogue", "in-force"];
  const ED_STEP = ["Idea", "Positions", "Council", "Trilogue", "Law"];
  const ED_WEEK = { SXB: "a Strasbourg week", BRU: "a Brussels plenary week", C: "a committee week", G: "a group week", X: "a constituency week", _: "a quiet week" };
  /* The files the home speaks about: the ones you follow, or every file when you follow none. */
  const edScope = () => { const f = followedFiles(); return f.length ? { files: f, mine: true } : { files: FILES, mine: false }; };
  /* On Saturday and Sunday the home looks at the coming week. */
  const edMonday = () => { const t = new Date(), d = t.getDay(); return d === 0 || d === 6 ? addD(mondayOf(t), 7) : mondayOf(t); };
  const edAhead = () => { const d = new Date().getDay(); return d === 0 || d === 6; };
  const edFold = (s) => fold(s).replace(/[^a-z0-9]+/g, " ").trim();
  /* Dated steps on a set of files between two ISO dates, each step once even when two files list it. */
  function edSteps(files, from, to) {
    const seen = new Map();
    files.forEach((f) => (f.next || []).forEach((s) => {
      if (!s.date || s.date < from || s.date > to) return;
      const k = s.date + "|" + edFold(s.what);
      if (seen.has(k)) seen.get(k).files.push(f); else seen.set(k, { date: s.date, what: s.what, files: [f] });
    }));
    return [...seen.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  }
  /* Which institution a step belongs to, for its colour mark. Read from the step's own words. */
  const edInst = (what) => /council|working party|ministers|coreper|gac\b|presidency/i.test(what) ? "co"
    : /commission|proposal expected/i.test(what) ? "ec" : /plenary|parliament|committee|vote|itre|imco|libe|inta|budg/i.test(what) ? "ep" : "cal";

  function edGreeting() {
    const h = new Date().getHours(), fn = firstName(), wk = weekOf(edMonday()), ahead = edAhead();
    const kind = wk.place || wk.kind, phrase = ED_WEEK[kind];
    const hello = `${h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"}${fn ? ", " + esc(fn) : ""}.`;
    const line = phrase ? `${ahead ? "Next week is" : "It's"} ${phrase}.` : ahead ? "Here is next week." : "Here is your week.";
    return `${hello} <strong>${line}</strong>`;
  }
  renderGreeting = function () { const g = $("greet"); if (g) g.innerHTML = edGreeting(); };

  function edWeekHtml() {
    const today = new Date(), tIso = isoD(today), mon = edMonday(), wk = weekOf(mon), days = wk.days.slice(0, 5);
    const fri = isoD(addD(mon, 4)), sc = edScope();
    const pIdx = days.map((x, i) => (x.am === "P" || x.pm === "P" ? i : -1)).filter((i) => i >= 0);
    const col = (x) => {
      const isT = x.k === tIso, past = x.k < tIso, plen = x.am === "P" || x.pm === "P";
      return `<div class="ed-day${isT ? " is-today" : ""}${past ? " is-past" : ""}"><span class="ed-day__w">${esc(fmtD(x.d, { weekday: "short" }))}</span>
        <span class="ed-day__n">${x.d.getDate()}</span><i class="ed-day__node${plen ? " is-p" : ""}"></i></div>`;
    };
    const bar = pIdx.length ? `<div class="ed-bars"><span class="ed-bar ed-bar--ep" style="grid-column:${pIdx[0] + 1} / ${pIdx[pIdx.length - 1] + 2}"><i></i>${esc(wk.label)}</span></div>` : "";
    const steps = edSteps(sc.files, isoD(mon), fri), shown = steps.slice(0, 3);
    const ev = (s) => `<button class="ed-ev" type="button" data-file="${esc(s.files[0].id)}" data-filetab="next">
        <span class="ed-ev__d"><b>${esc(fmtD(fromIso(s.date), { weekday: "short" }))}</b>${fromIso(s.date).getDate()}</span>
        <span class="ed-ev__tx"><span class="ed-ev__what">${esc(s.what)}</span><span class="ed-ev__f"><i class="ed-mark ed-mark--${edInst(s.what)}"></i>${esc(s.files.map(fileTag).join(" · "))}</span></span></button>`;
    const np = nextPlenary(today);
    let act;
    if (np && np.start <= isoD(addD(mon, 6)) && np.end >= tIso) {
      const e = agEntry(np), ready = e.stage !== "none" && agHasItems(e), n = Object.values(e.days || {}).reduce((a, l) => a + ((l && l.length) || 0), 0);
      act = `<button class="eu-btn eu-btn--on-deep" type="button" data-view="agenda">${ready ? "Open the agenda" : "See the plenary"}${icon("arrow")}</button>
        <span class="ed-act__cap">${ready ? `${n} ${pl(n, "item", "items")} · ${esc((AG_LABEL[e.stage] || "Agenda").toLowerCase())}` : "Agenda not in nodo yet"}</span>`;
    } else {
      const p = plenaryLine(np, today);
      act = `<button class="eu-btn eu-btn--on-deep" type="button" data-view="cal">Open the calendar${icon("arrow")}</button>
        <span class="ed-act__cap">${esc(np ? `Next plenary: ${PLACE[np.place]}, ${p.s}` : p.t)}</span>`;
    }
    return `<div class="ed-week__head"><h2 class="ed-week__t">${edAhead() ? "Next week" : "This week"}</h2><span class="ed-week__w">Week ${isoWeek(mon)}</span></div>
      <p class="ed-week__lead">${esc(wk.lead)}</p>
      <div class="ed-strip" aria-hidden="true"><span class="ed-strip__thread"></span>${days.map(col).join("")}</div>
      ${bar}
      ${shown.length ? `<div class="ed-evs">${shown.map(ev).join("")}</div>` : `<p class="ed-week__none">${sc.mine ? "No dated step on your files this week." : "No dated step on nodo's files this week."}</p>`}
      ${steps.length > shown.length ? `<button class="ed-more" type="button" data-view="cal">${steps.length - shown.length} more this week</button>` : ""}
      <div class="ed-act">${act}</div>`;
  }

  /* A five-step track from idea to law. The words beside it carry the same information. */
  function edTrack(f) {
    const at = ED_STAGE.indexOf(f.stage);
    const seg = ED_STAGE.map((_, i) => `<i class="${i < at ? "done" : i === at ? "now" : ""}"></i>`).join("");
    return `<span class="ed-track" aria-hidden="true">${seg}</span>`;
  }
  function edFilesHtml() {
    if (!FILES.length) return "";
    const sc = edScope(), tIso = todayIso();
    const moved = (f) => (typeof nxMoved === "function" ? nxMoved(f) : []);
    const nextOf = (f) => (f.next || []).filter((s) => s.date && s.date >= tIso).sort((a, b) => (a.date < b.date ? -1 : 1))[0] || null;
    const list = sc.files.slice().sort((a, b) => {
      const ma = moved(a).length ? 0 : 1, mb = moved(b).length ? 0 : 1; if (ma !== mb) return ma - mb;
      const na = nextOf(a), nb = nextOf(b); if (na && nb) return na.date < nb.date ? -1 : na.date > nb.date ? 1 : 0;
      return na ? -1 : nb ? 1 : 0;
    });
    const nMoved = list.filter((f) => moved(f).length).length;
    const item = (f) => {
      const ev = moved(f), last = ev[ev.length - 1], n = nextOf(f), at = ED_STAGE.indexOf(f.stage);
      const lead = (f.ep && f.ep.lead) || [];
      const sub = last ? `<i class="ed-dot"></i><b>Moved</b> · ${esc(nxClip(last.title, 64))}`
        : esc(f.stage === "pre-proposal" ? "Not proposed yet" : f.stage === "in-force" ? "In force" : lead.length ? `${lead.join("-")} in the Parliament` : STAGE[f.stage] ? STAGE[f.stage][0] : "");
      const where = `${at >= 0 ? ED_STEP[at] : (STAGE[f.stage] || [f.stage])[0]} · ${n ? "next " + fdDate(n.date) : "no date set"}`;
      return `<button class="ed-file" type="button" data-file="${esc(f.id)}" aria-label="${esc(`${f.short}. ${last ? "Moved in the last 7 days. " : ""}Stage ${at + 1} of 5, ${(STAGE[f.stage] || [f.stage])[0]}. ${n ? "Next: " + fdDate(n.date, true) + ", " + n.what : "No date set"}.`)}">
        <span class="ed-file__tx"><span class="ed-file__n">${esc(f.short)}</span><span class="ed-file__s">${sub}</span></span>
        <span class="ed-file__st">${edTrack(f)}<span class="ed-file__w">${esc(where)}</span></span></button>`;
    };
    const cap = sc.mine ? `${list.length} followed${UPD.status === "done" ? ` · ${nMoved} moved in the last 7 days` : ""}` : `All ${list.length} files nodo follows`;
    return `<div class="ed-sh"><div><h2 class="ed-h" id="edFilesH">Your files</h2><p class="ed-cap">${esc(cap)}</p></div>
        <button class="eu-btn eu-btn--sm ed-sh__btn" type="button" data-view="files">All files</button></div>
      ${sc.mine ? "" : `<div class="hint ed-hint"><span>Follow the files you work on and this page is built around them.</span><button class="eu-btn eu-btn--sm" type="button" data-nxpick>Choose files</button></div>`}
      <div class="ed-files"><div class="ed-files__key" aria-hidden="true"><span>File</span><span>Idea → Law</span></div>${list.map(item).join("")}</div>`;
  }

  /* People named on more than one file in scope, from the same lists the file pages show (your edits included). */
  function edTies(files) {
    const by = new Map();
    files.forEach((f) => {
      const m = membersOf(f), seen = new Set();
      [...m.base, ...m.added].forEach((x) => {
        if (seen.has(x.key) || !BYKEY.has(x.key)) return; seen.add(x.key);
        if (!by.has(x.key)) by.set(x.key, { key: x.key, t: BYKEY.get(x.key).t, on: [] });
        by.get(x.key).on.push({ f, role: x.role });
      });
    });
    const tRank = { ec: 0, cab: 1, ep: 2 }, rRank = (p) => Math.min(...p.on.map((o) => { const i = ["lead", "rapporteur", "associated", "cabinet", "shadow", "opinion-rapporteur", "opinion-shadow", "relevant", "added"].indexOf(o.role); return i < 0 ? 9 : i; }));
    return [...by.values()].filter((p) => p.on.length > 1)
      .sort((a, b) => b.on.length - a.on.length || tRank[a.t] - tRank[b.t] || rRank(a) - rRank(b) || BYKEY.get(a.key).o.name.localeCompare(BYKEY.get(b.key).o.name));
  }
  const ED_ROLE = { lead: "Lead", associated: "Associated", cabinet: "Cabinet", added: "Added by you" };
  /* Roles grouped: "Rapporteur on Chips · Shadow on Omnibus"; a cabinet member reads "Cabinet Virkkunen · DNA, DFA". */
  const edRoles = (p) => {
    const o = BYKEY.get(p.key).o;
    if (p.t === "cab") return `Cabinet ${o.com.short} · ${p.on.map((x) => fileTag(x.f)).join(", ")}`;
    const g = new Map(); p.on.forEach((x) => { const r = ED_ROLE[x.role] || ROLE_ONE[x.role] || x.role; g.set(r, [...(g.get(r) || []), fileTag(x.f)]); });
    return [...g].map(([r, t]) => `${r} on ${t.join(", ")}`).join(" · ");
  };
  function edTiesHtml() {
    const sc = edScope(), ties = edTies(sc.files);
    if (!ties.length) return "";
    const top = ties[0], o = BYKEY.get(top.key).o, n = top.on.length, of = sc.mine ? "your" : "nodo's";
    const who = top.t === "ec" ? `${o.title}. Lead or associated commissioner on ${n} of ${of} files.`
      : top.t === "cab" ? `${o.role} · Cabinet ${o.com.short}. Named on ${n} of ${of} files.`
      : `${countryName(o.country)} · ${o.group}. ${edRoles(top)}.`;
    const tint = top.t === "ep" ? "sky" : "apricot";
    const k = Math.min(n, 8), spokes = Array.from({ length: k }, (_, i) => { const a = -Math.PI / 2 + i * 2 * Math.PI / k; return [56 + 44 * Math.cos(a), 56 + 44 * Math.sin(a)]; });
    const net = `<svg class="ed-net__svg" viewBox="0 0 112 112" aria-hidden="true">${spokes.map(([x, y]) => `<path d="M56 56L${x.toFixed(1)} ${y.toFixed(1)}"/>`).join("")}${spokes.map(([x, y]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="7"/>`).join("")}</svg>`;
    const rest = ties.slice(1, 6).map((p) => { const q = BYKEY.get(p.key).o;
      return row({ attrs: tap(`data-open="${esc(p.key)}"`), lead: avaOf(p.key), name: esc(q.name), meta: esc(edRoles(p)), wrap: true, tail: `<span class="eu-badge ed-badge">${p.on.length} files</span>` }); }).join("");
    return `<div class="ed-sh"><div><h2 class="ed-h">Who ties them together</h2><p class="ed-cap">People named on more than one of ${of} files</p></div></div>
      <button class="ed-hero ed-hero--${tint}" type="button" data-open="${esc(top.key)}" aria-label="${esc(`${o.name}, named on ${n} of ${of} files. Open profile.`)}">
        <span class="ed-hero__tx"><span class="ed-hero__n">${n}<small> of ${sc.files.length}</small></span><span class="ed-hero__name">${esc(o.name)}</span><span class="ed-hero__who">${esc(who)}</span></span>
        <span class="ed-net">${net}<span class="ed-net__hub">${avaOf(top.key)}</span></span></button>
      ${rest ? `<div class="list">${rest}</div>` : ""}`;
  }

  /* After the week on the card: four weeks of dated steps and plenary sittings. */
  function edNextHtml() {
    const sc = edScope(), from = isoD(addD(edMonday(), 7)), to = isoD(addD(edMonday(), 34));
    const items = edSteps(sc.files, from, to).map((s) => ({ date: s.date, what: s.what, meta: s.files.map((f) => f.short).join(" · "), inst: edInst(s.what), attrs: `data-file="${esc(s.files[0].id)}" data-filetab="next"` }));
    CAL.sessions.filter((s) => s.start >= from && s.start <= to).forEach((s) => {
      const a = fromIso(s.start), b = fromIso(s.end);
      items.push({ date: s.start, end: s.end, what: `Plenary · ${PLACE[s.place]}`, meta: "Parliament", inst: "ep", attrs: `data-view="cal"`, range: s.start === s.end ? "" : `${a.getDate()}–${b.getDate()}` });
    });
    items.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    if (!items.length) return "";
    const it = (x) => { const d = fromIso(x.date);
      return `<button class="ed-up" type="button" ${x.attrs}><i class="ed-mark ed-mark--${x.inst}" aria-hidden="true"></i>
        <span class="ed-up__d"><b>${esc(x.range || String(d.getDate()))}</b><span>${esc(fmtD(d, { month: "short" }))}${x.range ? "" : " · " + esc(fmtD(d, { weekday: "short" }))}</span></span>
        <span class="ed-up__tx"><span class="ed-up__w">${esc(x.what)}</span><span class="ed-up__m">${esc(x.meta)}</span></span></button>`; };
    return `<div class="ed-sh"><div><h2 class="ed-h">Coming up</h2><p class="ed-cap">The four weeks after this one</p></div></div>
      <div class="ed-ups">${items.slice(0, 6).map(it).join("")}</div>`;
  }

  function edRender() {
    if (!$("edMast")) return;
    const now = new Date();
    $("edDate").textContent = `${now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })} · Week ${isoWeek(now)}`;
    renderGreeting();
    $("edWeek").innerHTML = edWeekHtml();
    $("edFiles").innerHTML = edFilesHtml();
    $("edTies").innerHTML = edTiesHtml();
    $("edNext").innerHTML = edNextHtml();
    ["edFiles", "edTies", "edNext"].forEach((id) => { $(id).hidden = !$(id).innerHTML.trim(); });
  }

  /* Rebuild Home around the masthead. Existing parts move; none is removed, so every handler on them still works. */
  (function edMount() {
    const v = $("vHome"); if (!v || $("edMast")) return;
    const mast = document.createElement("section");
    mast.id = "edMast"; mast.className = "ed-mast"; mast.setAttribute("aria-label", "Today");
    v.prepend(mast);
    mast.append(v.querySelector(".topbar"));
    mast.insertAdjacentHTML("beforeend", `<p class="ed-eyebrow" id="edDate"></p>`);
    mast.append($("homeTop"), v.querySelector(":scope > .eu-search"), $("topics"));
    mast.insertAdjacentHTML("beforeend", `<section id="edWeek" class="ed-week" aria-label="Your week"></section>`);
    mast.after($("homeResults"));
    $("homeResults").insertAdjacentHTML("afterend", `<div id="edBody">
      <section id="edFiles" class="ed-sec" aria-labelledby="edFilesH"></section>
      <section id="edTies" class="ed-sec" aria-label="Who ties your files together"></section>
      <section id="edNext" class="ed-sec" aria-label="Coming up"></section>
      <h2 class="ed-h ed-browse">Browse</h2></div>`);
    $("hq").placeholder = "A name, a file, a committee, a date";
    /* What the new home replaces leaves Home: cabinet of the day, country desk and seats by group (their data stays in the
       Commission and Parliament views). Saved and recently viewed stay, then Browse as one compact row, then the data note. */
    const body = $("homeBody"), gone = (el) => el && el.classList.add("ed-gone");
    gone($("spotDate") && $("spotDate").closest("h3")); gone($("spot"));
    gone($("deskCountry").previousElementSibling); gone($("deskCountry")); gone($("deskOut"));
    gone($("bars").previousElementSibling); gone($("bars"));
    const sh = $("seeSaved").closest("h3"); if (sh && sh.firstChild && sh.firstChild.nodeType === 3) sh.firstChild.textContent = "Saved people ";
    const br = $("edBody").querySelector(".ed-browse");
    $("srcNote").before(br, $("homeTiles"));
  })();

  const edHomeBase = renderHome;
  renderHome = function () {
    edHomeBase();
    const searching = !$("homeResults").hidden;
    $("edWeek").hidden = searching; $("edBody").hidden = searching;
    if (!searching) edRender();
  };
  /* Follows, the "which files" sheet and the file timelines (loaded after start-up) all call renderFiles. */
  const edFilesBase = renderFiles;
  renderFiles = function () { edFilesBase(); if (state.view === "home" && !state.hq) edRender(); };
