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
        - Saved people and Recently viewed, restyled.
        - Removed from Home: the calendar hero, the news block, the Files tile, the Parliament, Commission, Council and Calendar
          tiles (the Directory and Calendar tabs reach them), cabinet of the day, the country desk and seats by group.
        - The tab bar takes the edition's look: a deep blue bar, labels only, the current tab in a light pill with a gold node (app-wide in the preview).
     2. The map of your files (since 18 Oct 2026): files in bands by stage, a line between two files when they share an MEP,
        a Commissioner or a cabinet member, thicker when they share more. Tap a file to see whom it shares and with which files.
        Opens from Map on Home and in the Files view.
        With no followed file, the sections use all of nodo's files and say so.

     Features 1 to 8 of the previous round were promoted to the live app on 18 Oct 2026.
     3. Navigation and People (since 18 Oct 2026): four tabs, Today, People, Calendar, Files (News opens from the Files view).
        People opens on a landing page with three photo blocks, Parliament, Commission and Council, each cut into columns like the
        country pages; a block opens its section, and each section has a way back to People. Photos: Unsplash, hotlinked as its
        terms ask, credited on each block.
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
        <span class="ed-sh__acts"><button class="eu-btn eu-btn--sm ed-sh__btn ed-sh__btn--map" type="button" data-edmap="">${icon("share")}Map</button><button class="eu-btn eu-btn--sm ed-sh__btn" type="button" data-view="files">All files</button></span></div>
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
    /* Browse is gone: the Directory tab switches between Parliament, Commission and Council, and Calendar has its own tab. */
    $("edBody").querySelector(".ed-browse").remove();
    gone($("homeTiles"));
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


  /* ---------- 2. the map of your files ---------- */
  /* Who each file names, as a set of keys, from the same lists the file pages show. */
  const edPeople = (f) => { const m = membersOf(f); return new Set([...m.base, ...m.added].map((x) => x.key).filter((k) => BYKEY.has(k))); };
  function edPairs(files) {
    const sets = new Map(files.map((f) => [f.id, edPeople(f)])), out = [];
    for (let i = 0; i < files.length; i++) for (let j = i + 1; j < files.length; j++) {
      const a = sets.get(files[i].id), b = sets.get(files[j].id), shared = [...a].filter((k) => b.has(k));
      if (shared.length) out.push({ a: files[i], b: files[j], shared });
    }
    return out;
  }
  const ED_RANK = { ec: 0, cab: 1, ep: 2 };
  const edByRank = (keys) => keys.slice().sort((x, y) => ED_RANK[BYKEY.get(x).t] - ED_RANK[BYKEY.get(y).t] || BYKEY.get(x).o.name.localeCompare(BYKEY.get(y).o.name));
  function edMapHtml(sel, W) {
    const sc = edScope(), files = sc.files, pairs = edPairs(files);
    /* Bands top to bottom: idea to law. Up to two files side by side in a band, then a new row. */
    const nodes = new Map(); let y = 0; const bands = [];
    ED_STAGE.forEach((st, i) => {
      const fs = files.filter((f) => f.stage === st), rows = Math.max(1, Math.ceil(fs.length / 2)), h = 30 + (fs.length ? rows * 60 : 26) + 10;
      bands.push({ i, y, h, n: fs.length });
      fs.forEach((f, k) => {
        const r = Math.floor(k / 2), inRow = Math.min(2, fs.length - r * 2), c = k % 2;
        const w = inRow === 1 ? Math.min(220, W - 32) : (W - 40) / 2;
        const x = inRow === 1 ? (W - w) / 2 : 12 + c * (w + 16);
        nodes.set(f.id, { f, x, y: y + 30 + r * 60, w, h: 50 });
      });
      y += h;
    });
    const H = y;
    const mid = (n) => [n.x + n.w / 2, n.y + n.h / 2];
    const lit = (p) => sel && (p.a.id === sel || p.b.id === sel);
    const edge = (p) => { const [x1, y1] = mid(nodes.get(p.a.id)), [x2, y2] = mid(nodes.get(p.b.id));
      const bend = (x1 === x2 ? 40 : 0) + (y1 === y2 ? -30 : 0), cx = (x1 + x2) / 2 + bend, cy = (y1 + y2) / 2 + (y1 === y2 ? -26 : 0);
      const w = (1.5 + Math.min(p.shared.length, 8) * 0.6).toFixed(1);
      return `<path class="${lit(p) ? "on" : sel ? "dim" : ""}" d="M${x1.toFixed(1)} ${y1.toFixed(1)}Q${cx.toFixed(1)} ${cy.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}" style="stroke-width:${lit(p) ? (+w + 1.5).toFixed(1) : w}"/>`; };
    const svg = `<svg class="edm-lines" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true">${pairs.filter((p) => !lit(p)).map(edge).join("")}${pairs.filter(lit).map(edge).join("")}</svg>`;
    const band = (b) => `<div class="edm-band${b.i % 2 ? "" : " alt"}" style="top:${b.y}px;height:${b.h}px"><span class="edm-band__l">${b.i + 1} · ${esc(ED_STEP[b.i])}</span>${b.n ? "" : `<span class="edm-band__none">None of ${sc.mine ? "your" : "nodo's"} files</span>`}</div>`;
    const links = new Map(); pairs.forEach((p) => { links.set(p.a.id, (links.get(p.a.id) || 0) + 1); links.set(p.b.id, (links.get(p.b.id) || 0) + 1); });
    const node = ({ f, x, y: ny, w, h }) => { const on = f.id === sel, l = links.get(f.id) || 0, moved = typeof nxMoved === "function" && nxMoved(f).length;
      return `<button class="edm-node${on ? " is-on" : sel && !pairs.some((p) => lit(p) && (p.a.id === f.id || p.b.id === f.id)) ? " is-dim" : ""}" type="button" data-edmap="${esc(f.id)}" aria-pressed="${on}"
        style="left:${x.toFixed(1)}px;top:${ny}px;width:${w.toFixed(1)}px;height:${h}px" aria-label="${esc(`${f.short}. Shares people with ${l} other ${pl(l, "file", "files")}.${moved ? " Moved in the last 7 days." : ""}`)}">${moved ? `<i class="ed-dot"></i>` : ""}<span>${esc(f.short)}</span></button>`; };
    /* Under the map: the selected file, the files it shares people with, and who those people are. */
    let panel;
    if (sel && nodes.has(sel)) {
      const f = FILE_BY[sel], mine = pairs.filter(lit).map((p) => ({ other: p.a.id === sel ? p.b : p.a, shared: edByRank(p.shared) })).sort((a, b) => b.shared.length - a.shared.length);
      const others = files.length - 1;
      const item = ({ other, shared }) => { const names = shared.slice(0, 3).map((k) => BYKEY.get(k).o.name), more = shared.length - names.length;
        return row({ attrs: tap(`data-edmap="${esc(other.id)}"`), lead: `<span class="edm-count">${shared.length}</span>`, name: esc(other.short),
          meta: esc(names.join(", ") + (more > 0 ? ` and ${more} more` : "")), wrap: true }); };
      panel = `<div class="edm-panel"><div class="ed-sh"><div><h3 class="ed-h edm-h">${esc(f.short)}</h3>
          <p class="ed-cap">${mine.length ? `Shares people with ${mine.length} of ${sc.mine ? "your" : "nodo's"} other ${others} files` : "Shares no one with the other files on this map"}</p></div>
          <button class="eu-btn eu-btn--sm ed-sh__btn" type="button" data-file="${esc(f.id)}">Open</button></div>
        ${mine.length ? `<div class="list">${mine.map(item).join("")}</div>` : ""}</div>`;
    } else {
      const top = [...links].sort((a, b) => b[1] - a[1])[0];
      panel = `<div class="edm-panel"><p class="edm-tip">Tap a file to see whom it shares and with which files.${top ? ` ${esc(FILE_BY[top[0]].short)} shares people with the most: ${top[1]} ${pl(top[1], "file", "files")}.` : ""}</p></div>`;
    }
    return `<div class="edm" style="height:${H}px">${bands.map(band).join("")}${svg}${[...nodes.values()].map(node).join("")}</div>${panel}`;
  }
  function edOpenMap(sel) {
    const sc = edScope();
    if (!FILES.length) return;
    if (state.open && state.open.startsWith("map:") && $("edmHost")) { edMapPaint(sel); return; }
    state.open = "map:" + (sel || "");
    showProfile(`<div class="tb">${backBtn}${icon("back")}</button></div>
      <div class="hero"><h2 class="eu-headline" id="pName">Untangle <strong>your files.</strong></h2>
        <p class="bio">Each band is a stage, from idea to law. A line joins two files that name the same MEP, Commissioner or cabinet member; the thicker the line, the more people they share.${sc.mine ? "" : " You follow no file yet, so this map shows all of nodo's files."}</p></div>
      <div id="edmHost"></div>
      <p class="foot">Built from the people listed on each file page, including the ones you added or removed.</p>`);
    edMapPaint(sel);
  }
  function edMapPaint(sel) {
    const host = $("edmHost"); if (!host) return;
    const W = Math.max(300, Math.min(host.clientWidth || 358, 488));
    host.innerHTML = edMapHtml(sel || "", W);
    if (sel) { const p = host.querySelector(".edm-panel"); if (p && p.getBoundingClientRect().top > innerHeight - 120) p.scrollIntoView({ behavior: "smooth", block: "start" }); }
    Track.log("map", { section: "files", item: sel || "" });
  }
  const edRouteBase = openRoute;
  openRoute = function (key) { if (key && key.startsWith("map:")) return edOpenMap(key.slice(4)); return edRouteBase(key); };
  document.addEventListener("click", (e) => {
    const m = e.target.closest("[data-edmap]"); if (!m) return;
    e.stopPropagation(); e.preventDefault();
    const id = m.dataset.edmap, cur = state.open && state.open.startsWith("map:") ? state.open.slice(4) : null;
    const next = cur !== null && id === cur ? "" : id;
    if (cur !== null) { state.open = "map:" + next; edMapPaint(next); } else edOpenMap(id);
  }, true);
  /* The map also opens from the Files view. */
  const edFilesViewBase = renderFilesView;
  renderFilesView = function () {
    edFilesViewBase();
    if (FILES.length) $("filesBody").insertAdjacentHTML("afterbegin", `<button class="eu-btn eu-btn--block ed-mapbtn" type="button" data-edmap="">${icon("share")}See your files on a map</button>`);
  };


  /* ---------- 3. navigation and the People landing page ---------- */
  const PP_PHOTO = (id) => `https://images.unsplash.com/photo-${id}?ixlib=rb-4.1.0&w=900&q=75&fm=jpg&fit=max`;
  const PP = [
    { v: "ep", k: "European", t: "Parliament", meta: "metaEp", img: PP_PHOTO("1639864281528-907c82a361c3"), credit: "Paolo Margari", place: "European Parliament, Brussels", r: 0.667, z: 1.3 },
    { v: "ec", k: "European", t: "Commission", meta: "metaEc", img: PP_PHOTO("1615997299664-e14af3b04637"), credit: "Carl Campbell", place: "Berlaymont, Brussels", r: 0.562, z: 1.45 },
    { v: "co", k: "Council of the", t: "European Union", meta: "metaCo", img: PP_PHOTO("1608817576136-0f3a56922823"), credit: "Christian Lue", place: "Member states' flags, Brussels", r: 0.667, z: 1.3 },
  ];
  const ppMeta = (id) => { const el = $(id); if (!el) return ""; const kids = [...el.children].map((c) => c.textContent.trim()).filter(Boolean); return kids.length ? kids.join(" · ") : el.textContent.trim(); };
  function renderPeople() {
    const card = (p) => `<button class="pp-card pp-card--${p.v}" type="button" data-dir="${p.v}" aria-label="${esc(`${p.k} ${p.t}. ${ppMeta(p.meta)}`)}">
        <span class="mon pp-mon" aria-hidden="true" style="--r:${p.r};--f:0;--z:${p.z};--x:${((p.z - 1) / 2).toFixed(3)}">${MON_COLS.map((off, i) =>
          `<span class="mon__col" style="--off:${off}px;--i:${i}"><img src="${p.img}" alt="" decoding="async" loading="lazy"></span>`).join("")}</span>
        <span class="pp-band" aria-hidden="true"></span>
        <span class="pp-row"><span class="pp-tx"><span class="pp-k">${esc(p.k)}</span><span class="pp-t">${esc(p.t)}</span><span class="pp-m">${esc(ppMeta(p.meta))}</span></span>
          <span class="pp-go" aria-hidden="true">${icon("arrow")}</span></span>
        <span class="pp-credit">${esc(p.place)} · Photo: ${esc(p.credit)} / Unsplash</span></button>`;
    $("vPeople").innerHTML = `<h1 class="eu-headline">Who do you need to <strong>reach?</strong></h1>
      <p class="pp-lead">Every MEP, Commissioner, cabinet member and Council delegation, one tap away.</p>
      <div class="pp-cards">${PP.map(card).join("")}</div>`;
  }
  (function ppMount() {
    if ($("vPeople")) return;
    $("vEp").insertAdjacentHTML("beforebegin", `<main id="vPeople" class="view" hidden aria-label="People"></main>`);
    VIEW_IDS.people = "vPeople";
    /* Tab bar: Today, People, Calendar, Files. News stays as a view, opened from Files. */
    const label = (id, txt) => { const b = $(id); [...b.childNodes].forEach((n) => { if (n.nodeType === 3 && n.textContent.trim()) n.textContent = txt; }); };
    label("navHome", "Today"); label("navDir", "People");
    $("navNews").hidden = true;
    $("navDir").addEventListener("click", (e) => { e.stopImmediatePropagation(); setView("people"); }, true);
  })();
  const ppRenderView = renderView;
  renderView = function () { ppRenderView(); if (state.view === "people") renderPeople(); };
  const ppSyncDock = syncDock;
  syncDock = function () {
    ppSyncDock();
    const v = state.view;
    if (v === "people") $("navDir").setAttribute("aria-current", "page");
    if (v === "news") $("navFiles").setAttribute("aria-current", "page");
    /* Each section keeps its switcher, with a way back to the People page in front of it. */
    document.querySelectorAll(".dirhost").forEach((h) => {
      if (h.querySelector(".pp-back")) return;
      h.insertAdjacentHTML("afterbegin", `<button class="eu-btn eu-btn--sm pp-back" type="button" data-view="people">${icon("back")}People</button>`);
    });
  };
  const ppFilesView = renderFilesView;
  renderFilesView = function () {
    ppFilesView();
    $("filesBody").insertAdjacentHTML("afterbegin", `<button class="eu-btn eu-btn--outline eu-btn--block ed-mapbtn" type="button" data-view="news">${icon("news") || ""}Latest news on your files</button>`);
  };
