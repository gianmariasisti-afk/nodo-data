  /* ======================= nodo preview features =======================
     Source: next/features.js. tools/preview/build.mjs injects this file into the app's main script just before
     start-up, so it runs inside the same scope and uses the app's own helpers (row, icon, esc, searchAll, openFile,
     showProfile, Track, state, store). Nothing here reaches the live app until it is promoted.

     1. Home, "the Monday edition" (in testing since 18 Oct 2026):
        - a masthead on the deep ground: date and week number, a headline that names the week, search, and a week card
          (Monday to Friday, the plenary, dated steps on your files that week, the agenda or the next plenary);
        - Your files: each followed file with a five-step track from idea to law, what moved in the last 7 days and the next date;
        - Coming up: dated steps on your files and plenary sittings in the four weeks after this one, one card per week in a
          sideways carousel (since 19 Oct 2026; replaced the vertical timeline);
        - On these files (since 20 Oct 2026): the rapporteurs, lead commissioner and cabinet leads on the files of the week card
          in view, saved people first, then the Council working party; it follows the carousel;
        - Also on (since 20 Oct 2026): under each person on a file page and in On these files, the other nodo files they are
          named on. Replaced "Who ties them together" (removed 20 Oct 2026); profiles already list a person's files.
        - Saved people and Recently viewed, restyled.
        - Removed from Home: the calendar hero, the news block, the Files tile, the Parliament, Commission, Council and Calendar
          tiles (the Directory and Calendar tabs reach them), cabinet of the day, the country desk and seats by group.
     2. The map of your files (since 18 Oct 2026): files in bands by stage, a line between two files when they share an MEP,
        a Commissioner or a cabinet member, thicker when they share more. Tap a file to see whom it shares and with which files.
        Opens from Map on Home and in the Files view.
        With no followed file, the sections use all of nodo's files and say so.

     Features 1 to 8 of the previous round were promoted to the live app on 18 Oct 2026.
     3. Navigation and People (since 18 Oct 2026): four tabs, Today, People, Calendar, Files (News opens from the Files view).
        People opens on a landing page with three photo blocks, Parliament, Commission and Council, each cut into columns like the
        country pages; a block opens its section, and each section has a way back to People. Parliament and Commission photos: Unsplash,
        hotlinked as its terms ask, credited on each block. The Council photo (Europa building) is from Wikimedia Commons, CC BY-SA 4.0, kept in monuments/.
     4. Burger menu (since 19 Oct 2026): the floating tab bar is replaced by a top bar (wordmark back to Today, your profile, Menu)
        and a drawer from the right: Today, People with Parliament, Commission and Council, Calendar, Files, then About nodo
        and your profile card (News opens from Files; Saved people from your profile and Today). The bar takes the masthead's deep ground on Today and the light surface elsewhere.
     6. About nodo and feedback (since 20 Oct 2026): an About view from the menu (what nodo covers, where the data comes from,
        how fresh it is, what it is not) and one inbox, feedback@nodo.eu. Send feedback on the About page and the
        search request card open an email with the screen you came from filled in.
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

  /* The week card (reworked 22 Oct 2026): one date per day, today and the days ahead first, past steps folded,
     no doc or article numbers, the file named once with its institution in words, one plenary band instead of a
     thread, nodes and a chip, and one action named after what it opens. */
  const ED_HOME_TAG = { "digital-omnibus-data": "Digital Omnibus", "tech-sovereignty-package": "Chips Act 2.0 · CADA", "ai-act-implementation": "AI Act" };
  const edTag = (f) => ED_HOME_TAG[f.id] || f.short;
  const ED_INST = { co: "Council", ec: "Commission", ep: "Parliament" };
  /* Home wording for a step: drops a trailing reference in brackets (doc, articles) and the file's own short tag
     when the meta line already names the file. The file page keeps the full wording. */
  function edWhat(s) {
    let w = String(s.what).replace(/\s*\((?:doc|docs|art|arts|article|articles|ST|COM|CM)\b[^)]*\)\s*$/i, "");
    const t = s.files.length === 1 && FILE_TAG[s.files[0].id];
    if (t && t.length <= 4) w = w.replace(new RegExp(`\\b${t}\\s+(?=\\S)`), "");
    /* The meta line names the institution: "Council Audiovisual…" reads "Audiovisual…". */
    if (/^Council\s+(?!of\b)/.test(w) && edInst(s.what) === "co") w = w.replace(/^Council\s+/, "").replace(/^./, (c) => c.toUpperCase());
    return w;
  }
  function edWeekHtml() {
    const today = new Date(), tIso = isoD(today), mon = edMonday(), wk = weekOf(mon), days = wk.days.slice(0, 5);
    const fri = isoD(addD(mon, 4)), sc = edScope();
    const pIdx = days.map((x, i) => (x.am === "P" || x.pm === "P" ? i : -1)).filter((i) => i >= 0);
    const col = (x) => {
      const isT = x.k === tIso, past = x.k < tIso;
      return `<div class="ed-day${isT ? " is-today" : ""}${past ? " is-past" : ""}"><span class="ed-day__w">${esc(fmtD(x.d, { weekday: "short" }))}</span>
        <span class="ed-day__n">${x.d.getDate()}</span></div>`;
    };
    const band = pIdx.length ? `<span class="ed-pband" style="grid-column:${pIdx[0] + 1} / ${pIdx[pIdx.length - 1] + 2}"></span>` : "";
    const steps = edSteps(sc.files, isoD(mon), fri);
    const ahead = steps.filter((s) => s.date >= tIso), earlier = steps.filter((s) => s.date < tIso);
    /* Up to three steps, cut at a day boundary so a day never shows half its steps; the first day always shows. */
    const dayL = [...new Set(ahead.map((s) => s.date))].map((d) => ahead.filter((s) => s.date === d));
    let shown = dayL.length ? dayL[0].slice(0, 3) : [];
    for (const l of dayL.slice(1)) { if (shown.length + l.length > 3) break; shown = shown.concat(l); }
    const rest = ahead.slice(shown.length);
    const byDay = (l) => { const m = new Map(); l.forEach((s) => { if (!m.has(s.date)) m.set(s.date, []); m.get(s.date).push(s); }); return [...m.entries()]; };
    const it = (s) => {
      const inst = ED_INST[edInst(s.what)], meta = [inst, s.files.map(edTag).join(" · ")].filter(Boolean).join(" · ");
      return `<button class="ed-it" type="button" data-file="${esc(s.files[0].id)}" data-filetab="next"><span class="ed-it__what">${esc(edWhat(s))}</span><span class="ed-it__m">${esc(meta)}</span></button>`;
    };
    const groups = (l, past) => byDay(l).map(([d, l2]) => { const dt = fromIso(d);
      return `<div class="ed-dg${past ? " is-past" : ""}"><span class="ed-dg__d"><b>${esc(fmtD(dt, { weekday: "short" }))}</b>${dt.getDate()}</span><div class="ed-dg__l">${l2.map(it).join("")}</div></div>`; }).join("");
    const label = [rest.length && `${rest.length} more`, earlier.length && `${earlier.length} earlier`].filter(Boolean).join(" · ");
    const fold = label ? `<div class="ed-fold" id="edFold" hidden>${groups(rest, false)}${earlier.length ? `<p class="ed-fold__k">Earlier this week</p>${groups(earlier, true)}` : ""}</div>
      <button class="ed-more" type="button" data-edmore="" aria-expanded="false" aria-controls="edFold" data-label="${esc(label + " this week")}">${esc(label)} this week</button>` : "";
    const none = sc.mine ? "Nothing left on your files this week." : "Nothing left on nodo's files this week.";
    const np = nextPlenary(today);
    let act;
    if (np && np.start <= isoD(addD(mon, 6)) && np.end >= tIso) {
      const e = agEntry(np), ready = e.stage !== "none" && agHasItems(e);
      act = `<button class="eu-btn eu-btn--on-deep" type="button" data-view="agenda">${ready ? "Plenary agenda" : "See the plenary"}${icon("arrow")}</button>
        <span class="ed-act__cap">${esc(ready ? agUpdated(e) || AG_LABEL[e.stage] || "" : "Agenda not in nodo yet")}</span>`;
    } else {
      const p = plenaryLine(np, today);
      act = `<button class="eu-btn eu-btn--on-deep" type="button" data-view="cal">Open the calendar${icon("arrow")}</button>
        <span class="ed-act__cap">${esc(np ? `Next plenary: ${PLACE[np.place]}, ${p.s}` : p.t)}</span>`;
    }
    return `<div class="ed-week__head"><h2 class="ed-week__t">${edAhead() ? "Next week" : "This week"}</h2></div>
      <p class="ed-week__lead">${esc(wk.lead)}</p>
      <div class="ed-strip" aria-hidden="true">${days.map(col).join("")}${band}</div>
      <p class="ed-week__k">${sc.mine ? "On your files" : "On nodo's files"}</p>
      ${shown.length ? `<div class="ed-evs">${groups(shown, false)}</div>` : `<p class="ed-week__none">${none}</p>`}
      ${fold}
      <div class="ed-act">${act}</div>`;
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-edmore]"); if (!b) return;
    e.stopPropagation(); e.preventDefault();
    const f = $("edFold"); if (!f) return;
    const open = f.hidden; f.hidden = !open; b.setAttribute("aria-expanded", String(open));
    b.textContent = open ? "Show less" : b.dataset.label;
  }, true);

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

  /* Also on (since 20 Oct 2026): the other nodo files a person is named on, shown under their row on a file page and in
     On these files. It replaces the Home section "Who ties them together", which repeated the people the file pages list. */
  function edAlsoOn(key, except) {
    return FILES.filter((f) => !except.has(f.id) && (() => { const m = membersOf(f); return [...m.base, ...m.added].some((x) => x.key === key); })());
  }
  const edAlsoHtml = (key, except) => { const fs = edAlsoOn(key, except);
    return fs.length ? `<span class="ed-also">Also on ${fs.map((f) => `<b>${esc(edTag(f))}</b>`).join(", ")}</span>` : ""; };
  /* File page rows: the live fileRow, with "Also on" added at the end of the row body (before the star or remove button). */
  const edFileRow0 = fileRow;
  fileRow = (x) => {
    const h = edFileRow0(x), f = curFile(); if (!f) return h;
    const add = edAlsoHtml(x.key, new Set([f.id])), i = h.lastIndexOf('<button class="eu-iconbtn');
    return add && i > 7 && h.slice(i - 7, i) === "</span>" ? h.slice(0, i - 7) + add + h.slice(i - 7) : h;
  };

  /* After the week on the card: four weeks of dated steps and plenary sittings, one card per week in a carousel
     (since 19 Oct 2026). A meeting on consecutive days of the same week shows once, as a range ("26–27"). */
  let edWeeks = [], edWkI = 0;
  function edNextHtml() {
    const sc = edScope(), mon0 = addD(edMonday(), 7), from = isoD(mon0), to = isoD(addD(edMonday(), 34));
    const items = edSteps(sc.files, from, to).map((s) => ({ date: s.date, end: s.date, what: s.what, meta: s.files.map((f) => f.short).join(" · "), files: s.files.map((f) => f.id), inst: edInst(s.what), attrs: `data-file="${esc(s.files[0].id)}" data-filetab="next"` }));
    CAL.sessions.filter((s) => s.start >= from && s.start <= to).forEach((s) => {
      items.push({ date: s.start, end: s.end, what: `Plenary · ${PLACE[s.place]}`, meta: "Parliament", files: [], inst: "ep", attrs: `data-view="cal"` });
    });
    edWeeks = [];
    if (!items.length) return "";
    items.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const weeks = edWeeks = [0, 1, 2, 3].map((k) => ({ mon: addD(mon0, 7 * k), list: [] }));
    items.forEach((x) => {
      const w = weeks[Math.min(3, Math.floor(Math.round((fromIso(x.date) - mon0) / 864e5) / 7))], prev = w.list.find((y) => y.what === x.what && y.meta === x.meta && isoD(addD(fromIso(y.end), 1)) === x.date);
      if (prev) prev.end = x.end; else w.list.push(x);
    });
    const day = (x) => { const a = fromIso(x.date), b = fromIso(x.end), same = x.date === x.end;
      return same ? `${fmtD(a, { weekday: "short" })} ${a.getDate()}` : `${fmtD(a, { weekday: "short" })}–${fmtD(b, { weekday: "short" })} ${a.getDate()}–${b.getDate()}`; };
    const it = (x) => `<button class="ed-wk__it" type="button" ${x.attrs}><i class="ed-mark ed-mark--${x.inst}" aria-hidden="true"></i>
        <span class="ed-wk__tx"><span class="ed-wk__d">${esc(day(x))}</span><span class="ed-wk__w">${esc(x.what)}</span><span class="ed-wk__m">${esc(x.meta)}</span></span></button>`;
    const card = (w) => {
      const n = w.list.length, nf = new Set(w.list.flatMap((x) => x.files)).size, wk = weekOf(w.mon), ph = ED_WEEK[wk.place || wk.kind];
      const kind = ph ? ph.replace(/^an? /, "").replace(/^./, (c) => c.toUpperCase()) : "";
      const count = n ? [`${n} ${n === 1 ? "item" : "items"}`, nf ? `${nf} ${nf === 1 ? "file" : "files"}` : ""].filter(Boolean).join(" · ") : "Nothing dated yet";
      const title = `Week of ${w.mon.getDate()} ${fmtD(w.mon, { month: "short" })}`, more = n - 3;
      return `<section class="ed-wk" aria-label="${esc(`${title}, ${count}`)}">
        <div class="ed-wk__h"><span class="ed-wk__t">${esc(title)}</span><span class="ed-wk__c">${esc(kind || "")}</span><span class="ed-wk__c">${esc(count)}</span></div>
        ${n ? w.list.slice(0, 3).map(it).join("") : `<p class="ed-wk__none">${sc.mine ? "No dated step on your files this week." : "No dated step on nodo's files this week."}</p>`}
        ${more > 0 ? `<button class="ed-wk__more" type="button" data-view="cal">${more} more in the calendar</button>` : ""}</section>`;
    };
    return `<div class="ed-sh"><div><h2 class="ed-h">Coming up</h2><p class="ed-cap">The four weeks after this one</p></div></div>
      <div class="ed-wks" id="edWks" tabindex="0" role="region" aria-label="Coming up, one card per week. Scroll sideways for later weeks.">${weeks.map(card).join("")}</div>
      <div class="ed-dots" aria-hidden="true">${weeks.map((_, i) => `<i${i === edWkI ? ' class="is-on"' : ""}></i>`).join("")}</div>`;
  }
  /* The dots follow the card that is in view. */
  function edWksWire() {
    const t = $("edWks"); if (!t) return;
    const dots = [...$("edNext").querySelectorAll(".ed-dots i")];
    let raf = 0;
    t.addEventListener("scroll", () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => {
      const c = t.querySelector(".ed-wk"), step = c ? c.offsetWidth + 8 : 1;
      let i = Math.round(t.scrollLeft / step); if (t.scrollLeft + t.clientWidth >= t.scrollWidth - 4) i = dots.length - 1;
      dots.forEach((d, k) => d.classList.toggle("is-on", k === i));
      if (i !== edWkI) { edWkI = i; edRoomPaint(); }
    }); }, { passive: true });
  }

  /* On these files (since 20 Oct 2026): the people who hold the files of the week card in view. It names roles on the
     files, never attendance: MEPs and cabinets do not sit in Council working parties, and a proposal date has no room.
     Key people per file: rapporteurs, the lead commissioner and the first two cabinet members the file lists (the file
     data lists them in order of relevance). Shadows, opinion rapporteurs and everyone else stay on the file page. */
  function edRoomPeople(files) {
    const by = new Map();
    files.forEach((f) => {
      const m = membersOf(f), all = [...m.base, ...m.added];
      const key = all.filter((x) => x.role === "rapporteur" || x.role === "lead" || x.role === "added")
        .concat(all.filter((x) => x.role === "cabinet").slice(0, 2));
      key.forEach((x) => {
        if (!BYKEY.has(x.key)) return;
        if (!by.has(x.key)) by.set(x.key, { key: x.key, t: BYKEY.get(x.key).t, role: x.role, cmte: x.cmte, files: [] });
        by.get(x.key).files.push(f);
      });
    });
    /* Saved people first, then one of each kind in turn (rapporteur, commissioner, cabinet) so the first five show all three sides. */
    const nm = (a, b) => BYKEY.get(a.key).o.name.localeCompare(BYKEY.get(b.key).o.name), all = [...by.values()];
    const fav = all.filter((p) => state.favs.has(p.key)).sort(nm), rest = all.filter((p) => !state.favs.has(p.key));
    const q = [["rapporteur", "added"], ["lead"], ["cabinet"]].map((r) => rest.filter((p) => r.includes(p.role)).sort(nm)), out = [...fav];
    while (q.some((x) => x.length)) q.forEach((x) => { if (x.length) out.push(x.shift()); });
    return out;
  }
  const edRoomRole = (p) => {
    const o = BYKEY.get(p.key).o, on = p.files.map((f) => f.short).join(", ");
    if (p.t === "cab") return `${o.role} · Cabinet ${o.com.short} · ${on}`;
    if (p.t === "ec") return `Lead commissioner · ${on}`;
    if (p.role === "added") return `Added by you · ${on}`;
    const c = (p.cmte || "").split(" · ")[0];
    return `${ROLE_ONE[p.role] || p.role}${c ? ", " + c : ""} · ${o.group} · ${on}`;
  };
  function edRoomHtml() {
    const w = edWeeks[edWkI]; if (!w) return "";
    const ids = [...new Set(w.list.flatMap((x) => x.files))], files = ids.map((id) => FILES.find((f) => f.id === id)).filter(Boolean);
    const when = `Week of ${w.mon.getDate()} ${fmtD(w.mon, { month: "short" })}`;
    const head = (cap) => `<div class="ed-sh"><div><h2 class="ed-h">On these files</h2><p class="ed-cap" aria-live="polite">${esc(cap)}</p></div></div>`;
    if (!files.length) return head(`${when} · no file dated this week`);
    const ppl = edRoomPeople(files), noRap = files.filter((f) => !membersOf(f).base.some((x) => x.role === "rapporteur"));
    const n = files.length === 1 ? "this week's file" : `this week's ${files.length} files`;
    const cap = `${when} · rapporteurs, commissioners and cabinet leads on ${n}`;
    /* One exit per file (22 Oct 2026): five key people, then "View all N on <file>" to the file page. The in-place
       "Show all" went: two buttons for nearly the same list read as duplicates. The Council is one line per file under the links
       (working party, who chairs, next date); the working party itself, its formats and the attachés live on the
       file page's Council tab. */
    const rows = ppl.slice(0, 5).map((p) => { const o = BYKEY.get(p.key).o;
      return row({ attrs: tap(`data-open="${esc(p.key)}"`), lead: avaOf(p.key), name: esc(o.name), meta: esc(edRoomRole(p)), wrap: true, extra: edAlsoHtml(p.key, new Set(ids)), tail: starBtn(p.key, o.name) }); }).join("");
    const note = noRap.length ? `<p class="ed-room__note">No rapporteur yet on ${esc(noRap.map((f) => f.short).join(", "))}. Parliament names one once the file reaches it.</p>` : "";
    const pres = presOf(w.mon), coFiles = files.filter((f) => wpGroups(f).length);
    const council = coFiles.length ? `<div class="ed-room__co">${coFiles.map((f) => { const g = wpGroups(f), nx = wpNext(f, w.mon);
      const what = g.map((x) => wpShort(x.name) + (x.formats.length ? `, plus ${x.formats.length} ${x.formats.length > 1 ? "formats" : "format"}` : "")).join(" · ");
      const meta = [coFiles.length > 1 ? f.short : "", pres ? `${countryName(pres[0])} chairs` : "", nx ? `next ${fdDate(nx.date)}` : ""].filter(Boolean).join(" · ");
      return `<button class="ed-room__coline" type="button" data-file="${esc(f.id)}" data-filetab="co" aria-label="${esc(`Council: ${what}. ${meta}. Open the Council tab of ${f.short}`)}"><span class="ed-room__k"><i class="ed-mark ed-mark--co" aria-hidden="true"></i>Council</span><span class="ed-room__wp">${esc(what)}</span><span class="ed-room__m">${esc(meta)}</span></button>`; }).join("")}</div>` : "";
    const links = `<div class="ed-room__files">${files.map((f) => { const c = countsOf(f), n = c.ep + c.ec + c.cab;
      return `<button class="ed-room__all" type="button" data-file="${esc(f.id)}">View all ${n} on ${esc(f.short)}<span aria-hidden="true"> →</span></button>`; }).join("")}</div>`;
    return `${head(cap)}${note}${rows ? `<div class="list">${rows}</div>` : ""}${links}${council}`;
  }
  /* Working parties grouped (22 Oct 2026). When exactly one working party has no `part` and the others have one, the
     others are formats of it: the AHWP MFF meets as the main group and in programme formats (ECF, national and regional
     partnerships, Global Europe). The format is the name's closing parenthesis. With no main group (Chips Act 2.0 and
     CADA) each part keeps its own entry. */
  function wpGroups(f) {
    const w = ((f.council || {}).workingParties || []).filter((x) => x.basis !== "none");
    const main = w.filter((x) => !x.part), fmt = w.filter((x) => x.part);
    if (main.length !== 1 || !fmt.length) return w.map((x) => ({ ...x, formats: [] }));
    const lab = (n) => { const m = n.match(/\(([^()]+)\)\s*$/), t = m ? m[1] : n; return t.charAt(0).toUpperCase() + t.slice(1); };
    return [{ ...main[0], formats: fmt.map((x) => lab(x.name)) }];
  }
  /* "Ad Hoc Working Party on the Multiannual Financial Framework (AHWP MFF)" reads as "AHWP MFF" on Home. */
  const wpShort = (n) => { const m = n.match(/\(([A-Z][A-Z0-9 ]+)\)\s*$/); return m ? m[1] : n; };
  const wpNext = (f, from) => { const t = isoD(from || new Date()); return (f.next || []).filter((x) => x.date && x.date >= t && /working party|working parties/i.test(x.what)).sort((a, b) => a.date.localeCompare(b.date))[0]; };
  const fileHasCo = (f) => !!(((f.council || {}).configs || []).length || wpGroups(f).length);
  /* The file page's Council tab (22 Oct 2026), next to Parliament and Commission: the configuration, the working party
     with its formats, who chairs, the next working-party date, then the attachés line. Moved out of Next steps. */
  function fileCoTab(f) {
    const cfs = ((f.council || {}).configs || []).map((cid) => CONF_BY[cid]).filter(Boolean), g = wpGroups(f), nx = wpNext(f), pres = presOf(new Date());
    if (!cfs.length && !g.length) return `<div class="hint"><span>No Council body handles this file yet.</span></div>`;
    const parts = Object.fromEntries((f.parts || []).map((p) => [p.id, p.short || p.title]));
    const wp = g.length ? `<h3>Working party</h3><div class="list">${g.map((x) => `<div class="block"><h4>${esc(x.name)}</h4>${x.part && parts[x.part] ? `<p class="cap">For ${esc(parts[x.part])}</p>` : ""}${x.note && !x.formats.length ? `<p class="cap">${esc(x.note)}</p>` : ""}${x.formats.length ? `<p class="cap">Also meets as</p><ul class="fp-wpfmt">${x.formats.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>` : ""}${x.basis === "inferred" ? `<p class="cap">Venue inferred, not confirmed.</p>` : ""}</div>`).join("")}</div>
      <p class="cap">${pres ? `Chaired by the Presidency, ${esc(countryName(pres[0]))}, until the end of ${esc(fmtIso(pres[2] + "-01", { month: "long", year: "numeric" }))}.` : ""}${nx ? ` Next working party: ${esc(fdDate(nx.date, true))}, ${esc(nx.what.replace(/^Council [^:]*working party:?\s*/i, "") || "session")}.` : ""}</p>
      ${edAttache([f], g.length > 1)}` : "";
    return (cfs.length ? `<h3>In the Council</h3><div class="list">${cfs.map(confRow).join("")}</div>` : "") + wp
      + (f.council && f.council.note ? `<p class="note">${esc(f.council.note)}</p>` : "");
  }
  /* Said where the gap shows (20 Oct 2026): the attachés who cover a working party are not in nodo, because the Council
     does not publish them. The link opens "Who covers…" for the file's Council configuration, where people add names. */
  function edAttache(files, many) {
    const conf = files.map((f) => ((f.council || {}).configs || [])[0]).find((c) => c && CONF_BY[c]);
    return `<p class="ed-room__att">Attachés who cover ${many ? "these working parties" : "this working party"} aren't in nodo. The Council doesn't publish them.${conf ? ` <button class="ed-room__add" type="button" data-prwp="${esc(conf)}">Add the ones you know</button>` : ""}</p>`;
  }
  function edRoomPaint() { const el = $("edRoom"); if (!el) return; el.innerHTML = edRoomHtml(); el.hidden = !el.innerHTML.trim(); }

  /* ---------- 1b. Today, three questions (since 22 Oct 2026) ----------
     Replaces the week card, Your files with its tracks, the Coming up carousel, Saved people and Recently viewed.
     Each fact shows once:
     - Since you last looked: what happened on your files (update stream milestones, procedure steps and people), dated
       and labelled, plus decision points that took place with no published outcome ("Outcome not published yet");
       routine working parties stay out. A closing line names the files with nothing new.
     - Next 7 days: a rolling window from today, from tomorrow after 18:00. A strip of the seven days, the dated steps
       with a meeting on consecutive days shown once, plenary sittings with the agenda items that carry a followed
       file's procedure number; steps on the same day share one date. One link to the full calendar, which carries
       the next plenary and the data-check line (27 Oct 2026).
     - On these files: key people on the files with a step in the window, the no-rapporteur note and the Council line.
     - Your files as chips. With nothing followed, Next 7 days covers all of nodo's files and the picker follows it (27 Oct 2026).
     The last visit is kept per device (localStorage): at most 14 days back and at least 24 hours, so a quick reopen
     still shows the last day. */
  const TD_WEEK = { SXB: "Plenary in Strasbourg", BRU: "Plenary in Brussels", C: "Committee week in Parliament", G: "Group week in Parliament", X: "Constituency week in Parliament", _: "Quiet week in Parliament" };
  const TD_SEEN = "nodo.today.seen";
  const TD_DECISION = /coreper|\bcouncil\b|ministers|\bvote|trilogue|adopt|plenary|european council|\bgac\b/i;
  const TD_INST = { ep: "Parliament", council: "Council", co: "Council", ec: "Commission" };
  let tdSinceD = null;
  const tdPick = new Set();
  function tdSinceDate() {
    if (tdSinceD) return tdSinceD;
    const now = new Date(); let prev = null;
    try { prev = localStorage.getItem(TD_SEEN); } catch (e) { prev = null; }
    let d = prev ? new Date(prev) : addD(now, -7);
    if (isNaN(d)) d = addD(now, -7);
    const floor = new Date(now.getTime() - 864e5), cap = addD(now, -14);
    if (d > floor) d = floor; if (d < cap) d = cap;
    tdSinceD = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    try { localStorage.setItem(TD_SEEN, now.toISOString()); } catch (e) { /* private mode: the default window applies */ }
    return tdSinceD;
  }
  function tdWindow() {
    const now = new Date(), late = now.getHours() >= 18, s0 = late ? addD(now, 1) : now;
    const start = new Date(s0.getFullYear(), s0.getMonth(), s0.getDate());
    return { start, end: addD(start, 6), late };
  }
  /* The week most of the window's working days fall in, and whether it is this week. */
  function tdWeek(w) {
    const n = new Map();
    for (let d = w.start; d <= w.end; d = addD(d, 1)) if (d.getDay() % 6) { const k = isoD(mondayOf(d)); n.set(k, (n.get(k) || 0) + 1); }
    const k = [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
    const mon = k ? fromIso(k[0]) : mondayOf(w.start);
    return { wk: weekOf(mon), now: isoD(mon) === isoD(mondayOf(new Date())) };
  }
  const tdProcs = (f) => [f.procedure, ...(f.procedures || []), ...((f.parts || []).map((p) => p.procedure))].filter(Boolean);
  function tdGreeting() {
    const h = new Date().getHours(), fn = firstName();
    const hello = `${h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"}${fn ? ", " + esc(fn) : ""}.`;
    const t = tdWeek(tdWindow()), kind = t.wk.place || t.wk.kind, phrase = ED_WEEK[kind];
    return `${hello} <strong>${phrase ? `${t.now ? "It's" : "Next up:"} ${phrase}.` : "Here are your next 7 days."}</strong>`;
  }
  renderGreeting = function () { const g = $("greet"); if (g) g.innerHTML = tdGreeting(); };

  /* What happened on the files since a date. */
  /* opts.today (30 Oct 2026): Today leaves committee-minutes items to "Also spoke in committee" at the end of the page,
     which dates them by when nodo found them; Calendar, Earlier keeps them, dated by the meeting. */
  function tdSinceItems(files, since, opts) {
    const ids = new Set(files.map((f) => f.id)), s = isoD(since), t = isoD(new Date()), out = [], seen = new Set(), today = !!(opts && opts.today);
    UPD.feed.filter((e) => ids.has(e.fileId) && e.kind !== "scheduled" && e.date && e.date >= s && e.date <= t && !peHiddenSkip(e) && !(today && e.minutes))
      .sort((a, b) => b.date.localeCompare(a.date))
      .forEach((e) => {
        const k = e.fileId + "|" + (e.personId || "") + "|" + e.title; if (seen.has(k)) return; seen.add(k);
        out.push({ date: e.date, f: FILE_BY[e.fileId], html: evName(e).replace(/ <small>(\d+)<\/small>/, " <small>($1)</small>"), inst: e.minutes ? "Parliament" : TD_INST[e.source] || "", kind: e.kind, verified: e.source === "ep", src: e.minutes ? "committee minutes" : e.source === "ep" ? "Legislative Observatory" : "" });
      });
    files.forEach((f) => (f.next || []).forEach((x) => {
      if (!x.date || x.date < s || x.date >= t) return;
      if (!TD_DECISION.test(x.what) || /working part|indicative|expected|planned/i.test(x.what)) return;
      if (out.some((o) => o.f.id === f.id && o.date === x.date)) return;
      out.push({ date: x.date, f, html: esc(edWhat({ what: x.what, files: [f] })), inst: TD_INST[edInst(x.what)] || "", pending: true, src: "on the meeting agenda" });
    }));
    return out.sort((a, b) => b.date.localeCompare(a.date));
  }
  const tdList = (l) => l.length < 2 ? l.join("") : l.slice(0, -1).join(", ") + " and " + l[l.length - 1];
  function tdSinceHtml(files) {
    const since = tdSinceDate(), items = tdSinceItems(files, since, { today: true });
    const d = (iso) => fmtD(fromIso(iso), { weekday: "short", day: "numeric", month: "short" });
    const it = (x) => `<button class="td-row" type="button" data-file="${esc(x.f.id)}" data-filetab="next">
        <span class="td-row__top"><span class="td-row__f">${esc(edTag(x.f))}</span><span class="td-row__d">${esc(d(x.date))}</span></span>
        <span class="td-row__what">${x.html}</span>
        ${x.pending ? `<span class="td-pend">${icon("warn")}Outcome not published yet</span>` : ""}
        <span class="td-row__m">${esc([x.inst, x.src].filter(Boolean).join(" · "))}${x.verified ? ` <b class="td-ok">Verified</b>` : ""}</span></button>`;
    const quiet = files.filter((f) => !items.some((x) => x.f.id === f.id)).map(edTag);
    const quietTxt = !quiet.length ? "" : items.length ? (quiet.length > 4 ? `Nothing new on ${quiet.length} of your files.` : `Nothing new on ${tdList(quiet)}.`) : "Nothing new on your files.";
    return `<div class="td-h"><h2 class="td-t" id="tdSinceH">Since you last looked</h2><span class="td-h__s">${esc(d(isoD(since)))}</span></div>
      <p class="td-cap">What happened on your files, dated and sourced.</p>
      ${items.slice(0, 6).map(it).join("")}
      ${items.length ? `<button class="td-link" type="button" data-clopen>${items.length > 6 ? `All ${items.length} in Calendar, Earlier` : "Earlier updates in Calendar"}${icon("arrow")}</button>` : ""}
      ${quietTxt ? `<p class="td-quiet">${esc(quietTxt)}</p>` : ""}`;
  }

  /* The steps and sittings in the window. */
  function tdNextItems(files, w) {
    const from = isoD(w.start), to = isoD(w.end), out = [];
    edSteps(files, from, to).forEach((s) => {
      const ids = s.files.map((f) => f.id).join(","), prev = out.find((y) => !y.plen && y.what === s.what && y.ids === ids && isoD(addD(fromIso(y.end), 1)) === s.date);
      if (prev) prev.end = s.date; else out.push({ date: s.date, end: s.date, what: s.what, files: s.files, ids });
    });
    CAL.sessions.filter((s) => s.end >= from && s.start <= to).forEach((s) => {
      const e = agEntry(s), hits = [];
      Object.values(e.days || {}).forEach((l) => (l || []).forEach((it) => {
        const f = files.find((ff) => it.sub && tdProcs(ff).some((p) => it.sub.includes(p)));
        if (f && !hits.some((h) => h.t === it.title)) hits.push({ t: it.title, type: it.type, f });
      }));
      out.push({ date: s.start < from ? from : s.start, end: s.end, plen: s, hits, ready: e.stage !== "none" && agHasItems(e), upd: agUpdated(e) });
    });
    return out.sort((a, b) => a.date.localeCompare(b.date));
  }
  function tdNextHtml(files, mine) {
    const w = tdWindow(), items = tdNextItems(files, w), t = tdWeek(w), kind = t.wk.place || t.wk.kind;
    const tIso = isoD(new Date()), tmIso = isoD(addD(new Date(), 1));
    const nSteps = items.filter((x) => !x.plen).length, nFiles = new Set(items.filter((x) => !x.plen).flatMap((x) => x.files.map((f) => f.id))).size;
    const lead = `${TD_WEEK[kind] || "Parliament calendar not published"}. ${nSteps ? `${nSteps} ${pl(nSteps, "step", "steps")} on ${nFiles} of ${mine ? "your" : "nodo's"} files.` : `No dated step on ${mine ? "your" : "nodo's"} files.`}`;
    const days = [...Array(7)].map((_, i) => addD(w.start, i)), pIdx = days.map((d, i) => (SESS.has(isoD(d)) ? i : -1)).filter((i) => i >= 0);
    const busy = (d) => { const k = isoD(d); return items.some((x) => !x.plen && x.date <= k && x.end >= k); };
    const col = (d, i) => { const we = d.getDay() % 6 === 0, rel = i === 0 && isoD(d) === tIso;
      return `<div class="td-day${we ? " is-we" : ""}${rel ? " is-today" : ""}"><span class="td-day__w">${esc(fmtD(d, { weekday: "short" }).toUpperCase())}</span><span class="td-day__n">${d.getDate()}</span><i class="td-day__dot${busy(d) ? " on" : ""}"></i></div>`; };
    const band = pIdx.length ? `<span class="td-pband" style="grid-column:${pIdx[0] + 1} / ${pIdx[pIdx.length - 1] + 2}"></span>` : "";
    const when = (x) => { const a = fromIso(x.date), b = fromIso(x.end), same = x.date === x.end;
      const k = same ? (x.date === tIso ? "TODAY" : x.date === tmIso ? "TOMORROW" : fmtD(a, { weekday: "short" }).toUpperCase()) : `${fmtD(a, { weekday: "short" })}–${fmtD(b, { weekday: "short" })}`.toUpperCase();
      return `<span class="td-when"><span class="td-when__k${same && (x.date === tIso || x.date === tmIso) ? " is-rel" : ""}">${esc(k)}</span><span class="td-when__n">${same ? a.getDate() : `${a.getDate()}–${b.getDate()}`}</span></span>`; };
    /* Steps on the same single day share one date: the first card shows it, the ones after it keep the date for
       screen readers only and join the card above (27 Oct 2026). */
    const solo = (x) => x && !x.plen && x.date === x.end;
    items.forEach((x, i) => { x.cont = solo(x) && solo(items[i - 1]) && items[i - 1].date === x.date; });
    items.forEach((x, i) => { x.grp = !!(items[i + 1] && items[i + 1].cont); });
    const whenSr = (x) => `<span class="td-when td-when--cont"><span class="cl-sr">${esc(fmtD(fromIso(x.date), { weekday: "short", day: "numeric" }))}</span></span>`;
    const it = (x) => x.plen
      ?`<div class="td-ev td-ev--p"><button class="td-ev__b" type="button" data-view="${x.ready ? "agenda" : "cal"}">${when(x)}<span class="td-ev__tx"><span class="td-ev__what">Plenary in ${esc(PLACE[x.plen.place])}</span><span class="td-ev__m">${esc(x.ready ? `Parliament · agenda ${x.upd ? x.upd.toLowerCase() : "in nodo"}` : "Parliament · agenda not in nodo yet")}</span></span></button>
          ${x.hits.map((h) => `<button class="td-hit" type="button" data-file="${esc(h.f.id)}" data-filetab="next"><span class="td-hit__k">${esc(h.type === "votes" ? "Vote" : h.type === "debate" ? "Debate" : "On the agenda")}</span><span class="td-hit__t">${esc(h.t)}</span><span class="td-ev__m">${esc(edTag(h.f))}</span></button>`).join("")}</div>`
      : `<button class="td-ev${x.cont ? " td-ev--cont" : ""}${x.grp ? " td-ev--grp" : ""}" type="button" data-file="${esc(x.files[0].id)}" data-filetab="next">${x.cont ? whenSr(x) : when(x)}<span class="td-ev__tx"><span class="td-ev__what">${esc(edWhat(x))}</span><span class="td-ev__m">${esc([TD_INST[edInst(x.what)], x.files.map(edTag).join(" · ")].filter(Boolean).join(" · "))}</span></span></button>`;
    return `<div class="td-h"><h2 class="td-t" id="tdNextH">Next 7 days</h2><span class="td-h__s">${esc(`${fmtD(w.start, { weekday: "short", day: "numeric" })} – ${fmtD(w.end, { weekday: "short", day: "numeric", month: "short" })}`)}</span></div>
      <p class="td-cap">${esc(lead)}</p>
      <div class="td-strip" aria-hidden="true">${days.map(col).join("")}${band}</div>
      ${items.length ? `<div class="td-evs">${items.map(it).join("")}</div>` : ""}
      <button class="td-link" type="button" data-view="cal">Full calendar${icon("arrow")}</button>`;
  }

  /* Key people on the files with a step in the window. */
  function tdRoomHtml(files, w) {
    if (!files.length) return "";
    const ppl = edRoomPeople(files), ids = new Set(files.map((f) => f.id)), noRap = files.filter((f) => !membersOf(f).base.some((x) => x.role === "rapporteur"));
    const cap = files.length === 1 ? `The people named on ${edTag(files[0])}, the file with a step in the next 7 days.` : `The people named on the ${files.length} files with a step in the next 7 days.`;
    const role = (p) => edRoomRole(p).replace(p.files.map((f) => f.short).join(", "), p.files.length > 1 && p.files.length === files.length ? `on ${files.length === 2 ? "both" : "all " + files.length} files` : p.files.map(edTag).join(", "));
    const rows = ppl.slice(0, 5).map((p) => { const o = BYKEY.get(p.key).o;
      return row({ attrs: tap(`data-open="${esc(p.key)}"`), lead: avaOf(p.key), name: esc(o.name), meta: esc(role(p)), wrap: true, extra: edAlsoHtml(p.key, ids), tail: starBtn(p.key, o.name) }); }).join("");
    const note = noRap.length ? `<p class="td-note"><strong>${esc(tdList(noRap.map(edTag)))}:</strong> no rapporteur named yet.</p>` : "";
    const pres = presOf(w.start), coFiles = files.filter((f) => wpGroups(f).length);
    const council = coFiles.length ? `<div class="td-co">${coFiles.map((f) => { const g = wpGroups(f), nx = wpNext(f, w.start);
      const what = g.map((x) => wpShort(x.name) + (x.formats.length ? `, plus ${x.formats.length} ${x.formats.length > 1 ? "formats" : "format"}` : "")).join(" · ");
      const k = `COUNCIL${nx ? " · " + fmtD(fromIso(nx.date), { weekday: "short", day: "numeric", month: "short" }).toUpperCase() : ""}`;
      return `<button class="td-co__l" type="button" data-file="${esc(f.id)}" data-filetab="co" aria-label="${esc(`Council: ${what}. ${edTag(f)}. Open the Council tab`)}"><span class="td-co__k">${esc(k)}</span><span class="td-co__wp">${esc(what)}</span><span class="td-co__m">${esc([edTag(f), pres ? `${countryName(pres[0])} chairs` : ""].filter(Boolean).join(" · "))}</span></button>`; }).join("")}</div>` : "";
    const links = files.map((f) => { const c = countsOf(f), n = c.ep + c.ec + c.cab;
      return `<button class="td-link" type="button" data-file="${esc(f.id)}">Everyone on ${esc(edTag(f))} (${n})${icon("arrow")}</button>`; }).join("");
    return `<h2 class="td-t" id="tdRoomH">On these files</h2><p class="td-cap">${esc(cap)}</p>
      ${rows ? `<div class="list td-ppl">${rows}</div>` : ""}${note}${council}${links}`;
  }

  function tdMineHtml(files) {
    return `<div class="td-h"><h2 class="td-t" id="tdMineH">Your ${files.length} ${pl(files.length, "file", "files")}</h2><button class="td-link td-link--inline" type="button" data-view="files">Manage</button></div>
      <div class="td-chips">${files.map((f) => `<button class="td-chip" type="button" data-file="${esc(f.id)}">${esc(edTag(f))}</button>`).join("")}</div>`;
  }
  /* First visit: pick the files you work on. The suggestions are the 5 files with the most dated steps in the next 60 days. */
  function tdPickHtml() {
    const t = isoD(new Date()), far = isoD(addD(new Date(), 60));
    const busy = (f) => (f.next || []).filter((x) => x.date && x.date >= t && x.date <= far).length;
    const list = FILES.slice().sort((a, b) => busy(b) - busy(a) || a.short.localeCompare(b.short)).slice(0, 5), k = tdPick.size;
    return `<h2 class="td-t" id="tdPickH">Make Today yours</h2>
      <p class="td-lead">Pick the files you work on. Today then shows what changed on them, the next 7 days and the people named on them.</p>
      <div class="td-chips">${list.map((f) => { const on = tdPick.has(f.id);
        return `<button class="td-chip td-chip--pick${on ? " is-on" : ""}" type="button" data-tdpick="${esc(f.id)}" aria-pressed="${on}">${on ? icon("check") : ""}${esc(edTag(f))}</button>`; }).join("")}</div>
      <button class="td-link" type="button" data-view="files">See all ${FILES.length} files</button>
      <button class="eu-btn eu-btn--block td-follow" type="button" data-tdfollow=""${k ? "" : " disabled"}>${k ? `Follow ${k} ${pl(k, "file", "files")}` : "Pick at least one file"}</button>`;
  }

  /* People on Today (30 Oct 2026): the three institution cards from the People page, one at a time, flipped
     sideways. The last section on Today, after the file picker (or after your files). Each card opens its directory;
     "All people" opens the People page. Smaller colonnade than on the People page, same photos and credits. */
  function tdPeopleHtml() {
    const card = (p, i) => `<div class="pp-wrap pp-wrap--${p.v} td-pp__item" role="group" aria-roledescription="slide" aria-label="${i + 1} of ${PP.length}">
        <button class="pp-card pp-card--${p.v}" type="button" data-dir="${p.v}" aria-label="${esc(`${p.k} ${p.t}. ${ppMeta(p.meta)}`)}">
        ${ppPhotoArt(p)}<span class="pp-band" aria-hidden="true"></span>
        <span class="pp-row"><span class="pp-tx"><span class="pp-k">${esc(p.k)}</span><span class="pp-t">${esc(p.t)}</span><span class="pp-m">${esc(ppMeta(p.meta))}</span></span>
          <span class="pp-go" aria-hidden="true">${icon("arrow")}</span></span></button>${ppCredit(p)}</div>`;
    return `<div class="td-h"><h2 class="td-t" id="tdPeopleH">People</h2><button class="td-link td-link--inline" type="button" data-view="people">All people</button></div>
      <div class="td-pp" id="tdPP" aria-roledescription="carousel" aria-label="Parliament, Commission and Council">${PP.map(card).join("")}</div>
      <div class="td-pp__dots">${PP.map((p, i) => `<button type="button" class="td-pp__dot" data-tdpp="${i}" aria-label="Show ${esc(p.t)}" aria-current="${i === 0}"></button>`).join("")}</div>`;
  }
  /* The end of Today (30 Oct 2026). "Also spoke in committee": MEPs with no role on a followed file whom nodo found in
     committee minutes since your last look, at most two before "Show N more", each once even when they spoke on several
     of your files. "New" goes by `found` in v1/minutes.json (the day nodo first saw them on that file), not by the
     meeting, because minutes come out weeks later; the block is gone when nothing is new. Then the end-cap: "You're up
     to date" (when you follow files), "Following a file nodo doesn't? Generate a page", which opens search, and the
     wordmark. */
  let tdVoOpen = false;
  function tdMin() { try { return MIN; } catch (e) { return null; } }
  function tdVoicesItems(files) {
    const M = tdMin(); if (!M || !M.files) return [];
    const s = isoD(tdSinceDate()), by = new Map();
    files.forEach((f) => mnVoices(f).forEach((v) => {
      if (!v.found || v.found < s) return;
      const x = by.get(v.key) || { key: v.key, found: v.found, n: 0, hits: [] };
      x.hits.push({ f, v }); x.n += v.n; if (v.found > x.found) x.found = v.found;
      by.set(v.key, x);
    }));
    return [...by.values()].sort((a, b) => b.found.localeCompare(a.found) || b.n - a.n || a.key.localeCompare(b.key));
  }
  /* Committees by acronym, joint ones joined ("INTA-ITRE-IMCO"), from the meetings the speaker's minutes cover. */
  function tdVoCmte(f, v) {
    const M = tdMin(), o = M && M.files && M.files[f.id]; if (!o) return "";
    const nm = (n) => String(n || "").toLowerCase().replace(/^(committee|subcommittee) on (the )?/, "");
    const ab = new Map(Object.entries(CMTE_NAMES).map(([k, n]) => [nm(n), k]));
    const cm = (m) => { const l = (m.committees || []).map((n) => ab.get(nm(n))); return l.length && l.every(Boolean) ? l.join("-") : m.code; };
    const xs = [...new Set(o.meetings.filter((m) => (v.pvs || []).includes(m.pv)).map(cm))];
    return xs.join(", ");
  }
  function tdVoicesHtml(files) {
    const xs = tdVoicesItems(files); if (!xs.length) return "";
    const shown = tdVoOpen ? xs : xs.slice(0, 2), more = xs.length - 2;
    const rowOf = (x) => { const o = BYKEY.get(x.key).o;
      const meta = x.hits.length === 1 ? [mnSpoke(x.hits[0].v), tdVoCmte(x.hits[0].f, x.hits[0].v)].filter(Boolean).join(" · ") : `Spoke on ${x.hits.length} of your files`;
      return row({ attrs: tap(`data-open="${esc(x.key)}"`), lead: avaOf(x.key), name: esc(o.name), wrap: true, meta: esc(meta),
        extra: `<span class="eu-row__tags">${gtag(o.group)}<span class="td-vo__c">${esc(countryName(o.country))}</span></span><span class="td-vo__f">${esc(x.hits.map((h) => edTag(h.f)).join(" · "))}</span>`,
        tail: starBtn(x.key, o.name) }); };
    return `<div class="td-h"><h2 class="td-t" id="tdVoicesH">Also spoke in committee</h2><span class="td-h__s">${xs.length} new</span></div>
      <p class="td-cap">MEPs with no role on your files who took the floor when a committee discussed them.</p>
      <div class="list td-ppl">${shown.map(rowOf).join("")}</div>
      ${more > 0 ? `<button class="td-link" type="button" data-tdvomore aria-expanded="${tdVoOpen}">${tdVoOpen ? "Show fewer" : `Show ${more} more`}</button>` : ""}
      <p class="td-vo__foot">From committee minutes, which come out a few weeks after each meeting. They name who spoke, not what they said.</p>`;
  }
  function tdEndHtml(following) {
    return `<span class="td-end__rule" aria-hidden="true"></span>
      ${following ? `<p class="td-end__t">You're up to date.</p>` : ""}
      <p class="td-end__q">Following a file nodo doesn't?</p>
      <button class="td-link td-end__go" type="button" data-tdgen>Generate a page${icon("arrow")}</button>
      <div class="td-end__mark">${WORDMARK}<span>Untangle the EU</span></div>`;
  }
  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-tdvomore]")) { tdVoOpen = !tdVoOpen; const el = $("tdVoices"); el.innerHTML = tdVoicesHtml(followedFiles()); const b = el.querySelector("[data-tdvomore]"); if (b) b.focus({ preventScroll: true }); return; }
    if (!e.target.closest("[data-tdgen]")) return;
    const q = $("hq"); if (!q) return;
    Track.log("today_generate", { section: "today", item: "" });
    window.scrollTo({ top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    const ph = q.placeholder; q.placeholder = "The file's name or procedure number";
    q.addEventListener("blur", () => { if (!q.value) q.placeholder = ph; }, { once: true });
    q.focus({ preventScroll: true });
  });
  function tdPPSync() {
    const box = $("tdPP"); if (!box) return;
    const i = Math.round(box.scrollLeft / (box.firstElementChild ? box.firstElementChild.offsetWidth + 12 : 1));
    document.querySelectorAll(".td-pp__dot").forEach((d, k) => d.setAttribute("aria-current", String(k === i)));
  }
  document.addEventListener("scroll", (e) => { if (e.target && e.target.id === "tdPP") tdPPSync(); }, true);
  document.addEventListener("click", (e) => {
    const d = e.target.closest("[data-tdpp]"); if (!d) return;
    const box = $("tdPP"), it = box && box.children[+d.dataset.tdpp];
    if (it) box.scrollTo({ left: it.offsetLeft - box.firstElementChild.offsetLeft, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  });
  function edRender() {
    if (!$("edMast")) return;
    const now = new Date();
    $("edDate").textContent = `${now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}`;
    renderGreeting();
    const mine = followedFiles(), files = mine.length ? mine : FILES, w = tdWindow();
    const set = (id, html) => { const el = $(id); el.innerHTML = html; el.hidden = !html.trim(); };
    set("tdPick", mine.length || !FILES.length ? "" : tdPickHtml());
    set("tdSince", mine.length && UPD.status === "done" ? tdSinceHtml(mine) : "");
    set("tdNext", FILES.length ? tdNextHtml(files, !!mine.length) : "");
    const winFiles = [...new Set(tdNextItems(files, w).filter((x) => !x.plen).flatMap((x) => x.files.map((f) => f.id)))].map((id) => FILE_BY[id]).filter(Boolean);
    set("tdRoom", mine.length ? tdRoomHtml(winFiles, w) : "");
    set("tdMine", mine.length ? tdMineHtml(mine) : "");
    /* Rebuilt only when the counts change (data loads after start-up), so a re-render keeps the card you flipped to. */
    const ppKey = PP.map((p) => ppMeta(p.meta)).join("|");
    if ($("tdPeople").dataset.k !== ppKey) { $("tdPeople").dataset.k = ppKey; set("tdPeople", tdPeopleHtml()); }
    set("tdVoices", mine.length ? tdVoicesHtml(mine) : "");
    set("tdEnd", tdEndHtml(mine.length));
    if ($("srcNote")) { $("srcNote").textContent = ""; $("srcNote").hidden = true; }
  }
  /* The data-check line, shown at the foot of Calendar instead of Home (27 Oct 2026). */
  function dataCheckedTxt() {
    const dates = [String((typeof mepRaw !== "undefined" && mepRaw.generated) || "").slice(0, 10), String((typeof ecRaw !== "undefined" && ecRaw.fetched) || "").slice(0, 10)].filter(Boolean).sort();
    if (!dates.length) return "";
    return `Parliament and Commission data checked ${dates[0] === isoD(new Date()) ? "today" : fmtD(fromIso(dates[0]), { weekday: "short", day: "numeric", month: "short" })}.`;
  }
  document.addEventListener("click", (e) => {
    const p = e.target.closest("[data-tdpick]");
    if (p) { e.stopPropagation(); e.preventDefault(); const id = p.dataset.tdpick; tdPick.has(id) ? tdPick.delete(id) : tdPick.add(id); $("tdPick").innerHTML = tdPickHtml(); const b = $("tdPick").querySelector(`[data-tdpick="${CSS.escape(id)}"]`); if (b) b.focus({ preventScroll: true }); return; }
    const g = e.target.closest("[data-tdfollow]");
    if (g) { e.stopPropagation(); e.preventDefault(); if (!tdPick.size) return;
      tdPick.forEach((id) => { if (!state.follow.has(id)) { state.follow.add(id); Track.log("follow", { section: "today", item: id }); } });
      const n = tdPick.size; tdPick.clear(); saveFollow(); renderFiles(); renderNews(); renderSpot();
      toast(`Following ${n} ${pl(n, "file", "files")}`); }
  }, true);

  /* Rebuild Home around the masthead. Existing parts move; none is removed, so every handler on them still works. */
  (function edMount() {
    const v = $("vHome"); if (!v || $("edMast")) return;
    const mast = document.createElement("section");
    mast.id = "edMast"; mast.className = "ed-mast"; mast.setAttribute("aria-label", "Today");
    v.prepend(mast);
    mast.append(v.querySelector(".topbar"));
    mast.insertAdjacentHTML("beforeend", `<p class="ed-eyebrow" id="edDate"></p>`);
    mast.append($("homeTop"), v.querySelector(":scope > .eu-search"), $("topics"));
    mast.after($("homeResults"));
    $("homeResults").insertAdjacentHTML("afterend", `<div id="edBody" class="td-body">
      <section id="tdSince" class="td-card" aria-labelledby="tdSinceH"></section>
      <section id="tdNext" class="td-card" aria-labelledby="tdNextH"></section>
      <section id="tdPick" class="td-card" aria-labelledby="tdPickH"></section>
      <section id="tdRoom" class="td-card ed-room" aria-labelledby="tdRoomH"></section>
      <section id="tdMine" class="td-sec" aria-labelledby="tdMineH"></section>
      <section id="tdPeople" class="td-sec td-people" aria-labelledby="tdPeopleH"></section>
      <section id="tdVoices" class="td-card td-vo" aria-labelledby="tdVoicesH"></section>
      <footer id="tdEnd" class="td-end"></footer></div>`);
    $("hq").placeholder = "A name, a file, a committee, a date";
    /* Gone from Today: cabinet of the day, country desk, seats by group, the institution tiles, Saved people and
       Recently viewed (Saved people opens from the profile; the data stays in their views). */
    const gone = (el) => el && el.classList.add("ed-gone");
    gone($("spotDate") && $("spotDate").closest("h3")); gone($("spot"));
    gone($("deskCountry").previousElementSibling); gone($("deskCountry")); gone($("deskOut"));
    gone($("bars").previousElementSibling); gone($("bars"));
    gone($("seeSaved").closest("h3")); gone($("savedStrip")); gone($("recentWrap"));
    gone($("homeTiles"));
  })();

  const edHomeBase = renderHome;
  renderHome = function () {
    edHomeBase();
    const searching = !$("homeResults").hidden;
    $("edBody").hidden = searching;
    if (!searching) edRender();
  };
  /* Follows, the "which files" sheet and the update stream (loaded after start-up) all call renderFiles. */
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
    /* The Council's Europa building (Philippe Samyn), from Wikimedia Commons under CC BY-SA 4.0, stored in monuments/.
       The licence asks for credit, a licence link and a note that the photo was changed (cut into columns). */
    { v: "co", k: "Council of the", t: "European Union", meta: "metaCo", img: MON_BASE + "council-europa.jpg", place: "Europa building by Philippe Samyn, Brussels", r: 1, z: 1, f: 0.12,
      creditHtml: `Photo: <a href="https://commons.wikimedia.org/wiki/File:Europa_Building_in_Brussels.jpg" target="_blank" rel="noopener">Wikimedia Commons</a>, <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener">CC BY-SA 4.0</a>, cropped` },
  ];
  const ppMeta = (id) => { const el = $(id); if (!el) return ""; const kids = [...el.children].map((c) => c.textContent.trim()).filter(Boolean); return kids.length ? kids.join(" · ") : el.textContent.trim(); };
  /* One institution card, shared by the People page and Today's People carousel (30 Oct 2026). */
  const ppPhotoArt = (p) => `<span class="mon pp-mon" aria-hidden="true" style="--r:${p.r};--f:${p.f || 0};--z:${p.z};--x:${((p.z - 1) / 2).toFixed(3)}">${MON_COLS.map((off, i) =>
        `<span class="mon__col" style="--off:${off}px;--i:${i}"><img src="${p.img}" alt="" decoding="async" loading="lazy"></span>`).join("")}</span>`;
  const ppCredit = (p) => `<p class="pp-credit">${esc(p.place)}${p.creditHtml ? " · " + p.creditHtml : p.credit ? ` · Photo: ${esc(p.credit)} / Unsplash` : ""}</p>`;
  function renderPeople() {
    const PROTOCOL = ["BE", "BG", "CZ", "DK", "DE", "EE", "IE", "EL", "ES", "FR", "HR", "IT", "CY", "LV", "LT", "LU", "HU", "MT", "NL", "AT", "PL", "PT", "RO", "SI", "SK", "FI", "SE"];
    const flagsArt = () => `<span class="pp-flags" aria-hidden="true">${PROTOCOL.map((cc, i) => { const f = FLAGS[cc] || {}, d = (i - 13) / 13;
      return `<i style="height:${Math.round(110 + 80 * (1 - d * d))}px;background:${f.bg || "var(--surface)"}"></i>`; }).join("")}</span>`;
    const card = (p) => `<div class="pp-wrap pp-wrap--${p.v}"><button class="pp-card pp-card--${p.v}" type="button" data-dir="${p.v}" aria-label="${esc(`${p.k} ${p.t}. ${ppMeta(p.meta)}`)}">
        ${p.flags ? flagsArt() : ppPhotoArt(p)}
        <span class="pp-band" aria-hidden="true"></span>
        <span class="pp-row"><span class="pp-tx"><span class="pp-k">${esc(p.k)}</span><span class="pp-t">${esc(p.t)}</span><span class="pp-m">${esc(ppMeta(p.meta))}</span></span>
          <span class="pp-go" aria-hidden="true">${icon("arrow")}</span></span>
        </button>${ppCredit(p)}</div>`;
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

  /* ---------- 4. navigation: the burger menu ---------- */
  /* The floating tab bar is gone. A top bar holds the wordmark (back to Today), your profile and a Menu button.
     Menu opens a drawer from the right: Today, People (Parliament, Commission, Council), Calendar, Files, then News, Saved
     and your profile. The tab bar buttons stay hidden in the page, so syncDock and the tour keep working. */
  const NX_SVG = {
    menu: '<svg class="eu-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h10"/></svg>',
    close: '<svg class="eu-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    chev: '<svg class="eu-icon nx-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
  };
  const NX_ICON = (id) => { const b = $(id), s = b && b.querySelector("svg"); return s ? s.outerHTML : ""; };
  const NX_PEOPLE = ["people", "ep", "ec", "co"];
  (function nxMount() {
    if ($("nxBar")) return;
    const mark = document.querySelector(".topbar .wordmark");
    const wm = mark ? mark.cloneNode(true).outerHTML : "nodo";
    document.body.insertAdjacentHTML("afterbegin", `<header id="nxBar" class="nx-bar"><div class="nx-bar__in">
        <button class="nx-home" type="button" data-view="home" aria-label="nodo, go to Today">${wm}</button>
        <span class="nx-bar__r" id="nxBarR"><button id="nxOpen" class="nx-menubtn" type="button" aria-haspopup="dialog" aria-controls="nxMenu" aria-expanded="false">${NX_SVG.menu}Menu</button></span>
      </div></header>`);
    /* Your profile button moves from the Home masthead into the bar, so it is there on every view. */
    $("nxBarR").prepend($("meBtn"));
    document.body.insertAdjacentHTML("beforeend", `<div id="nxScrim" class="nx-scrim" hidden></div>
      <section id="nxMenu" class="nx-menu" role="dialog" aria-modal="true" aria-label="Menu" hidden>
        <div class="nx-menu__top"><span class="nx-menu__wm">${wm}</span>
          <button class="eu-iconbtn nx-close" type="button" data-nx-close aria-label="Close menu">${NX_SVG.close}</button></div>
        <nav aria-label="Main"><ul class="nx-list">
          <li><button class="nx-item" type="button" data-view="home" data-nx="home">${NX_ICON("navHome")}<span class="nx-item__l">Today</span><span class="nx-badge" id="nxNew" hidden></span></button></li>
          <li><button class="nx-item" type="button" data-view="files" data-nx="files">${NX_ICON("navFiles")}<span class="nx-item__l">Your files</span><span class="nx-hint" id="nxFol"></span></button></li>
          <li><div class="nx-split"><button class="nx-item" type="button" data-view="people" data-nx="people">${NX_ICON("navDir")}People</button>
              <button class="nx-tog" type="button" id="nxTog" aria-expanded="false" aria-controls="nxSub" aria-label="Parliament, Commission and Council">${NX_SVG.chev}</button></div>
            <ul class="nx-sub" id="nxSub" hidden>
              <li><button class="nx-subitem" type="button" data-dir="ep" data-nx="ep">Parliament<span class="nx-subcap" id="nxCapEp"></span></button></li>
              <li><button class="nx-subitem" type="button" data-dir="ec" data-nx="ec">Commission<span class="nx-subcap">27 Commissioners</span></button></li>
              <li><button class="nx-subitem" type="button" data-dir="co" data-nx="co">Council<span class="nx-subcap">27 delegations</span></button></li>
            </ul></li>
          <li><button class="nx-item" type="button" data-view="cal" data-nx="cal">${NX_ICON("navCal")}Calendar</button></li>
        </ul></nav>
        <div class="nx-foot" id="nxFoot">
          <button class="nx-me" type="button" data-nx-me><span class="nx-me__face" id="nxFace" aria-hidden="true"></span>
            <span class="nx-me__tx"><span class="nx-me__n" id="nxName">Your profile</span><span class="nx-me__s">Profile and settings</span></span>${NX_SVG.chev}</button>
          <div class="nx-links" id="nxLinks"><button class="nx-flink" type="button" data-view="about" data-nx="about">About nodo</button></div>
        </div>
      </section>`);
    document.body.classList.add("nx-burger");

    const menu = $("nxMenu"), scrim = $("nxScrim"), open = $("nxOpen");
    const cur = () => (state.view === "agenda" ? "cal" : state.view);
    function nxSync() {
      const v = cur();
      menu.querySelectorAll("[data-nx]").forEach((b) => { if (b.dataset.nx === v) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
      const pp = NX_PEOPLE.includes(v);
      menu.querySelector('[data-nx="people"]').classList.toggle("nx-in", pp && v !== "people");
      document.body.classList.toggle("nx-on-home", v === "home");
    }
    function nxOpen() {
      nxSync();
      /* Hints, one per row at most (23 Oct 2026): what is new on your files since your last look, how many files you follow,
         and People opens on its sections only when you are in one of them. */
      const fol = followedFiles(), nNew = fol.length && UPD.status === "done" ? tdSinceItems(fol, tdSinceDate(), { today: true }).length + tdVoicesItems(fol).length : 0;
      $("nxNew").hidden = !nNew; $("nxNew").textContent = nNew ? `${nNew} new` : "";
      $("nxFol").textContent = fol.length ? `${fol.length} followed` : "";
      $("nxCapEp").textContent = `${MEPS.length} MEPs`;
      const inPp = ["ep", "ec", "co"].includes(cur());
      $("nxTog").setAttribute("aria-expanded", String(inPp)); $("nxSub").hidden = !inPp;
      $("nxFace").innerHTML = $("meBtn").innerHTML;
      const fn = firstName(); $("nxName").textContent = fn || "Your profile";
      scrim.hidden = false; menu.hidden = false;
      requestAnimationFrame(() => { menu.classList.add("is-open"); scrim.classList.add("is-open"); });
      open.setAttribute("aria-expanded", "true");
      nxLayers();
      (menu.querySelector(".nx-item[aria-current], .nx-subitem[aria-current]") || menu.querySelector(".nx-close")).focus();
    }
    function nxClose(restore) {
      if (menu.hidden) return;
      menu.classList.remove("is-open"); scrim.classList.remove("is-open");
      menu.hidden = true; scrim.hidden = true;
      open.setAttribute("aria-expanded", "false");
      nxLayers();
      if (restore) open.focus();
    }
    /* While the menu is open, everything behind it is inert. */
    function nxLayers() {
      const m = !menu.hidden;
      document.querySelectorAll("main.view").forEach((v) => { if (m) v.inert = true; });
      $("nxBar").inert = m || !$("onb").hidden || !$("sheet").hidden || !!state.touring;
      if (!m) nxSyncLayers();
    }
    const nxSyncLayers = syncLayers;
    syncLayers = function () { nxSyncLayers(); if (!menu.hidden) document.querySelectorAll("main.view").forEach((v) => { v.inert = true; }); $("nxBar").inert = !menu.hidden || !$("onb").hidden || !$("sheet").hidden || !!state.touring; };

    open.addEventListener("click", nxOpen);
    scrim.addEventListener("click", () => nxClose(true));
    $("nxTog").addEventListener("click", (e) => {
      const b = e.currentTarget, on = b.getAttribute("aria-expanded") !== "true";
      b.setAttribute("aria-expanded", String(on)); $("nxSub").hidden = !on;
    });
    /* A destination closes the menu first; the app's own click handler then changes the view. */
    menu.addEventListener("click", (e) => {
      const t = e.target;
      if (t.closest("[data-nx-close]")) return nxClose(true);
      if (t.closest("[data-nx-me]")) { nxClose(false); return openMe(); }
      if (t.closest("[data-view], [data-dir]")) nxClose(false);
    });
    menu.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { e.preventDefault(); return nxClose(true); }
      if (e.key !== "Tab") return;
      const f = [...menu.querySelectorAll("button:not([hidden])")].filter((b) => b.offsetParent);
      const a = f[0], z = f[f.length - 1];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    });
    const nxDock = syncDock;
    syncDock = function () { nxDock(); nxSync(); };
    nxSync();
  })();


  /* ---------- 5. Council names sync to your account (since 20 Oct 2026) ----------
     The names you add for delegations and working parties (attachés, counsellors) used to stay on the phone.
     They now sync to your account in their own Supabase table, user_council_names, so they follow you to another phone.
     They are kept out of user_state because the live app rewrites that row whole and would drop them.
     The first time a phone meets the account, its names and the account's are merged; after that the newer copy wins. */
  const NXN_UPD = "nodo.permreps.updated", NXN_SYNCED = "nodo.permreps.synced";
  const nxNames = {
    uid: null, timer: null, quiet: false,
    body: () => ({ names: prx.names, corr: prx.corr }),
    write() { this.quiet = true; store.set(PRX_KEY, JSON.stringify(prx)); this.quiet = false; },
    async connect(uid) {
      const sb = SB.client; if (!sb || !uid) return;
      const { data, error } = await sb.from("user_council_names").select("body,updated").eq("user_id", uid).maybeSingle();
      if (error) return;
      this.uid = uid;
      const first = store.get(NXN_SYNCED) !== uid, localUpd = Number(store.get(NXN_UPD) || 0), r = (data && data.body) || {}, rUpd = data ? Number(data.updated) || 0 : 0;
      store.set(NXN_SYNCED, uid);
      if (data && first) {
        const newer = (a, b) => !a || (b && (b.date || "") > (a.date || ""));
        Object.entries(r.names || {}).forEach(([k, v]) => { if (newer(prx.names[k], v)) prx.names[k] = v; });
        Object.entries(r.corr || {}).forEach(([k, v]) => { if (newer(prx.corr[k], v)) prx.corr[k] = v; });
        this.write(); this.push(true);
      } else if (data && rUpd >= localUpd) {
        Object.keys(prx.names).forEach((k) => delete prx.names[k]); Object.assign(prx.names, r.names || {});
        Object.keys(prx.corr).forEach((k) => delete prx.corr[k]); Object.assign(prx.corr, r.corr || {});
        store.set(NXN_UPD, String(rUpd)); this.write();
      } else if (Object.keys(prx.names).length || Object.keys(prx.corr).length || data) this.push(true);
      if (state.open && state.open.startsWith("deleg:")) openDelegation(state.open.slice(6));
    },
    push(now) {
      if (!this.uid) return;
      clearTimeout(this.timer);
      const go = () => { const upd = Number(store.get(NXN_UPD) || Date.now());
        SB.client.from("user_council_names").upsert({ user_id: this.uid, body: this.body(), updated: upd })
          .then(({ error }) => { if (error) toast("Could not save to your account. Your names are kept on this phone."); }); };
      if (now) go(); else this.timer = setTimeout(go, 500);
    },
  };
  /* Every save of the names goes through store.set(PRX_KEY): stamp it and send it. */
  const nxStoreSet = store.set;
  store.set = function (k, v) {
    const ok = nxStoreSet.call(this, k, v);
    if (k === PRX_KEY && ok && !nxNames.quiet) { nxStoreSet.call(this, NXN_UPD, String(Date.now())); nxNames.push(); }
    return ok;
  };
  const nxConnectSb = Store.connectSb;
  Store.connectSb = async function (user) {
    const out = await nxConnectSb.call(this, user);
    nxNames.connect(user && user.id).catch(() => {});
    return out;
  };
  const nxLeave = leaveAccount;
  leaveAccount = function () { nxNames.uid = null; clearTimeout(nxNames.timer); return nxLeave.apply(this, arguments); };
  const nxToast = toast;
  toast = function (msg, ...rest) { return nxToast(msg === "Saved on this device" ? "Saved to your account" : msg, ...rest); };


  /* ---------- 6. About nodo and feedback (since 20 Oct 2026) ----------
     An About view, opened from the menu: what nodo covers, where the data comes from, how fresh it is and what it is not.
     One inbox for everything, feedback@nodo.eu. Send feedback on the About page and the search request card open an email
     with the screen the person came from, so a report can be acted on. No form and nothing stored: it is the person's own mail app. */
  const NX_MAIL = "feedback@nodo.eu";
  const NX_SCREEN = { home: "Today", people: "People", ep: "Parliament", ec: "Commission", co: "Council", cal: "Calendar", agenda: "Plenary agenda",
    saved: "Saved people", files: "Files", news: "News on the files", about: "About" };
  let nxFrom = "home";
  function nxMail(subject, lines) {
    const v = state.view === "about" ? nxFrom : state.view;
    const ua = navigator.userAgent, dev = /iPhone|iPad/.test(ua) ? "iPhone or iPad" : /Android/.test(ua) ? "Android" : "Computer";
    const ctx = ["Screen: " + (NX_SCREEN[v] || v) + (state.open ? " · " + state.open : ""), "App: nodo preview · " + dev,
      "Standalone: " + (matchMedia("(display-mode: standalone)").matches || navigator.standalone ? "yes" : "no")];
    const body = [...(lines || []), "", "", "—", ...ctx].join("\n");
    Track.log("feedback_mail", { section: v, item: subject.slice(0, 120) });
    location.href = "mailto:" + NX_MAIL + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
  }

  /* The view itself. */
  VIEW_IDS.about = "vAbout";
  $("vNews").insertAdjacentHTML("afterend", `<main id="vAbout" class="view" hidden aria-label="About nodo"></main>`);
  const nxSetView = setView;
  setView = function (v) { if (v === "about" && state.view !== "about") nxFrom = state.view; return nxSetView(v); };
  const nxRenderView = renderView;
  renderView = function () { nxRenderView(); if (state.view === "about") renderAbout(); };

  function renderAbout() {
    const wm = (document.querySelector(".topbar .wordmark") || {}).outerHTML || "nodo";
    const n = FILES.length;
    const tile = (cls, ic, t, s) => `<div class="ab-tile ab-tile--${cls}"><span class="ab-disc" aria-hidden="true">${icon(ic)}</span><b>${t}</b><span>${s}</span></div>`;
    const src = (cls, t, s) => `<li><i class="ab-dot ab-dot--${cls}" aria-hidden="true"></i><span><b>${t}</b><span>${s}</span></span></li>`;
    const fr = (t, s) => `<li><span>${t}</span><b>${s}</b></li>`;
    $("vAbout").innerHTML = `
      <section class="ab-hero" aria-labelledby="abTitle">
        <div class="ab-hero__wm">${wm}</div>
        <h1 class="eu-headline" id="abTitle" tabindex="-1">Untangle <strong>the EU.</strong></h1>
        <p>A pocket directory of the people behind EU policy: MEPs, Commissioners and their cabinets, Council delegations, the calendar, and the files that tie them together.</p>
        <p class="ab-hero__meta"><i aria-hidden="true"></i>Beta · An independent project</p>
      </section>

      <h2 class="ab-h">What’s inside</h2>
      <div class="ab-grid">
        ${tile("ep", "bank", "Parliament", "Every MEP, committee seat and role, with their activity")}
        ${tile("ec", "group", "Commission", "The College and every cabinet member, by portfolio")}
        ${tile("co", "flag", "Council", "Presidency, meetings and the 27 permanent representations")}
        ${tile("cal", "cal", "Calendar", "Plenary weeks, agendas and Council meetings")}
        <div class="ab-tile ab-tile--files"><span class="ab-disc" aria-hidden="true">${icon("files")}</span><span class="ab-tile__tx"><b>Files</b><span>${n ? n + " priority file" + (n === 1 ? "" : "s") : "Priority files"}, linked to the people working on them</span></span></div>
      </div>

      <h2 class="ab-h">Where the data comes from</h2>
      <ul class="ab-card ab-src">
        ${src("ep", "European Parliament", "Open Data Portal and the Legislative Observatory procedure files")}
        ${src("ec", "European Commission", "Commissioners’ and cabinet team pages")}
        ${src("co", "Council of the EU", "Meeting calendar, Council documents and the Presidency programme")}
        ${src("pr", "Published reporting", "Used only where no official source exists yet, and labelled as such")}
      </ul>
      <div class="ab-card ab-labels">
        <p><b>How to read the labels</b></p>
        <p><span class="ab-chip ab-chip--ok">${icon("check")}Verified</span><span>Read from an official source and matched to the person’s record</span></p>
        <p><span class="ab-chip">${icon("news")}Press</span><span>Named in published reporting. Check the official file before you rely on it</span></p>
      </div>

      <h2 class="ab-h">How fresh it is</h2>
      <ul class="ab-card ab-fresh">
        ${fr("MEPs and Commission cabinets", "Every weekday")}
        ${fr("Plenary agendas", "As published")}
        ${fr("Council meetings and delegations", "Twice a week")}
        ${fr("File status and next steps", "Every week")}
      </ul>
      <p class="cap ab-note">Each file shows the date its status was last checked.</p>

      <section class="ab-card ab-know" aria-labelledby="abKnow">
        <h2 class="ab-h" id="abKnow">Good to know</h2>
        <p>nodo is independent. It is not affiliated with, or endorsed by, the European Parliament, the Commission, the Council or any other EU body.</p>
        <p>It is a working tool, not legal or professional advice. Some gaps are structural: the Council does not publish its working-party attachés, for example. Where a list is incomplete, the screen says so.</p>
      </section>

      <section class="ab-contact" aria-labelledby="abContact">
        <h2 class="eu-headline" id="abContact">Spotted an error? Missing a file? <strong>Say so.</strong></h2>
        <p>Feedback, corrections and requests all go to one inbox. Every message is read.</p>
        <button class="eu-btn eu-btn--brand eu-btn--block" type="button" data-abmail>${icon("mail")}Send feedback</button>
        <p class="cap">The email opens with the screen you came from, so a fix can start right away.</p>
      </section>

      <p class="cap ab-foot">nodo · Untangle the EU<br>Portraits and texts belong to the institutions that publish them.</p>`;
  }

  document.addEventListener("click", (e) => {
    const t = e.target;
    if (t.closest("[data-abmail]")) return nxMail("nodo feedback");
    const rq = t.closest("[data-nxreqmail]");
    if (rq) return nxMail("File request: " + rq.dataset.nxreqmail, ["I'd like nodo to follow: " + rq.dataset.nxreqmail, "Why it matters to me:"]);
  });

  /* The search request card keeps its one-tap request and adds a way to write, for anything a request can't say. */
  const nxReqBase = nxRequestCard;
  nxRequestCard = function (q, lead) {
    return nxReqBase(q, lead).replace(/<\/div>\s*$/, `<p class="cap nx-reqmail">Want to say more? <button class="linkbtn" type="button" data-nxreqmail="${esc(nxClip(q, 80))}">Write to ${NX_MAIL}</button></p></div>`);
  };


  /* ---------- 7. Files: the files come first (since 20 Oct 2026) ---------- */
  /* The Files view opens on the files themselves (since 20 Oct 2026). Since 28 Oct 2026 it is a directory: Your files,
     then the files by policy area, each row opening the file page (see renderFilesView below). Dates live in Calendar. */
  const FL_STATION = ["Pre-proposal", "Positions in preparation", "Council negotiating box", "Trilogue", "In force"];
  const FL_SVG = {
    news: '<svg class="eu-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 9h8M8 13h8M8 17h5"/></svg>',
    map: '<svg class="eu-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.3 10.8l7.4-3.6M8.3 13.2l7.4 3.6"/></svg>',
    plus: '<svg class="eu-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  };
  /* The card line: an optional short "lede" in files.json, else the status without its opening "Proposed on …" sentence. */
  function flStatus(f) {
    if (f.lede) return f.lede;
    const xs = String(f.status || "").split(/(?<=[.;])\s+(?=[A-Z])/);
    if (xs.length > 1 && /^(Proposed|The Commission proposed)\b/.test(xs[0])) xs.shift();
    return nxClip(xs.join(" "), 120);
  }
  /* Files as a directory (since 28 Oct 2026). One short intro, one search, then Your files and the files grouped by
     policy area (`area` in files.json, the order of legend.areas). Each row opens the file page: its name, the stage on a
     five-step meter, the rapporteurs and the lead Commissioner as faces and family names, and the star. No status line:
     it lives on the file page. The search filters the rows in place and, below them, searches Parliament's reports and
     opinions (the "Any other file" search, #nxdq, wired in the main app). */
  const FL_AREAS = () => ((DATA.fl && DATA.fl.legend && DATA.fl.legend.areas) || []);
  function frPeople(f) {
    const seen = new Set(), rs = (f.meps || []).filter((m) => m.role === "rapporteur").map((m) => BYKEY.get("ep:" + m.id))
      .filter((x) => x && !seen.has(x.o.key) && seen.add(x.o.key)).map((x) => x.o).slice(0, 3);
    const ec = ((f.commission || {}).lead || []).map((sl) => COLL.find((c) => c.slug === sl)).filter(Boolean).slice(0, 1);
    const fam = (o) => o.family || String(o.name || "").split(" ").slice(-1)[0];
    const lead = ((f.ep || {}).lead || []).join("-");
    const ep = rs.length ? rs.map(fam).join(", ") : `${lead ? lead + ", " : ""}no rapporteur yet`;
    return { keys: [...rs.map((o) => o.key), ...ec.map((c) => c.key)], txt: [ep, ...ec.map((c) => c.short)].join(" · "),
      hay: edFold([f.short, f.title, ...rs.map((o) => o.name), ...ec.map((c) => c.name), ...(((f.ep || {}).lead) || [])].join(" ")) };
  }
  function frRow(f) {
    const i = ED_STAGE.indexOf(f.stage), p = frPeople(f);
    const meter = ED_STAGE.map((_, k) => `<i${k <= i ? ' class="on"' : ""}></i>`).join("");
    return `<article class="fr" data-frhay="${esc(p.hay)}">
      <button class="fr__open" type="button" data-file="${esc(f.id)}">
        <span class="fr__n">${esc(f.short)}</span>
        <span class="fr__st"><span class="fr__m" aria-hidden="true">${meter}</span><span>${esc(i >= 0 ? FL_STATION[i] : "Stage not set")}</span></span>
        <span class="fr__who"><span class="fr__av" aria-hidden="true">${p.keys.map((k) => avaOf(k, "fr-ava")).join("")}</span><span class="fr__nm">${esc(p.txt)}</span>${icon("arrow")}</span>
      </button>
      ${followBtn(f.id, f.short)}</article>`;
  }
  function frSec(id, title, files, cap) {
    if (!files.length) return "";
    return `<section class="fr-sec" aria-labelledby="frH-${esc(id)}"><div class="fr-sec__h"><h2 id="frH-${esc(id)}">${esc(title)}</h2><span>${files.length}</span></div>
      ${cap ? `<p class="cap fr-sec__cap">${esc(cap)}</p>` : ""}<div class="fr-list">${files.map(frRow).join("")}</div></section>`;
  }
  const flFilesViewBase = renderFilesView;
  renderFilesView = function () {
    flFilesViewBase();
    if (!FILES.length) return;
    const fol = followedFiles(), areas = FL_AREAS(), known = new Set(areas.map((a) => a.id));
    $("filesCount").hidden = true;
    /* 30 Oct 2026: no search field and no follow hint above the list. The intro line, then the files. Search stays in
       the app's global search. */
    $("filesBody").innerHTML = `<p class="fl-intro">${FILES.length} EU laws in the making. Open one to see where it stands and who shapes it.</p>
      <div id="flPanel" class="fl-panel">
        ${frSec("mine", "Your files", fol)}
        ${areas.map((a) => frSec(a.id, a.name, FILES.filter((f) => f.area === a.id))).join("")}
        ${frSec("other", "Other files", FILES.filter((f) => !known.has(f.area)))}
      </div>
      <p class="foot">Dates for these files are in Calendar. Names come from the Parliament's open data and its Legislative Observatory procedure files.</p>`;
  };

  /* ---------- 8. Parliament: the list first (since 20 Oct 2026) ---------- */
  /* The first MEP sits above the fold. One title row (back to People, "Parliament ▾" to switch institution, the count);
     the group chips become a seat bar, each group as wide as its seats, that filters on tap; the active filters show as
     removable chips; search and Filter move to a bar at the bottom; country, committee and group live in a filter sheet;
     A–Z is a strip down the right edge. A committee filter counts members only by default (chairs and vice-chairs
     included), with a switch to add substitutes. Rows name the nodo files the MEP is on. */
  const EP_LIGHT_TX = new Set(["S&D", "PfE", "ECR", "The Left"]);
  const EP_CR = () => (state.ep.cr === "all" ? "all" : "member");
  const epInCmte = (m, k, cr) => (m.committees || []).some((c) => (c.abbr || c.name) === k && (cr === "all" || c.role !== "Substitute"));
  const epCmteRole = (m, k) => { const c = (m.committees || []).find((x) => (x.abbr || x.name) === k); return c ? `${k} ${String(c.role || "member").toLowerCase()}` : ""; };
  let EP_FILES = null;
  function epFilesOf(key) {
    if (!EP_FILES) { EP_FILES = new Map(); FILES.forEach((f) => baseOf(f).forEach((x) => {
      if (!x.role || x.role === "relevant") return;
      if (!EP_FILES.has(x.key)) EP_FILES.set(x.key, []);
      const l = EP_FILES.get(x.key); if (!l.some((y) => y.f === f)) l.push({ f, role: x.role, cmte: x.cmte });
    })); }
    return EP_FILES.get(key) || [];
  }
  function epFilesHtml(key) {
    const xs = epFilesOf(key); if (!xs.length) return "";
    const first = xs[0], more = xs.length - 1;
    const cm = first.role.startsWith("opinion") ? String(first.cmte || "").split(/\s*·\s*/)[0] : "";
    return `<span class="ep-files"><i aria-hidden="true"></i>${esc(first.f.short)} · ${esc([cm, (ROLE_ONE[first.role] || "").toLowerCase()].filter(Boolean).join(" "))}${more ? ` · +${more} more` : ""}</span>`;
  }
  const epRow0 = rowMep;
  function epRow(m) {
    /* The group moves into the meta line as a dot and its short name; the tag pill under it goes. */
    let h = epRow0(m).replace(/<span class="eu-row__tags">[\s\S]*?<\/span><\/span>/, (x) => (x.match(/<\/span>/g) || []).length === 2 ? "" : x);
    const k = state.ep.committee, role = k ? epCmteRole(m, k) : "";
    h = h.replace(/(<span class="eu-row__meta[^>]*>)([^<]*)/, (_, a, b) => `${a}<i class="ep-gdot" style="background:${gc(m.group)}" aria-hidden="true"></i>${esc(m.group || "")}${b ? " · " + b : ""}${role ? " · " + esc(role) : ""}`);
    const add = epFilesHtml(m.key), i = h.lastIndexOf('<button class="eu-iconbtn');
    return add && i > 7 && h.slice(i - 7, i) === "</span>" ? h.slice(0, i - 7) + add + h.slice(i - 7) : h;
  }

  (function epMount() {
    const v = $("vEp"); if (!v || v.querySelector(".ep-head")) return;
    v.classList.add("ep-v2");
    v.insertAdjacentHTML("afterbegin", `<div class="ep-head">
        <span class="ep-head__l"><button class="eu-iconbtn ep-back" type="button" data-view="people" aria-label="Back to People">${icon("back")}</button>
          <h1 class="ep-title"><button class="ep-switch" type="button" data-epswitch aria-haspopup="dialog">Parliament${NX_SVG.chev}</button></h1></span>
        <span class="ep-head__r" id="epHeadR"></span></div>`);
    $("epHeadR").append($("epCount"));
    $("groups").setAttribute("aria-label", "Seats by political group. Tap a group to filter.");
    $("groups").insertAdjacentHTML("afterend", `<p class="cap ep-barcap" id="epBarCap">Seats by group. Tap one to filter.</p><div class="ep-chips" id="epChips" hidden></div>`);
    const s = v.querySelector(".eu-search");
    v.insertAdjacentHTML("beforeend", `<div class="ep-dock" id="epDock"></div><nav class="ep-az" id="epAz2" aria-label="Jump to a letter"></nav>`);
    $("epDock").append(s);
    $("q").placeholder = "Search MEPs";
    $("epDock").insertAdjacentHTML("beforeend", `<button class="ep-filter" type="button" data-epfilter aria-label="Filter by group, committee or country">
      <svg class="eu-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M7 12h10M10 17h4"/></svg>Filter<span class="ep-filter__n" id="epFiltN" hidden></span></button>`);
  })();

  function epSeatBar() {
    const xs = GROUP_ORDER.map((g) => [g, MEPS.filter((m) => m.group === g).length]).filter((x) => x[1]);
    $("groups").innerHTML = xs.map(([g, n]) => `<button class="ep-seat" type="button" data-g="${esc(g)}" aria-pressed="false" aria-label="${esc(g)}, ${n} seats"
      style="flex:${n} 1 0;--gc:${gc(g)};--gt:${EP_LIGHT_TX.has(g) ? "#fff" : "#0a1128"}">${n >= 70 ? esc(g) : ""}</button>`).join("");
  }
  const epInit0 = initEp;
  initEp = function () { epInit0(); epSeatBar(); };

  renderEp = function () {
    const s = state.ep, t = terms(s.q), cr = EP_CR();
    $("q").value = s.q; $("country").value = s.country; $("committee").value = s.committee;
    const rows = MEPS.filter((m) => (!s.country || m.country === s.country) && (!s.group || m.group === s.group) &&
      (!s.committee || epInCmte(m, s.committee, cr)) && hits(m._hay, t));
    const sig = [s.q, s.country, s.committee, cr, s.group].join("|");
    if (sig !== state.epSig) { state.epSig = sig; state.epShown = EP_STEP; }
    epRows = rows;
    Track.search("ep", s.q, rows.length);
    const n = Math.min(rows.length, Math.max(EP_STEP, state.epShown || 0)), any = !!(s.q || s.country || s.committee || s.group);
    $("epCount").textContent = any ? `${rows.length} of ${MEPS.length}` : `${MEPS.length} MEPs`;
    $("epCount").classList.toggle("is-on", any);
    $("empty").hidden = rows.length > 0;
    $("list").innerHTML = rows.slice(0, n).map(epRow).join("");
    epLeft();
    document.querySelectorAll("#groups [data-g]").forEach((x) => { x.setAttribute("aria-pressed", String(x.dataset.g === s.group)); x.classList.toggle("is-dim", !!s.group && x.dataset.g !== s.group); });
    /* Active filters as chips. The search text is not repeated: it is in the bar at the bottom. */
    const chips = [];
    if (s.group) chips.push(`<button class="ep-chip" type="button" data-eprm="group" aria-label="Remove filter ${esc(s.group)}"><i style="background:${gc(s.group)}"></i>${esc(s.group)}${icon("x")}</button>`);
    if (s.committee) chips.push(`<button class="ep-chip" type="button" data-eprm="committee" aria-label="Remove filter ${esc(s.committee)}">${esc(s.committee)} · ${cr === "all" ? "with substitutes" : "members"}${icon("x")}</button>`);
    if (s.country) chips.push(`<button class="ep-chip" type="button" data-eprm="country" aria-label="Remove filter ${esc(countryName(s.country))}">${esc(countryName(s.country))}${icon("x")}</button>`);
    $("epChips").hidden = !chips.length; $("epBarCap").hidden = !!chips.length;
    $("epChips").innerHTML = chips.join("") + (chips.length + (s.q ? 1 : 0) > 1 || (chips.length && s.q) ? `<button class="ep-clear" type="button" data-epclear>Clear all</button>` : "");
    const nf = [s.group, s.committee, s.country].filter(Boolean).length;
    $("epFiltN").hidden = !nf; $("epFiltN").textContent = nf;
    $("q").placeholder = any && rows.length ? (s.q ? "Search MEPs" : `Search these ${rows.length}`) : "Search MEPs";
    /* A–Z strip: every letter, the ones with no MEP in the current list faded and skipped by assistive tech. */
    const have = new Set(rows.map(famInit));
    $("epAz2").hidden = rows.length < 40;
    $("epAz2").innerHTML = rows.length < 40 ? "" : "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((c) => have.has(c)
      ? `<button type="button" data-az="${c}" aria-label="Jump to ${c}">${c}</button>` : `<span aria-hidden="true">${c}</span>`).join("");
    if (!$("sheet").hidden && state.sheet === "epf") epSheetPaint();
  };
  /* rowMep is a constant in the live app, so the rows that load as you scroll come through epGrow, redefined here. */
  epGrow = function (upTo) {
    const from = $("list").children.length, to = Math.min(epRows.length, Math.max(from + EP_STEP, upTo || 0));
    if (to <= from) return;
    $("list").insertAdjacentHTML("beforeend", epRows.slice(from, to).map(epRow).join(""));
    state.epShown = to; epLeft();
  };

  /* The filter sheet: changes apply at once, the list updates underneath, and the button says how many it shows. */
  function epSheetPaint() {
    const s = state.ep, cr = EP_CR(), on = (x) => `aria-pressed="${x}"`;
    const groups = GROUP_ORDER.map((g) => [g, MEPS.filter((m) => m.group === g).length]).filter((x) => x[1]);
    const cm = new Map(); MEPS.forEach((m) => (m.committees || []).forEach((c) => cm.set(c.abbr || c.name, c.name)));
    const cms = [...cm.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    const ccs = [...new Set(MEPS.map((m) => m.country).filter(Boolean))].sort((a, b) => countryName(a).localeCompare(countryName(b)));
    /* Member and substitute counts respect the other filters, so they match the button. */
    const pool = MEPS.filter((m) => (!s.country || m.country === s.country) && (!s.group || m.group === s.group) && hits(m._hay, terms(s.q)));
    const nm = s.committee ? pool.filter((m) => epInCmte(m, s.committee, "member")).length : 0, na = s.committee ? pool.filter((m) => epInCmte(m, s.committee, "all")).length : 0;
    $("epfBody").innerHTML = `
      <h3>Group</h3><div class="ep-opts">${groups.map(([g, n]) => `<button class="ep-opt" type="button" data-epset="group" data-v="${esc(g)}" ${on(s.group === g)}><i style="background:${gc(g)}"></i>${esc(g)}<span>${n}</span></button>`).join("")}</div>
      <h3>Committee</h3><div class="ep-opts">${cms.map(([k, n]) => `<button class="ep-opt" type="button" data-epset="committee" data-v="${esc(k)}" ${on(s.committee === k)} title="${esc(n)}">${esc(k)}</button>`).join("")}</div>
      ${s.committee ? `<p class="ep-cname">${esc(s.committee)} · ${esc(cm.get(s.committee) || "")}</p>
        <div class="ep-seg" role="radiogroup" aria-label="Committee role"><button type="button" role="radio" data-epcr="member" aria-checked="${cr === "member"}">Members · ${nm}</button><button type="button" role="radio" data-epcr="all" aria-checked="${cr === "all"}">With substitutes · ${na}</button></div>` : ""}
      <h3>Country</h3><div class="ep-cc">${ccs.map((c) => `<button class="ep-opt" type="button" data-epset="country" data-v="${esc(c)}" ${on(s.country === c)} aria-label="${esc(countryName(c))}">${esc(c)}</button>`).join("")}</div>`;
    $("epfShow").textContent = epRows.length ? `Show ${epRows.length} ${pl(epRows.length, "MEP", "MEPs")}` : "No MEP matches";
  }
  function epOpenSheet() {
    state.sheet = "epf";
    if ($("sheet").hidden) layer.sheet = document.activeElement;
    $("sheet").innerHTML = `<div class="sheet__bar"><button class="eu-iconbtn eu-iconbtn--sm" type="button" data-sheet-close aria-label="Close">${icon("x")}</button></div>
      <div class="top"><div class="top__tx"><h2 id="sName">Filter MEPs</h2></div></div>
      <div id="epfBody" class="ep-sheet"></div>
      <div class="ep-sheet__foot"><button class="eu-btn eu-btn--outline" type="button" data-epclear data-epkeep>Clear</button><button class="eu-btn eu-btn--ink eu-btn--block" type="button" id="epfShow" data-sheet-close></button></div>`;
    $("scrim").hidden = false; $("sheet").hidden = false; $("sheet").scrollTop = 0;
    syncLayers(); epSheetPaint();
    const f = $("sheet").querySelector('[aria-pressed="true"]') || $("sheet").querySelector("[data-sheet-close]"); if (f) f.focus({ preventScroll: true });
  }
  function epOpenSwitch() {
    state.sheet = "epsw";
    if ($("sheet").hidden) layer.sheet = document.activeElement;
    const n = { ep: MEPS.length + " MEPs", ec: COLL.length + " Commissioners and their cabinets", co: "27 delegations and the Council configurations" };
    $("sheet").innerHTML = `<div class="sheet__bar"><button class="eu-iconbtn eu-iconbtn--sm" type="button" data-sheet-close aria-label="Close">${icon("x")}</button></div>
      <div class="top"><div class="top__tx"><h2 id="sName">People in</h2></div></div>
      <div class="list">${[["ep", "Parliament"], ["ec", "Commission"], ["co", "Council"]].map(([k, t]) => row({ el: "button", attrs: `type="button" data-dir="${k}"${k === "ep" ? ' aria-current="page"' : ""}`,
        lead: `<span class="nx-dot nx-dot--${k}" aria-hidden="true"></span>`, name: esc(t), meta: esc(n[k]), tail: k === "ep" ? icon("check") : go })).join("")}</div>`;
    $("scrim").hidden = false; $("sheet").hidden = false; syncLayers();
    const f = $("sheet").querySelector('[data-dir="ep"]'); if (f) f.focus({ preventScroll: true });
  }
  document.addEventListener("click", (e) => {
    const t = e.target;
    if (t.closest("[data-epfilter]")) return epOpenSheet();
    if (t.closest("[data-epswitch]")) return epOpenSwitch();
    const set = t.closest("[data-epset]");
    if (set) { const k = set.dataset.epset; state.ep[k] = state.ep[k] === set.dataset.v ? "" : set.dataset.v; renderEp(); const b = $("sheet").querySelector(`[data-epset="${k}"][data-v="${CSS.escape(set.dataset.v)}"]`); if (b) b.focus({ preventScroll: true }); return; }
    const cr = t.closest("[data-epcr]");
    if (cr) { state.ep.cr = cr.dataset.epcr; renderEp(); const b = $("sheet").querySelector(`[data-epcr="${cr.dataset.epcr}"]`); if (b) b.focus({ preventScroll: true }); return; }
    const rm = t.closest("[data-eprm]");
    if (rm) { state.ep[rm.dataset.eprm] = ""; renderEp(); const f = $("epChips").querySelector("button") || $("q"); f.focus({ preventScroll: true }); return; }
  });
  /* "Clear" in the sheet clears and keeps the sheet open (the live handler for data-epclear clears and re-renders). */
  document.addEventListener("click", (e) => { if (e.target.closest("[data-epkeep]")) setTimeout(() => { state.ep.cr = "member"; if (state.sheet === "epf") epSheetPaint(); }, 0); });


  /* ---------- 9. Commission: the College first (since 20 Oct 2026) ---------- */
  /* Same frame as Parliament: one title row ("Commission ▾", the count), search and Filter at the bottom, filters in a sheet.
     The College/Cabinets switch goes: each Commissioner's cabinet unfolds under their row (heads and policy advisers, with
     their top responsibilities and country desks; office staff folded). Search covers the College and all cabinets at once,
     policy staff first, office staff folded into one line. Rows name the nodo files the person is on. */
  const EC_ROLE = { com: "Commissioners", lead: "Heads and deputies", policy: "Policy advisers", office: "Office staff" };
  const ecOpen = new Set(), ecOffOpen = new Set();
  let ecOffAll = false;
  function ecFilesHtml(key, isCom) {
    const xs = epFilesOf(key); if (!xs.length) return "";
    const lead = xs.filter((x) => x.role === "lead"), on = xs.filter((x) => x.role !== "lead");
    const tg = (l) => l.map((x) => fileTag(x.f)).join(", ");
    const txt = isCom ? [lead.length ? "Leads " + tg(lead) : "", on.length ? (lead.length ? "on " : "On ") + tg(on) : ""].filter(Boolean).join(", ") : "On " + tg(xs);
    return `<span class="ep-files"><i aria-hidden="true"></i>${esc(txt)}</span>`;
  }
  const ecPill = (c, open) => `<button class="ec-pill${open ? " is-open" : ""}" type="button" data-ecx="${esc(c.slug)}" aria-expanded="${open}" aria-controls="ecCab-${esc(c.slug)}" aria-label="${open ? "Fold" : "Open"} the cabinet of ${esc(c.name)}, ${c.cabinet.length} people">${c.cabinet.length}${NX_SVG.chev}</button>`;
  const ecPortrait = (c, big) => `<span class="ec-ph${big ? " ec-ph--big" : ""}" aria-hidden="true">${c.photo ? `<img src="${c.photo}" alt="" loading="lazy" decoding="async">` : `<b>${esc(c.name.split(" ").map((w) => w[0]).slice(0, 2).join(""))}</b>`}</span>`;
  /* Up to three published responsibilities, each kept short, the whole line clipped so a row stays three lines or fewer. */
  function ecResp(m) { return nxClip((m.resp || []).map((x) => (typeof x === "string" ? x : x.h || "")).filter(Boolean).slice(0, 3).map((x) => nxClip(x, 44)).join(" · "), 110); }
  function ecCabRow(m) {
    const r = ecResp(m), desk = (m.countries || []).filter((c) => /^[A-Z]{2}$/.test(c));
    return `<div class="ec-mem ec-mem--${m.cls}">
      ${row({ attrs: tap(`data-open="${esc(m.key)}"`), lead: avaOf(m.key), name: esc(m.name), meta: esc(m.role), wrap: true,
        extra: (r ? `<span class="ec-resp">${esc(r)}</span>` : "") + (desk.length ? `<span class="ec-desk">Covers ${esc(desk.join(" "))}</span>` : "") + ecFilesHtml(m.key, false), tail: starBtn(m.key, m.name) })}</div>`;
  }
  function ecCabinet(c) {
    const lead = c.cabinet.filter((m) => m.cls === "lead"), pol = c.cabinet.filter((m) => m.cls === "policy"), off = c.cabinet.filter((m) => m.cls === "office");
    const offOpen = ecOffOpen.has(c.slug);
    return `<div class="ec-cab" id="ecCab-${esc(c.slug)}">${[...lead, ...pol].map(ecCabRow).join("")}
      ${off.length ? `<button class="ec-fold" type="button" data-ecoff="${esc(c.slug)}" aria-expanded="${offOpen}">${off.length} office ${pl(off.length, "contact", "staff")}${NX_SVG.chev}</button>${offOpen ? off.map(ecCabRow).join("") : ""}` : ""}
      <button class="ec-fold ec-fold--page" type="button" data-open="${esc(c.key)}">Open ${esc(c.name)}'s page${icon("arrow")}</button></div>`;
  }
  function ecComRow(c, big) {
    const open = ecOpen.has(c.slug);
    const meta = c.kind === "president" ? "" : c.kind === "hrvp" ? "High Representative · " + c.portfolio.join(" · ") : c.portfolio.join(" · ");
    return `<div class="ec-com${c.kind === "president" ? " ec-com--pres" : ""}${open ? " is-open" : ""}">
      ${row({ attrs: tap(`data-open="${esc(c.key)}"`), lead: ecPortrait(c, big), name: (c.kind === "president" ? `<span class="ec-k">President</span>` : "") + esc(c.name), meta: esc(meta), wrap: true,
        extra: ecFilesHtml(c.key, true), tail: ecPill(c, open) })}
      ${open ? ecCabinet(c) : ""}</div>`;
  }

  (function ecMount() {
    const v = $("vEc"); if (!v || v.querySelector(".ep-head")) return;
    v.classList.add("ep-v2", "ec-v2");
    v.insertAdjacentHTML("afterbegin", `<div class="ep-head">
        <span class="ep-head__l"><button class="eu-iconbtn ep-back" type="button" data-view="people" aria-label="Back to People">${icon("back")}</button>
          <h1 class="ep-title"><button class="ep-switch" type="button" data-epswitch="ec" aria-haspopup="dialog">Commission${NX_SVG.chev}</button></h1></span>
        <span class="ep-head__r" id="ecHeadR"></span></div><div class="ep-chips" id="ecChips" hidden></div>`);
    $("ecHeadR").append($("ecCount"));
    const s = $("ecq").closest(".eu-search");
    v.insertAdjacentHTML("beforeend", `<div class="ep-dock" id="ecDock"></div>`);
    $("ecDock").append(s);
    $("ecDock").insertAdjacentHTML("beforeend", `<button class="ep-filter" type="button" data-ecfilter aria-label="Filter by role, country desk or cabinet">
      <svg class="eu-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M7 12h10M10 17h4"/></svg>Filter<span class="ep-filter__n" id="ecFiltN" hidden></span></button>`);
  })();

  renderEc = function () {
    const s = state.ec, t = terms(s.q), role = s.role || "";
    /* Links from elsewhere still set tab "cabinets" with staff "all": a cabinet search or a country desk. */
    if (s.tab === "cabinets" && !s.q && !s.who && !s.country && !role) s.tab = "college";
    $("ecq").value = s.q;
    $("ecq").placeholder = "Name or topic";
    const any = !!(t.length || s.who || s.country || role);
    const nf = [s.who, s.country, role].filter(Boolean).length;
    $("ecFiltN").hidden = !nf; $("ecFiltN").textContent = nf;
    const chips = [];
    if (role) chips.push(`<button class="ep-chip" type="button" data-ecrm="role" aria-label="Remove filter ${esc(EC_ROLE[role])}">${esc(EC_ROLE[role])}${icon("x")}</button>`);
    if (s.country) chips.push(`<button class="ep-chip" type="button" data-ecrm="country" aria-label="Remove filter covers ${esc(countryName(s.country))}">Covers ${esc(countryName(s.country))}${icon("x")}</button>`);
    if (s.who) { const c = COLL.find((x) => x.slug === s.who); chips.push(`<button class="ep-chip" type="button" data-ecrm="who" aria-label="Remove filter cabinet ${esc(c ? c.name : s.who)}">Cabinet ${esc(c ? c.short : s.who)}${icon("x")}</button>`); }
    $("ecChips").hidden = !chips.length;
    $("ecChips").innerHTML = chips.join("") + (chips.length > 1 || (chips.length && s.q) ? `<button class="ep-clear" type="button" data-ecclear>Clear all</button>` : "");

    if (!any) {
      const cabN = COLL.reduce((a, c) => a + c.cabinet.length, 0);
      $("ecCount").textContent = `${COLL.length} · ${cabN} in cabinets`; $("ecCount").classList.remove("is-on");
      const pres = COLL.filter((c) => c.kind === "president"), vps = COLL.filter((c) => c.kind === "evp" || c.kind === "hrvp"), coms = COLL.filter((c) => c.kind === "commissioner");
      $("ecBody").innerHTML = `${pres.map((c) => ecComRow(c, true)).join("")}
        ${vps.length ? `<h3 class="ec-h">Executive Vice-Presidents <small>${vps.length}</small></h3>${vps.map((c) => ecComRow(c)).join("")}` : ""}
        ${coms.length ? `<h3 class="ec-h">Commissioners <small>${coms.length}</small></h3>${coms.map((c) => ecComRow(c)).join("")}` : ""}`;
      return;
    }
    const coms = (!role || role === "com") && !s.country ? COLL.filter((c) => (!s.who || c.slug === s.who) && (!t.length || lineHits(c, t))) : [];
    let cab = role === "com" ? [] : CAB.filter((m) => (!s.who || m.com.slug === s.who) && (!s.country || (m.countries || []).includes(s.country)) && (!role || m.cls === role) && (!t.length || lineHits(m, t)));
    if (t.length) cab = rankCab(cab, t);
    const main = role === "office" ? cab : cab.filter((m) => m.cls !== "office"), off = role === "office" ? [] : cab.filter((m) => m.cls === "office");
    const n = coms.length + cab.length;
    $("ecCount").textContent = `${n} ${pl(n, "person", "people")}`; $("ecCount").classList.add("is-on");
    Track.search("ec", s.q, n);
    const r = (m) => (t.length ? `<div class="ec-mem ec-mem--${m.cls}">${rowCab(m, t)}</div>`.replace(/(<\/span>)(<button class="eu-iconbtn eu-iconbtn--sm star")/, (_, a, b) => ecFilesHtml(m.key, false) + a + b) : ecCabRow(m));
    const sub = (m) => `<span class="ec-of">${avaOf(m.com.key, "xs")}Cabinet ${esc(m.com.short)}</span>`;
    const grouped = (xs) => { if (t.length || s.who) return xs.map(r).join("");
      let h = "", cur = null; xs.forEach((m) => { if (m.com !== cur) { cur = m.com; h += `<p class="ec-sect">${sub(m)}</p>`; } h += r(m); }); return h; };
    $("ecBody").innerHTML = (n ? "" : `<div class="hint"><span>Nobody matches. Remove a filter or try a broader word.</span></div>`)
      + (coms.length ? `<h3 class="ec-h">Commissioners <small>${coms.length}</small></h3>${coms.map((c) => ecComRow(c)).join("")}` : "")
      + (main.length ? `<h3 class="ec-h">${role === "office" ? "Office staff" : role === "lead" ? "Heads and deputies" : role === "policy" ? "Policy advisers" : "In the cabinets"} <small>${main.length}</small></h3>${grouped(main)}` : "")
      + (off.length ? `<h3 class="ec-h">Office staff <small>${off.length}</small></h3><button class="ec-fold ec-fold--box" type="button" data-ecoffall aria-expanded="${ecOffAll}"><span>${esc(t.length ? "Matching office contacts" : "Office staff")} in ${new Set(off.map((m) => m.com)).size} ${pl(new Set(off.map((m) => m.com)).size, "cabinet", "cabinets")}<small>${esc([...new Set(off.map((m) => m.com.short))].slice(0, 6).join(", "))}${new Set(off.map((m) => m.com)).size > 6 ? "…" : ""}</small></span>${NX_SVG.chev}</button>${ecOffAll ? grouped(off) : ""}` : "")
      + (t.length ? `<p class="foot">Matches the names, portfolios and responsibilities each cabinet publishes. Advisers come first; office staff are folded.</p>` : "");
    if (!$("sheet").hidden && state.sheet === "ecf") ecSheetPaint();
  };

  function ecSheetPaint() {
    const s = state.ec, role = s.role || "", on = (x) => `aria-pressed="${x}"`;
    const nRole = (k) => (k === "com" ? COLL.length : CAB.filter((m) => m.cls === k).length);
    const ccs = [...new Set(CAB.flatMap((m) => m.countries || []))].filter((c) => /^[A-Z]{2}$/.test(c)).sort((a, b) => countryName(a).localeCompare(countryName(b)));
    $("ecfBody").innerHTML = `
      <h3>Who</h3><div class="ep-opts">${Object.entries(EC_ROLE).map(([k, n]) => `<button class="ep-opt" type="button" data-ecset="role" data-v="${k}" ${on(role === k)}>${esc(n)}<span>${nRole(k)}</span></button>`).join("")}</div>
      <h3>Covers the country</h3><div class="ep-cc">${ccs.map((c) => `<button class="ep-opt" type="button" data-ecset="country" data-v="${c}" ${on(s.country === c)} aria-label="${esc(countryName(c))}">${c}</button>`).join("")}</div>
      ${s.country ? `<p class="ep-cname">${esc(countryName(s.country))} · the cabinet member in each cabinet who follows it</p>` : ""}
      <h3>Cabinet</h3><div class="ep-opts">${COLL.map((c) => `<button class="ep-opt" type="button" data-ecset="who" data-v="${esc(c.slug)}" ${on(s.who === c.slug)} title="${esc(c.name)}">${esc(c.short)}</button>`).join("")}</div>`;
    const n = parseInt($("ecCount").textContent, 10);
    $("ecfShow").textContent = !(s.q || s.who || s.country || role) ? "Show the College" : n ? `Show ${n} ${pl(n, "person", "people")}` : "Nobody matches";
  }
  function ecOpenSheet() {
    state.sheet = "ecf";
    if ($("sheet").hidden) layer.sheet = document.activeElement;
    $("sheet").innerHTML = `<div class="sheet__bar"><button class="eu-iconbtn eu-iconbtn--sm" type="button" data-sheet-close aria-label="Close">${icon("x")}</button></div>
      <div class="top"><div class="top__tx"><h2 id="sName">Filter the Commission</h2></div></div>
      <div id="ecfBody" class="ep-sheet"></div>
      <div class="ep-sheet__foot"><button class="eu-btn eu-btn--outline" type="button" data-ecclear data-eckeep>Clear</button><button class="eu-btn eu-btn--ink eu-btn--block" type="button" id="ecfShow" data-sheet-close></button></div>`;
    $("scrim").hidden = false; $("sheet").hidden = false; $("sheet").scrollTop = 0;
    syncLayers(); ecSheetPaint();
    const f = $("sheet").querySelector('[aria-pressed="true"]') || $("sheet").querySelector("[data-sheet-close]"); if (f) f.focus({ preventScroll: true });
  }
  /* The institution switcher from Parliament, reused: it marks the view it was opened from. */
  const ecSwitchBase = epOpenSwitch;
  epOpenSwitch = function () {
    ecSwitchBase();
    const cur = state.view;
    $("sheet").querySelectorAll("[data-dir]").forEach((b) => { const me = b.dataset.dir === cur; if (me) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
      const tl = b.lastElementChild; if (tl) tl.outerHTML = me ? icon("check") : go; });
    const f = $("sheet").querySelector(`[data-dir="${cur}"]`); if (f) f.focus({ preventScroll: true });
  };
  document.addEventListener("click", (e) => {
    const t = e.target;
    const x = t.closest("[data-ecx]");
    if (x) { e.stopPropagation(); e.preventDefault(); const k = x.dataset.ecx; if (ecOpen.has(k)) ecOpen.delete(k); else ecOpen.add(k); renderEc(); const b = $("ecBody").querySelector(`[data-ecx="${CSS.escape(k)}"]`); if (b) b.focus({ preventScroll: true }); return; }
    const o = t.closest("[data-ecoff]");
    if (o) { e.stopPropagation(); const k = o.dataset.ecoff; if (ecOffOpen.has(k)) ecOffOpen.delete(k); else ecOffOpen.add(k); renderEc(); const b = $("ecBody").querySelector(`[data-ecoff="${CSS.escape(k)}"]`); if (b) b.focus({ preventScroll: true }); return; }
    if (t.closest("[data-ecoffall]")) { e.stopPropagation(); ecOffAll = !ecOffAll; renderEc(); const b = $("ecBody").querySelector("[data-ecoffall]"); if (b) b.focus({ preventScroll: true }); return; }
  }, true);
  document.addEventListener("click", (e) => {
    const t = e.target;
    if (t.closest("[data-ecfilter]")) return ecOpenSheet();
    const set = t.closest("[data-ecset]");
    if (set) { const k = set.dataset.ecset; state.ec[k] = state.ec[k] === set.dataset.v ? "" : set.dataset.v; if (k !== "role") state.ec.tab = "cabinets"; renderEc(); const b = $("sheet").querySelector(`[data-ecset="${k}"][data-v="${CSS.escape(set.dataset.v)}"]`); if (b) b.focus({ preventScroll: true }); return; }
    const rm = t.closest("[data-ecrm]");
    if (rm) { state.ec[rm.dataset.ecrm] = ""; renderEc(); const f = $("ecChips").querySelector("button") || $("ecq"); f.focus({ preventScroll: true }); return; }
    if (t.closest("[data-ecclear]")) { state.ec = { ...state.ec, tab: "college", q: "", who: "", country: "", role: "" }; ecOffAll = false; renderEc();
      if (t.closest("[data-eckeep]") && state.sheet === "ecf") ecSheetPaint(); else { scrollTo({ top: 0 }); $("ecq").focus({ preventScroll: true }); } }
  });


  /* ---------- 10. Council: the Presidency clock, then the people (since 20 Oct 2026) ---------- */
  /* One page instead of five tabs. The green Presidency card stays (months labelled, the next Presidency named) and opens
     the priorities, trio and rotation; "Next in the Council" lists the coming Coreper and Council sittings; Delegations
     lists the 27 in protocol order, Presidency first, with ambassador and deputy; the configurations follow, grouped by
     Coreper, with the nodo files they handle. Search and a QMV button sit in the bottom bar. QMV opens as a sheet "by
     weight": two gauges, a population ribbon against the 65% line, the verdict, presets, and the 27 as tappable rows.
     The perm reps hub (working parties, your notes) stays one tap away. */
  const CO_PROTO = ["BE", "BG", "CZ", "DK", "DE", "EE", "IE", "GR", "ES", "FR", "HR", "IT", "CY", "LV", "LT", "LU", "HU", "MT", "NL", "AT", "PL", "PT", "RO", "SI", "SK", "FI", "SE"];
  const coShort = (iso) => fmtIso(iso, { weekday: "short", day: "numeric", month: "short" });
  const coFilesOf = (cid) => FILES.filter((f) => ((f.council || {}).configs || []).includes(cid));
  function coPresCard() {
    const now = new Date(), P = CO.presidency, cur = presOf(now); if (!cur) return "";
    const ci = P.rotation.indexOf(cur), nx = P.rotation[ci + 1];
    const PR = [P.current, P.next].find((x) => x && x.country === cur[0]) || null;
    const end = new Date(+cur[2].slice(0, 4), +cur[2].slice(5, 7), 0), left = Math.round((end - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 864e5);
    const mIn = Math.max(1, Math.min(6, (now.getFullYear() - +cur[1].slice(0, 4)) * 12 + now.getMonth() + 1 - +cur[1].slice(5, 7) + 1));
    const months = [0, 1, 2, 3, 4, 5].map((i) => fmtD(new Date(+cur[1].slice(0, 4), +cur[1].slice(5, 7) - 1 + i, 1), { month: "short" }));
    return `<button class="eu-stat eu-stat--mint co-pres" type="button" data-cov="pres" aria-label="${esc(`${countryName(cur[0])} Presidency, ${left} days left, month ${mIn} of 6. Open priorities, trio and rotation.`)}">
        <span class="eu-stat__head"><span class="eu-tile__disc">${icon("flag")}</span><span class="eu-stat__title">${esc(countryName(cur[0]))} Presidency</span><span class="eu-badge">Month ${mIn} of 6</span></span>
        <span class="eu-stat__figure"><span class="eu-stat__num">${left}</span><span class="eu-stat__of">days left · ends ${esc(fmtD(end, { day: "numeric", month: "short" }))}</span></span>
        <span class="eu-meter" aria-hidden="true">${segs(6, mIn)}</span>
        <span class="co-months" aria-hidden="true">${months.map((m, i) => `<span${i === mIn - 1 ? ' class="is-now"' : ""}>${esc(m)}</span>`).join("")}</span>
        <span class="co-pres__foot">${PR ? `<span>“${esc(PR.motto)}”</span>` : "<span></span>"}${nx ? `<span>Next: <b>${esc(countryName(nx[0]))}</b> from 1 ${esc(fmtD(new Date(+nx[1].slice(0, 4), +nx[1].slice(5, 7) - 1, 1), { month: "short" }))}</span>` : ""}</span>
      </button>`;
  }
  function coNext() {
    const today = todayIso(), xs = [];
    CO.coreper.filter(([d]) => d >= today).slice(0, 6).forEach(([d, k]) => xs.push({ d, t: "Coreper " + k.join(" and "), s: k.length > 1 ? "Ambassadors and deputies" : k[0] === "II" ? "Ambassadors" : "Deputies", attrs: `data-view="cal"` }));
    CO.meetings.filter((m) => m.start >= today && (m.kind === "council" || m.kind === "ec")).slice(0, 8).forEach((m) => {
      const c = m.conf && CONF_BY[m.conf];
      xs.push({ d: m.start, t: m.kind === "ec" ? "European Council" : c ? c.short : m.title, s: [m.informal ? "Informal" : "", m.end !== m.start ? fmtIso(m.start, { day: "numeric" }) + "–" + fmtIso(m.end, { day: "numeric", month: "short" }) : ""].filter(Boolean).join(", ") || (m.kind === "ec" ? "Heads of state or government" : c ? c.name : ""), attrs: c ? `data-conf="${esc(c.id)}"` : `data-view="cal"` });
    });
    xs.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
    return xs.slice(0, 8).map((x) => `<button class="co-next" type="button" ${x.attrs}><span class="co-next__d">${esc(coShort(x.d))}</span><span class="co-next__t">${esc(x.t)}</span><span class="co-next__s">${esc(x.s)}</span></button>`).join("");
  }
  function coDelRow(cc, presCc) {
    const a = slotInfo(cc, "pr"), b = slotInfo(cc, "dpr");
    return row({ attrs: tap(`data-country="${cc}"`), lead: codeAva(cc), name: esc(countryName(cc)) + (cc === presCc ? ` <span class="co-tag">Presidency</span>` : ""), wrap: true,
      meta: a.name ? "Ambassador " + esc(a.name) : "Ambassador not in official sources",
      extra: `<span class="co-dpr">${b.name ? "Deputy " + esc(b.name) : "Deputy not in official sources"}</span>`, tail: go });
  }
  function coConfRow(c) {
    const n = c.next[0], fs = coFilesOf(c.id);
    const d = n ? fromIso(n.start) : null;
    return `<button class="co-conf" type="button" data-conf="${esc(c.id)}">
      <span class="co-conf__d">${d ? `<b>${d.getDate()}</b><span>${esc(fmtD(d, { month: "short" }))}</span>` : `<span>–</span>`}</span>
      <span class="co-conf__tx"><span class="co-conf__n">${esc(c.name)}</span>
        <span class="co-conf__m">${esc([c.short, n ? (n.informal ? "informal" : "") + (n.end !== n.start ? (n.informal ? ", " : "") + fmtIso(n.start, { day: "numeric" }) + "–" + fmtIso(n.end, { day: "numeric", month: "short" }) : "") : "no meeting before January"].filter(Boolean).join(" · "))}</span>
        ${fs.length ? `<span class="ep-files"><i aria-hidden="true"></i>On ${esc(fs.map(fileTag).join(", "))}</span>` : ""}</span></button>`;
  }
  function coHome() {
    const q = state.co.q || "", t = terms(q), presCc = (presOf(new Date()) || [])[0];
    const order = [presCc, ...CO_PROTO.filter((c) => c !== presCc)].filter((c) => POP[c]);
    const delHit = (cc) => !t.length || hits(words([countryName(cc), cc, slotInfo(cc, "pr").name, slotInfo(cc, "dpr").name].join(" ")), t);
    const dels = order.filter(delHit), confs = CO_CONFS.filter((c) => !t.length || hits(c._hay, t));
    const nextIso = (k) => (CO.coreper.find(([d, w]) => d >= todayIso() && w.includes(k)) || [])[0];
    const grp = (k, label) => { const xs = confs.filter((c) => (k === "II" ? c.coreper === "II" : c.coreper !== "II")).sort((a, b) => ((a.next[0] || {}).start || "9") < ((b.next[0] || {}).start || "9") ? -1 : 1);
      return xs.length ? `<div class="co-grp"><span>${label}</span><span>${nextIso(k) ? "Next " + esc(coShort(nextIso(k))) : ""}</span></div>${xs.map(coConfRow).join("")}` : ""; };
    $("coCount").textContent = t.length ? `${dels.length + confs.length} ${pl(dels.length + confs.length, "match", "matches")}` : `${order.length} delegations`;
    $("coCount").classList.toggle("is-on", !!t.length);
    if (t.length) Track.search("co", q, dels.length + confs.length);
    return `${t.length ? "" : coPresCard()}
      ${t.length ? "" : `<h3 class="ec-h">Next in the Council <button class="co-all" type="button" data-view="cal">Calendar</button></h3><div class="co-strip">${coNext()}</div>`}
      ${dels.length ? `<h3 class="ec-h">Delegations <small>${dels.length}</small></h3><div class="list">${dels.map((cc) => coDelRow(cc, presCc)).join("")}</div>
        <button class="ec-fold ec-fold--box co-perms" type="button" data-cov="perms"><span>Working parties and your notes<small>Who covers each working party, the names you added, what needs a check</small></span>${icon("arrow")}</button>` : ""}
      ${confs.length ? `<h3 class="ec-h">Council configurations <small>${confs.length}</small></h3>${grp("II", "Prepared by Coreper II · ambassadors")}${grp("I", "Prepared by Coreper I · deputies")}
        <p class="cap co-att">The attachés who cover each working party are not in nodo: the Council does not publish them.</p>` : ""}
      ${!dels.length && !confs.length ? `<div class="hint"><span>No delegation or configuration matches “${esc(q)}”.</span></div>` : ""}`;
  }
  (function coMount() {
    const v = $("vCo"); if (!v || v.querySelector(".ep-head")) return;
    v.classList.add("ep-v2", "co-v2");
    v.insertAdjacentHTML("afterbegin", `<div class="ep-head">
        <span class="ep-head__l"><button class="eu-iconbtn ep-back" type="button" data-view="people" aria-label="Back to People">${icon("back")}</button>
          <h1 class="ep-title"><button class="ep-switch" type="button" data-epswitch="co" aria-haspopup="dialog">Council${NX_SVG.chev}</button></h1></span>
        <span class="ep-head__r"><p class="cap count" id="coCount" aria-live="polite"></p></span></div>`);
    v.insertAdjacentHTML("beforeend", `<div class="ep-dock" id="coDock"><label class="eu-search">${icon("search")}<input id="coq" type="search" placeholder="Search the Council" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Search delegations and configurations"></label>
      <button class="ep-filter" type="button" data-coqmv aria-label="Count a qualified majority"><svg class="eu-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v16M5 20h14M5 8h14M8 8l-3 6h6zM16 8l-3 6h6z"/></svg>QMV</button></div>`);
    let tm; $("coq").addEventListener("input", (e) => { clearTimeout(tm); tm = setTimeout(() => { state.co.q = e.target.value; state.co.v = "home"; renderCo(); }, 150); });
  })();

  const coBase = renderCo;
  renderCo = function () {
    const v = state.co.v || "home";
    $("coTabs").hidden = true;
    if (v === "pres" || v === "perms") {
      state.co.tab = v === "pres" ? "presidency" : "perms";
      coBase(); $("coTabs").hidden = true;
      $("coBody").insertAdjacentHTML("afterbegin", `<button class="eu-btn eu-btn--sm co-backhome" type="button" data-cov="home">${icon("back")}Council</button>`);
      $("coCount").textContent = v === "pres" ? "Presidency" : "Perm reps"; $("coCount").classList.remove("is-on");
    } else {
      $("coBody").innerHTML = coHome();
      $("coNote").textContent = `Sources: Council of the EU meeting calendar and participant lists, checked ${CO.fetched}.`;
    }
    if (!$("sheet").hidden && state.sheet === "qmv") coQmvPaint();
  };

  /* QMV by weight. state.qmv holds the states in favour, as in the live calculator, so its presets and toggles still apply. */
  function coQmvPaint() {
    if (!state.qmv) state.qmv = new Set(Object.keys(POP));
    const fav = state.qmv, all = Object.keys(POP).sort((a, b) => POP[b] - POP[a]), nF = fav.size, nA = 27 - nF;
    const pF = all.filter((c) => fav.has(c)).reduce((s, c) => s + POP[c], 0) / POPT * 100, pA = 100 - pF;
    const okS = nF >= 15, okP = pF >= 65, reached = (okS && okP) || (nF > 0 && nA <= 3), blocking = nA >= 4 && pA > 35;
    const why = reached ? (okS && okP ? `${nF} member states and ${pct(pF)} of the population in favour.` : "Fewer than four member states against, so the majority is deemed reached.")
      : !okS ? `Needs at least 15 member states in favour; ${nF} so far.` : `Needs 65% of the population in favour; ${pct(pF)} so far.${blocking ? ` The ${nA} states not in favour form a blocking minority with ${pct(pA)}.` : ""}`;
    const L = Math.PI * 60;
    const gauge = (f, thr, big, of, need, ok, aria) => { const a = Math.PI * (1 - thr), x1 = 75 + 48 * Math.cos(a), y1 = 75 - 48 * Math.sin(a), x2 = 75 + 72 * Math.cos(a), y2 = 75 - 72 * Math.sin(a);
      return `<div class="qw-g"><svg role="img" aria-label="${esc(aria)}" viewBox="0 0 150 84"><path d="M 15 75 A 60 60 0 0 1 135 75" class="qw-g__tr"/><path d="M 15 75 A 60 60 0 0 1 135 75" class="qw-g__on" stroke-dasharray="${(Math.max(0, Math.min(1, f)) * L).toFixed(1)} ${L.toFixed(1)}"/><line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" class="qw-g__tk"/></svg>
        <b>${big}</b><span>${of}</span><em class="${ok ? "ok" : "no"}">${ok ? icon("check") : ""}${need}${ok ? " · met" : " · not met"}</em></div>`; };
    const rib = [...all.filter((c) => fav.has(c)), ...all.filter((c) => !fav.has(c))];
    const max = POP[all[0]] / POPT * 100, pres = (presOf(new Date()) || [])[0];
    $("qwBody").innerHTML = `<div class="qw-gs">${gauge(nF / 27, 15 / 27, String(nF), "of 27 member states", "Needs 15", okS, `${nF} of 27 member states in favour; 15 needed`)}${gauge(pF / 100, 0.65, pct(pF), "of the EU population", "Needs 65%", okP, `${pct(pF)} of the EU population in favour; 65% needed`)}</div>
      <div class="qw-rib"><p><span>The EU population, state by state</span><span>65% line</span></p>
        <div class="qw-rib__bar" aria-hidden="true">${rib.map((c) => `<i class="${fav.has(c) ? "on" : ""}" style="flex:${POP[c]} 1 0">${POP[c] / POPT > 0.07 ? c : ""}</i>`).join("")}<b></b></div></div>
      <div class="verdict ${reached ? "ok" : "no"}">${icon(reached ? "check" : "flag")}<div><b>${reached ? "Qualified majority reached" : "No qualified majority"}</b><small>${esc(why)}</small></div></div>
      <div class="ep-opts qw-pre"><button class="ep-opt" type="button" data-qmvset="all">All in favour</button><button class="ep-opt" type="button" data-qmvset="big4">Big four against</button><button class="ep-opt" type="button" data-qmvset="none">None</button></div>
      <ul class="qw-list">${all.map((c) => { const on = fav.has(c), sh = share(c);
        return `<li><button type="button" data-qmv="${c}" aria-pressed="${on}" aria-label="${esc(`${countryName(c)}, ${pct(sh)} of the population, ${on ? "in favour" : "not in favour"}`)}">
          <span class="qw-l__tx"><span class="qw-l__n">${esc(countryName(c))}${c === pres ? " · Presidency" : ""}<span>${pct(sh)}</span></span><span class="qw-l__bar"><i style="width:${(sh / max * 100).toFixed(1)}%"></i></span></span>
          <span class="qw-l__v">${on ? "In favour" : "Against"}</span></button></li>`; }).join("")}</ul>
      <p class="note">Standard qualified majority (Article 16(4) TEU) for Commission proposals: 55% of member states representing 65% of the EU population. A blocking minority needs at least four member states. Abstentions count as not in favour. Population figures for 2026 from Council Decision (EU, Euratom) 2025/2427.</p>`;
  }
  function coOpenQmv() {
    state.sheet = "qmv";
    if ($("sheet").hidden) layer.sheet = document.activeElement;
    $("sheet").innerHTML = `<div class="sheet__bar"><button class="eu-iconbtn eu-iconbtn--sm" type="button" data-sheet-close aria-label="Close">${icon("x")}</button></div>
      <div class="top"><div class="top__tx"><h2 id="sName">Count a qualified majority</h2><div class="cap">Tap a state to switch it between in favour and against.</div></div></div><div id="qwBody" class="qw"></div>`;
    $("scrim").hidden = false; $("sheet").hidden = false; $("sheet").scrollTop = 0;
    syncLayers(); coQmvPaint();
    const f = $("sheet").querySelector("[data-sheet-close]"); if (f) f.focus({ preventScroll: true });
  }
  document.addEventListener("click", (e) => {
    const t = e.target;
    if (t.closest("[data-coqmv]")) return coOpenQmv();
    const cv = t.closest("[data-cov]");
    if (cv) { e.stopPropagation(); state.co.v = cv.dataset.cov; if (state.view !== "co") { coKeep = true; return setView("co"); } renderCo(); scrollTo({ top: 0 });
      const f = $("coBody").querySelector(".co-backhome") || $("coq"); if (f && cv.dataset.cov !== "home") f.focus({ preventScroll: true }); return; }
    /* A QMV toggle keeps its place and focus in the sheet after the repaint. */
    const qm = t.closest("#sheet [data-qmv], #sheet [data-qmvset]");
    if (qm) { const k = qm.dataset.qmv, s = qm.dataset.qmvset, top = $("sheet").scrollTop;
      setTimeout(() => { $("sheet").scrollTop = top; const b = $("sheet").querySelector(k ? `[data-qmv="${k}"]` : `[data-qmvset="${s}"]`); if (b) b.focus({ preventScroll: true }); }, 0); }
  }, true);
  /* The doorway from elsewhere ("Council" on Home and the People page) opens the new home. */
  const coSetView0 = setView;
  let coKeep = false;
  setView = function (v) { if (v === "co" && state.view !== "co" && !coKeep) state.co.v = "home"; coKeep = false; return coSetView0(v); };


  /* ---------- 11. Council: the 27 on a dot map (since 20 Oct 2026) ---------- */
  /* The delegation list gives way to a dot map of the EU (Natural Earth 1:50m, next/europe-dots.json, loaded on first
     visit). Each state has a node with its code; tapping it, or a name in the row under the map, selects it: its dots
     turn gold, the node pulses (unless reduced motion), and a card gives the Presidency dates, the population share and
     the delegation. "Presidencies" colours the current trio, "Voting weight" colours by population. The configurations
     sit behind one Coreper II / Coreper I switch, as two-column cards. Searching still lists delegations and configurations. */
  let CO_DOTS = null, coDotsLoading = false;
  function coDotsLoad() {
    if (CO_DOTS || coDotsLoading) return; coDotsLoading = true;
    fetch("europe-dots.json").then((r) => r.json()).then((j) => { CO_DOTS = j; if (state.view === "co") renderCo(); })
      .catch(() => { coDotsLoading = false; const b = $("coMapBox"); if (b) b.innerHTML = `<div class="hint"><span>The map could not load. The delegations are in search.</span></div>`; });
  }
  const CO_RIGHT = new Set(["FI", "EE", "LV", "LT", "RO", "BG", "GR", "HU", "SK", "PL", "HR"]);
  function coPresLine(cc) {
    const t = todayIso().slice(0, 7), r = CO.presidency.rotation.find((x) => x[0] === cc && x[2] >= t);
    if (!r) return "";
    const cur = r === presOf(new Date());
    return cur ? `Presidency until ${fmtD(new Date(+r[2].slice(0, 4), +r[2].slice(5, 7), 0), { day: "numeric", month: "short", year: "numeric" })}`
      : `Presidency from ${fmtD(new Date(+r[1].slice(0, 4), +r[1].slice(5, 7) - 1, 1), { month: "short", year: "numeric" })}`;
  }
  function coMapHtml() {
    if (!CO_DOTS) { coDotsLoad(); return `<div class="cm cm--load" aria-busy="true"><span class="cap">Drawing the map…</span></div>`; }
    const pres = (presOf(new Date()) || [])[0], trio = (CO.presidency.trios.find((x) => x.includes(pres)) || []).filter((c) => c !== pres);
    const sel = state.co.sel && POP[state.co.sel] ? state.co.sel : pres, mode = state.co.mapMode || "pres";
    const popC = (p) => (p >= 10 ? 5 : p >= 4 ? 4 : p >= 2 ? 3 : p >= 1 ? 2 : 1);
    const cls = (cc) => (cc === sel ? "sel" : mode === "pres" ? (cc === pres ? "now" : trio.includes(cc) ? "trio" : "") : "w" + popC(share(cc)));
    const order = [pres, ...CO_PROTO.filter((c) => c !== pres)];
    const W = CO_DOTS.w, H = CO_DOTS.h;
    const nodes = order.map((cc) => { const [x, y] = CO_DOTS.lab[cc] || [0, 0], on = cc === sel, right = on || CO_RIGHT.has(cc);
      return `<button class="cm-n${on ? " is-sel" : ""}${cc === pres && mode === "pres" ? " is-now" : ""}${right ? "" : " is-left"}" type="button" data-comap="${cc}" aria-pressed="${on}"
        aria-label="${esc(countryName(cc) + (coPresLine(cc) ? ", " + coPresLine(cc) : ""))}" style="left:${(x / W * 100).toFixed(2)}%;top:${(y / H * 100).toFixed(2)}%">
        <i aria-hidden="true"></i><span aria-hidden="true">${esc(on ? countryName(cc) : cc)}</span></button>`; }).join("");
    const legend = mode === "pres" ? [["now", "Presidency now"], ["trio", "Next in the trio"]] : [["w5", "10% or more of the EU"], ["w3", "2 to 4%"], ["w1", "Under 1%"]];
    const pl2 = coPresLine(sel);
    return `<div class="cm-head"><h3 class="ec-h">The 27</h3><div class="cm-modes" role="radiogroup" aria-label="Colour the map by">${[["pres", "Presidencies"], ["pop", "Voting weight"]].map(([k, n]) => `<button type="button" role="radio" data-comode="${k}" aria-checked="${mode === k}">${n}</button>`).join("")}</div></div>
      <div class="cm" style="aspect-ratio:${W}/${H}">
        <svg viewBox="0 0 ${W} ${H}" aria-hidden="true" focusable="false"><path class="cm-land" d="${CO_DOTS.land}"/>${CO_DOTS.eu.map((s) => `<path class="cm-s ${cls(s.cc)}" d="${s.d}"/>`).join("")}</svg>
        ${nodes}
        <div class="cm-leg" aria-hidden="true">${legend.map(([k, n]) => `<span><i class="${k}"></i>${n}</span>`).join("")}<b>Tap a country</b></div>
      </div>
      <div class="cm-card"><span class="cm-card__tx"><b>${esc(countryName(sel))}</b><span>${esc([pl2, pct(share(sel)) + " of the EU population"].filter(Boolean).join(" · "))}</span></span>
        <button class="eu-btn eu-btn--ink" type="button" data-country="${sel}">Delegation${icon("arrow")}</button></div>
      <div class="cm-strip" role="radiogroup" aria-label="Choose a member state">${order.map((cc) => `<button type="button" role="radio" data-comap="${cc}" aria-checked="${cc === sel}">${esc(countryName(cc))}</button>`).join("")}</div>`;
  }
  function coConfsHtml() {
    const k = state.co.k === "I" ? "I" : "II";
    const xs = CO_CONFS.filter((c) => (k === "II" ? c.coreper === "II" : c.coreper !== "II")).sort((a, b) => (((a.next[0] || {}).start || "9") < ((b.next[0] || {}).start || "9") ? -1 : 1));
    const nII = CO_CONFS.filter((c) => c.coreper === "II").length, nI = CO_CONFS.length - nII;
    const nextIso = (w) => (CO.coreper.find(([d, ks]) => d >= todayIso() && ks.includes(w)) || [])[0];
    return `<h3 class="ec-h">Council configurations <small>${CO_CONFS.length}</small></h3>
      <div class="cm-seg" role="radiogroup" aria-label="Prepared by">${[["II", "Coreper II", "Ambassadors · " + nII], ["I", "Coreper I", "Deputies · " + nI]].map(([id, n, s]) => `<button type="button" role="radio" data-cok="${id}" aria-checked="${k === id}"><b>${n}</b><span>${s}</span></button>`).join("")}</div>
      ${nextIso(k) ? `<p class="cap cm-cor">Coreper ${k} next meets ${esc(coShort(nextIso(k)))}.</p>` : ""}
      <div class="cm-confs">${xs.map((c) => { const n = c.next[0], fs = coFilesOf(c.id);
        return `<button class="cm-conf" type="button" data-conf="${esc(c.id)}"><span class="cm-conf__h"><b>${esc(c.short)}</b><span>${n ? esc(fmtIso(n.start, { day: "numeric", month: "short" })) : "–"}</span></span>
          ${fs.length ? `<span class="ep-files"><i aria-hidden="true"></i>On ${esc(fs.map(fileTag).join(", "))}</span>` : `<span class="cm-conf__s">${esc(n && n.informal ? "Informal" : n ? c.name : "No meeting before January")}</span>`}</button>`; }).join("")}</div>
      <p class="cap co-att">The attachés who cover each working party are not in nodo: the Council does not publish them.</p>`;
  }
  const coHome0 = coHome;
  coHome = function () {
    if ((state.co.q || "").trim()) return coHome0();
    $("coCount").textContent = "27 member states"; $("coCount").classList.remove("is-on");
    return `${coPresCard()}
      <h3 class="ec-h">Next in the Council <button class="co-all" type="button" data-view="cal">Calendar</button></h3><div class="co-strip">${coNext()}</div>
      <div id="coMapBox">${coMapHtml()}</div>
      <button class="ec-fold ec-fold--box co-perms" type="button" data-cov="perms"><span>Delegations, working parties and your notes<small>Ambassadors, deputies, who covers each working party, the names you added</small></span>${icon("arrow")}</button>
      <div id="coConfBox">${coConfsHtml()}</div>`;
  };
  function coMapRepaint(focusCc) {
    const b = $("coMapBox"); if (!b) return renderCo();
    const sx = b.querySelector(".cm-strip") ? b.querySelector(".cm-strip").scrollLeft : 0;
    b.innerHTML = coMapHtml();
    const s = b.querySelector(".cm-strip"); if (s) s.scrollLeft = sx;
    if (focusCc) { const f = b.querySelector(`${focusCc.strip ? ".cm-strip " : ".cm "}[data-comap="${focusCc.cc}"]`); if (f) { f.focus({ preventScroll: true }); if (focusCc.strip) f.scrollIntoView({ inline: "nearest", block: "nearest" }); } }
  }
  document.addEventListener("click", (e) => {
    const t = e.target;
    const m = t.closest("[data-comap]");
    if (m) { state.co.sel = m.dataset.comap; Track.log("open", { section: "co-map", item: m.dataset.comap }); return coMapRepaint({ cc: m.dataset.comap, strip: !!m.closest(".cm-strip") }); }
    const md = t.closest("[data-comode]");
    if (md) { state.co.mapMode = md.dataset.comode; coMapRepaint(); const f = $("coMapBox").querySelector(`[data-comode="${md.dataset.comode}"]`); if (f) f.focus({ preventScroll: true }); return; }
    const k = t.closest("[data-cok]");
    if (k) { state.co.k = k.dataset.cok; $("coConfBox").innerHTML = coConfsHtml(); const f = $("coConfBox").querySelector(`[data-cok="${k.dataset.cok}"]`); if (f) f.focus({ preventScroll: true }); }
  });


  /* ---------- 12. Updates reach the phone (since 20 Oct 2026) ---------- */
  /* A Home Screen app on iPhone resumes instead of restarting, so it kept showing the build it had saved. When the app
     comes back to the foreground it asks for a new service worker; when one takes over, the page reloads once, unless
     a sheet, a profile or the onboarding is open (then it waits for the next return). */
  if ("serviceWorker" in navigator && /github\.io$/.test(location.hostname)) {
    let nxHadCtl = !!navigator.serviceWorker.controller, nxReloadDue = false;
    const nxBusy = () => !$("sheet").hidden || !$("profile").hidden || !$("onb").hidden;
    const nxReload = () => { if (nxBusy()) { nxReloadDue = true; return; } location.reload(); };
    navigator.serviceWorker.addEventListener("controllerchange", () => { if (nxHadCtl) nxReload(); nxHadCtl = true; });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState !== "visible") return;
      if (nxReloadDue) return nxReload();
      navigator.serviceWorker.getRegistration().then((r) => r && r.update()).catch(() => {});
    });
  }


  /* ---------- 13. You: profile and settings (since 21 Oct 2026) ----------
     The profile stops imitating a social profile: nobody else sees it. A compact header (face, name, email and sign-in method),
     then "Make nodo yours" (countries, files, saved people, each saying what it changes) while all three are empty, and
     "What you cover" once one is set. Settings below open as their own pages: Notifications (switches saved on profile.notify;
     weekly and alerts are the Files view's switches, the others are new keys) and Account and privacy (name, sign-in, export,
     what nodo stores, delete). Removed: the 0/0/0 counters, organisation and role, the Synced pill (now a footer line).
     When promoted, openMe in the live app takes this code and openRoute the me:notify and me:account keys. */
  const yuSvg = (d, sw) => `<svg class="yu-ic" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="${sw || 1.75}" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const YU_IC = {
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10 21h4"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
    route: '<circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="6" r="2.5"/><path d="M8.5 18H15a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6.5"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
    chev: '<path d="M9 6l6 6-6 6"/>',
    tick: '<path d="M5 12l4 4 10-10"/>',
  };
  const YU_NOTE = { alerts: 1, people: 1, agenda: 1, cabinets: 1, weekly: 1 };
  const yuNotify = () => Object.assign({ weekly: false, alerts: false, people: false, agenda: false, cabinets: false, quietEve: true, quietWkd: true }, (state.profile && state.profile.notify) || {});
  const yuOn = () => { const n = yuNotify(); return Object.keys(YU_NOTE).filter((k) => n[k]).length; };
  const yuDate = (iso) => { const d = new Date(iso + "T12:00:00"); return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }); };
  const yuNext = (f) => { const t = todayIso(); return (f.next || []).filter((s) => s.date && s.date >= t).sort((a, b) => (a.date < b.date ? -1 : 1))[0] || null; };
  const yuRow = (attrs, ic, name, meta) => `<button class="yu-row" type="button" ${attrs}><span class="yu-disc">${yuSvg(YU_IC[ic])}</span><span class="yu-row__name">${name}</span>${meta ? `<span class="yu-row__meta">${meta}</span>` : ""}${yuSvg(YU_IC.chev, 2)}</button>`;
  const yuSwitch = (k, title, sub) => `<div class="yu-set"><span class="yu-set__tx" id="yuL-${k}"><b>${title}</b><span>${sub}</span></span>
    <button class="nx-switch" type="button" role="switch" data-yuset="${k}" aria-checked="${!!yuNotify()[k]}" aria-labelledby="yuL-${k}"></button></div>`;
  const yuTop = `<div class="tb">${backBtn}${icon("back")}</button></div>`;

  function yuHead(p, nm) {
    const mail = (acct.user && acct.user.email) || p.email || "";
    const how = p.method ? METHOD_LABEL[p.method] || "" : "";
    return `<div class="yu-head">
      <button class="yu-face" type="button" data-avatar aria-label="Change profile picture"><span class="eu-row__avatar ava">${meFace()}</span><i aria-hidden="true"></i></button>
      <div class="yu-head__tx"><h2 class="yu-name" id="pName">${nm ? twoW(nm) : "Your <strong>profile</strong>"}</h2>
        ${mail || how ? `<p class="yu-meta">${esc([mail, how].filter(Boolean).join(" · "))}</p>` : ""}</div>
      <button class="yu-pill" type="button" data-yugo="me:account">Edit</button></div>`;
  }
  function yuStepsHtml() {
    const step = (n, attrs, title, sub) => `<button class="yu-step" type="button" ${attrs}><span class="yu-step__n" aria-hidden="true">${n}</span>
      <span class="yu-step__tx"><b>${title}</b><span>${sub}</span></span>${yuSvg(YU_IC.chev, 2)}</button>`;
    return `<section class="yu-card" aria-labelledby="yuSetT">
      <div class="yu-card__top"><h3 class="yu-h" id="yuSetT">Make nodo <strong>yours</strong></h3><span class="yu-meta">0 of 3</span></div>
      <div class="yu-bar" aria-hidden="true"><i></i><i></i><i></i></div>
      <p class="yu-lead">Each step changes what your home shows first.</p>
      ${step(1, `data-edit="2"`, "Pick the countries you cover", "Their MEPs and each cabinet's country desk come first")}
      ${step(2, `data-nxpick`, "Follow the files you work on", "Their next dates lead your home and your alerts")}
      ${step(3, `data-view="people"`, "Save the people you meet", "Tap the star on any MEP, Commissioner or adviser")}
    </section>`;
  }
  function yuCoverHtml(cs, fol, favs) {
    const head = (t, n, attrs, act) => `<div class="yu-sub"><h4>${t}${n ? ` · ${n}` : ""}</h4><button class="yu-link" type="button" ${attrs}>${act}</button></div>`;
    const t7 = addD(new Date(), 7).toISOString().slice(0, 10);
    const countries = cs.length ? `<div class="yu-chips">${cs.length >= EU27.length ? `<span class="yu-chip">All ${EU27.length} countries</span>` : cs.map((c) => `<span class="yu-chip"><span class="yu-cc">${esc(c)}</span>${esc(countryName(c))}</span>`).join("")}</div>`
      : `<p class="yu-empty">None yet. Their MEPs and country desks will come first.</p>`;
    const files = fol.length ? `<div class="yu-files">${fol.map((f) => { const n = yuNext(f), soon = n && n.date <= t7;
        return `<button class="yu-file" type="button" data-file="${esc(f.id)}"><span class="yu-file__tx"><b>${esc(f.short)}</b><span>${n ? esc(n.what.replace(/\s*\(.*?\)\s*$/, "")) + " · " + yuDate(n.date) : "No date set yet"}</span></span>${soon ? `<i class="yu-soon" role="img" aria-label="Next date within a week"></i>` : ""}</button>`; }).join("")}</div>`
      : `<p class="yu-empty">None yet. Followed files lead your home.</p>`;
    const by = { ep: 0, ec: 0, cab: 0 }; favs.forEach((k) => { const t = BYKEY.get(k).t; if (by[t] !== undefined) by[t]++; });
    const mix = [by.ep && `${by.ep} ${pl(by.ep, "MEP", "MEPs")}`, by.cab && `${by.cab} cabinet`, by.ec && `${by.ec} ${pl(by.ec, "Commissioner", "Commissioners")}`].filter(Boolean).join(" · ");
    const people = favs.length ? `<button class="yu-faces" type="button" data-view="saved" aria-label="${esc(favs.length + " saved: " + mix)}"><span class="yu-stack" aria-hidden="true">${favs.slice(0, 5).map((k) => avaOf(k)).join("")}${favs.length > 5 ? `<span class="yu-more">+${favs.length - 5}</span>` : ""}</span><span class="yu-meta">${esc(mix)}</span></button>`
      : `<p class="yu-empty">Nobody yet. Tap the star on any profile.</p>`;
    return `<section class="yu-card" aria-labelledby="yuCovT"><h3 class="yu-h" id="yuCovT">What you <strong>cover</strong></h3>
      <div>${head("Countries", cs.length && cs.length < EU27.length ? cs.length : "", `data-edit="2"`, cs.length ? "Edit" : "Add")}${countries}</div>
      <div>${head("Files you follow", fol.length, fol.length ? `data-view="files"` : "data-nxpick", fol.length ? "All files" : "Choose")}${files}</div>
      <div>${head("Saved people", favs.length, favs.length ? `data-view="saved"` : `data-view="people"`, favs.length ? "See all" : "Find people")}${people}</div>
    </section>`;
  }
  openMe = function (keepScroll) {
    state.open = "me";
    const p = state.profile || {}, nm = state.me.name || p.name || "";
    const fol = followedFiles(), cs = p.countries || [], favs = [...state.favs].filter((k) => BYKEY.has(k));
    const top = $("profile").scrollTop;
    const on = yuOn();
    const sync = acct.user ? ({ synced: "Synced across your devices", syncing: "Syncing…", offline: "Offline. Syncs when you are back", error: "Sync paused. Will retry" }[Store.status] || "Syncing…") : "Saved in this browser";
    showProfile(`${yuTop}<div class="yu">
      ${yuHead(p, nm)}
      ${!cs.length && !fol.length && !favs.length ? yuStepsHtml() : yuCoverHtml(cs, fol, favs)}
      <section aria-labelledby="yuSetH"><h3 class="yu-cap" id="yuSetH">Settings</h3><div class="yu-list">
        ${yuRow(`data-yugo="me:notify"`, "bell", "Notifications", on ? `${on} on` : "Off")}
        ${yuRow(`data-yugo="me:account"`, "user", "Account and privacy")}
        ${yuRow(`data-tour-start`, "route", "Take the tour", "1 min")}
        ${yuRow(`data-view="about"`, "info", "About nodo and feedback")}
      </div></section>
      <div class="yu-end">${acct.user || p.method ? `<button class="eu-btn eu-btn--outline" id="outBtn" type="button">Sign out</button>` : `<button class="eu-btn eu-btn--brand" id="inBtn" type="button">Sign in or create an account</button>`}
        <p class="yu-meta yu-sync">${Store.status === "synced" && acct.user ? yuSvg(YU_IC.tick, 2.2) : ""}${esc(sync)}</p></div>
    </div>`);
    if (keepScroll) $("profile").scrollTop = top;
    if ($("outBtn")) $("outBtn").onclick = signOut;
    if ($("inBtn")) $("inBtn").onclick = () => openOnb(0, false);
  };

  function yuOpenNotify() {
    state.open = "me:notify";
    showProfile(`${yuTop}<div class="yu">
      <div><h2 class="yu-title" id="pName">Tell me <strong>when</strong></h2><p class="yu-lead">nodo alerts you only when something changes on what you follow.</p></div>
      <section aria-labelledby="yuN1"><h3 class="yu-cap" id="yuN1">On your phone</h3><div class="yu-list">
        ${yuSwitch("alerts", "Files you follow", "New dates, stage changes, new rapporteurs")}
        ${yuSwitch("people", "People you saved", "New role, committee seat or replacement")}
        ${yuSwitch("agenda", "Plenary agenda", "When the draft agenda is published")}
        ${yuSwitch("cabinets", "Cabinets for your countries", "Arrivals and departures in Commission cabinets")}
      </div></section>
      <section aria-labelledby="yuN2"><h3 class="yu-cap" id="yuN2">By email</h3><div class="yu-list">
        ${yuSwitch("weekly", "Monday email", "What moved on your files last week")}
      </div></section>
      <section aria-labelledby="yuN3"><h3 class="yu-cap" id="yuN3">Quiet hours</h3><div class="yu-list">
        ${yuSwitch("quietEve", "Evenings", "Hold alerts from 20:00 to 08:00")}
        ${yuSwitch("quietWkd", "Weekends", "Hold alerts on Saturday and Sunday")}
      </div></section>
      <p class="yu-note"><i aria-hidden="true"></i>In testing: your choices are saved, nothing is sent yet. Times are Brussels time.</p>
    </div>`);
  }

  function yuOpenAccount() {
    state.open = "me:account";
    const p = state.profile || {}, nm = String(state.me.name || p.name || "").trim();
    const first = nm.split(/\s+/)[0] || "", last = nm.split(/\s+/).slice(1).join(" ");
    const mail = (acct.user && acct.user.email) || p.email || "";
    const chev = yuSvg(YU_IC.chev, 2);
    showProfile(`${yuTop}<div class="yu">
      <h2 class="yu-title" id="pName">Account and <strong>privacy</strong></h2>
      <div class="yu-photo"><button class="yu-face" type="button" data-avatar aria-label="Change profile picture"><span class="eu-row__avatar ava">${meFace()}</span></button>
        <div><button class="yu-pill" type="button" data-avatar>${chosenFace() ? "Change photo" : "Add a photo"}</button><p class="yu-meta">Only you see it</p></div></div>
      <section aria-labelledby="yuA1"><h3 class="yu-cap" id="yuA1">Your name</h3><div class="yu-list yu-form">
        <div class="field"><label for="yuFirst">First name</label><input id="yuFirst" value="${esc(first)}" autocomplete="given-name"></div>
        <div class="field"><label for="yuLast">Last name</label><input id="yuLast" value="${esc(last)}" autocomplete="family-name"></div>
        <button class="eu-btn eu-btn--brand eu-btn--block" id="yuSaveName" type="button">Save name</button>
      </div></section>
      <section aria-labelledby="yuA2"><h3 class="yu-cap" id="yuA2">Sign-in</h3><div class="yu-list">
        <div class="yu-set"><span class="yu-set__tx"><b>${esc(mail || "No email on file")}</b><span>${p.method ? "Signed in with " + esc(METHOD_LABEL[p.method] || "your account") : acct.user ? "Signed in" : "Not signed in"}</span></span></div>
      </div></section>
      <section aria-labelledby="yuA3"><h3 class="yu-cap" id="yuA3">Your data</h3><div class="yu-list">
        <button class="yu-set yu-set--go" type="button" id="yuExp"><span class="yu-set__tx"><b>Download your data</b><span>Profile, saved people, lists and files you follow</span></span>${chev}</button>
        <button class="yu-set yu-set--go" type="button" id="yuWhat"><span class="yu-set__tx"><b>What nodo stores</b><span>And who can read it</span></span>${chev}</button>
      </div></section>
      <div class="yu-end" id="yuDelBox">${acct.user ? `<button class="eu-btn eu-btn--outline danger" id="yuDel" type="button">Delete account</button><p class="yu-meta">Removes your account and everything you saved, on every device.</p>` : ""}</div>
    </div>`);
    $("yuSaveName").onclick = () => {
      const n = [$("yuFirst").value, $("yuLast").value].map((x) => x.trim()).filter(Boolean).join(" ");
      if (!n) { $("yuFirst").focus(); return toast("Add your first name"); }
      state.profile = { ...(state.profile || {}), name: n }; saveProfile(); identityChanged();
      toast("Name saved");
    };
    $("yuExp").onclick = exportData;
    $("yuWhat").onclick = openDataSheet;
    if ($("yuDel")) $("yuDel").onclick = () => {
      $("yuDelBox").innerHTML = `<div class="block"><p>This permanently deletes your account, your profile, saved people and file lists on every device. It cannot be undone.</p>
        <div class="acts"><button class="eu-btn" id="yuNoDel" type="button">Keep my account</button><button class="eu-btn eu-btn--ink" id="yuYesDel" type="button">Delete everything</button></div></div>`;
      $("yuNoDel").onclick = () => { const t = $("profile").scrollTop; yuOpenAccount(); $("profile").scrollTop = t; };
      $("yuYesDel").onclick = deleteAccount;
    };
  }

  const yuRouteBase = openRoute;
  openRoute = function (key) {
    if (key === "me:notify") return yuOpenNotify();
    if (key === "me:account") return yuOpenAccount();
    return yuRouteBase(key);
  };
  document.addEventListener("click", (e) => {
    const t = e.target;
    const g = t.closest("[data-yugo]"); if (g) return openRoute(g.dataset.yugo);
    const s = t.closest("[data-yuset]");
    if (s) {
      const k = s.dataset.yuset;
      if (!state.profile) state.profile = {};
      const n = yuNotify(); n[k] = !n[k];
      state.profile.notify = n; saveProfile();
      Track.log("notify", { section: k, item: n[k] ? "on" : "off" });
      s.setAttribute("aria-checked", String(n[k]));
      if (YU_NOTE[k]) toast(n[k] ? "On (testing, nothing is sent yet)" : "Off");
    }
  });
  /* The profile refreshes when a step done from it changes what it shows (files picked, countries or name saved). */
  const yuPickBase = nxPickDone, yuIdBase = identityChanged;
  const yuRefresh = () => { if (state.open === "me" && !$("profile").hidden) openMe(true); };
  nxPickDone = function () { const r = yuPickBase.apply(this, arguments); yuRefresh(); return r; };
  identityChanged = function () { const r = yuIdBase.apply(this, arguments); yuRefresh(); return r; };


  /* ---------- 10. Admin (since 21 Oct 2026) ----------
     A read-only console for the owner, in the menu for admin accounts only: what needs him, the data runs, the users
     and what people look for. Who is an admin lives in Supabase (public.admins). public.is_admin() and
     public.admin_overview() are the only ways in, and the overview refuses every other account, so hiding the menu row
     is convenience, not the protection. Data health comes from status.json on the `status` branch, which the
     "Publish health status" workflow rewrites after every data run. Nothing here writes: each card links to where the
     action happens today (GitHub, Supabase). Approve, edit and delete come in step 2. */
  const AD_STATUS = "https://raw.githubusercontent.com/gianmariasisti-afk/nodo-data/status/status.json";
  const AD_REPO = "https://github.com/gianmariasisti-afk/nodo-data";
  const AD_USERS = "https://supabase.com/dashboard/project/dmishwyqipqbfgtdpalk/auth/users";
  const ad = { on: false, status: null, over: null, err: { status: "", over: "" }, at: 0, busy: null, all: false };
  const adAge = (d) => (d ? Math.round((Date.parse(todayIso()) - Date.parse(String(d).slice(0, 10))) / 864e5) : null);
  const adDay = (d) => (d ? fmtD(fromIso(String(d).slice(0, 10)), { day: "numeric", month: "short" }) : "not yet");
  const adWhen = (iso) => {
    if (!iso) return "never";
    const d = new Date(iso), t = new Date(), y = new Date(t); y.setDate(t.getDate() - 1);
    const hm = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    if (d.toDateString() === t.toDateString()) return "today " + hm;
    if (d.toDateString() === y.toDateString()) return "yesterday " + hm;
    return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  };
  const adPl = (n, one, many) => n + " " + (n === 1 ? one : many || one + "s");
  const adMB = (b) => (b / 1048576).toFixed(b < 10485760 ? 1 : 0);

  /* Who is an admin: asked once per sign-in. */
  async function adCheck() {
    const sb = SB.client; ad.on = false;
    if (sb && acct.user) { try { const { data, error } = await sb.rpc("is_admin"); ad.on = !error && data === true; } catch { /* stays off */ } }
    adEntry();
    if (ad.on) adLoad().then(adEntry);
    else if (state.view === "admin") setView("home");
  }
  const adConnect = Store.connectSb;
  Store.connectSb = async function (user) { const out = await adConnect.call(this, user); adCheck(); return out; };
  const adLeave = leaveAccount;
  leaveAccount = function () { ad.on = false; ad.status = ad.over = null; ad.at = 0; adEntry(); return adLeave.apply(this, arguments); };

  /* The menu row, last before your profile, shown only to admins, with a count of what needs you. */
  /* A small link beside About nodo since 23 Oct 2026; it was a full card that outweighed the sections. */
  $("nxLinks").insertAdjacentHTML("beforeend",
    `<button class="nx-flink ad-entry" type="button" data-view="admin" data-nx="admin" hidden>Admin<span class="ad-entry__count" id="adCount" hidden></span></button>`);
  function adEntry() {
    const b = $("nxMenu").querySelector(".ad-entry"); b.hidden = !ad.on;
    const n = ad.status ? adNeeds().length : 0, c = $("adCount");
    c.hidden = !n; c.textContent = n; c.setAttribute("aria-label", adPl(n, "thing needs", "things need") + " you");
  }

  /* The view. */
  VIEW_IDS.admin = "vAdmin";
  $("vNews").insertAdjacentHTML("afterend", `<main id="vAdmin" class="view" hidden aria-label="Admin"></main>`);
  const adSetView = setView;
  setView = function (v) { return adSetView(v === "admin" && !ad.on ? "home" : v); };
  const adRenderView = renderView;
  renderView = function () { adRenderView(); if (state.view === "admin") { renderAdmin(); if (Date.now() - ad.at > 60000) adLoad().then(() => { if (state.view === "admin") renderAdmin(); }); } };

  function adLoad() {
    if (ad.busy) return ad.busy;
    const st = fetch(AD_STATUS + "?t=" + Date.now(), { cache: "no-store" })
      .then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then((j) => { ad.status = j; ad.err.status = ""; })
      .catch(() => { ad.err.status = "Could not read the status file from GitHub."; });
    const ov = SB.client ? SB.client.rpc("admin_overview").then(({ data, error }) => {
      if (error) { ad.err.over = error.code === "42501" ? "This account is not an admin." : "Could not read users from Supabase."; return; }
      ad.over = data; ad.err.over = "";
    }, () => { ad.err.over = "Could not read users from Supabase."; }) : Promise.resolve();
    ad.busy = Promise.all([st, ov]).then(() => { ad.at = Date.now(); ad.busy = null; adEntry(); });
    return ad.busy;
  }

  /* What needs you, from status.json. The limits follow the weekday data check. */
  const AD_WF = { "Update MEP directory": "MEP directory", "Update Commission and cabinets": "Commission cabinets", "Update plenary agenda": "Plenary agenda",
    "Update MEP activity": "MEP activity", "Update file stream": "News on the files", "Validate data": "Data validation" };
  const AD_FRESH = [["council", 5, "Council data"], ["commission", 3, "Commission cabinets"], ["mepsChecked", 3, "The MEP directory check"],
    ["agendaChecked", 2, "The plenary agenda check"], ["activity", 2, "MEP activity"], ["calendar", 45, "The Parliament calendar"]];
  function adNeeds() {
    const s = ad.status, out = [];
    if (!s) return out;
    (s.openIssues || []).forEach((i) => {
      const L = i.labels || [];
      if (L.includes("agenda")) return;
      if (L.includes("structural") && /changes to review/i.test(i.title)) out.push({ tone: "review", ic: "user", t: i.title.replace(/\/cabinets/, " cabinets"),
        s: "Waiting since " + adDay(i.createdAt) + ". Senior roles and large batches always wait for you; merging the review branch accepts them.", href: i.url, cta: "Open the review on GitHub" });
      else out.push({ tone: "bad", ic: "warn", t: i.title, s: "Open since " + adDay(i.createdAt) + ".", href: i.url, cta: "Open on GitHub" });
    });
    (s.workflows || []).forEach((w) => {
      if (w.latest && w.latest.conclusion !== "success") out.push({ tone: "bad", ic: "warn", t: (AD_WF[w.name] || w.name) + ": the last run failed",
        s: "Failed " + adWhen(w.latest.at) + ". Last good run " + adWhen(w.lastSuccessAt) + ".", href: w.latest.url, cta: "See the run" });
    });
    const f = s.freshness || {};
    AD_FRESH.forEach(([k, n, label]) => { const a = adAge(f[k]); if (a != null && a > n) out.push({ tone: "warn", ic: "cal", t: label + " is " + adPl(a, "day") + " old", s: "Expected within " + adPl(n, "day") + ". Last update " + adDay(f[k]) + "." }); });
    (s.files || []).forEach((x) => {
      if (x.past) out.push({ tone: "warn", ic: "files", t: x.short + ": " + (x.past === 1 ? "a next step is" : x.past + " next steps are") + " in the past", s: "The app hides past dates. The Monday refresh replaces them; status checked " + adDay(x.checked) + "." });
      if (x.checkedDays > 8) out.push({ tone: "warn", ic: "files", t: x.short + ": status not checked for " + adPl(x.checkedDays, "day"), s: "Last checked " + adDay(x.checked) + "." });
    });
    const r = s.reference || {}, p = r.presidency, pr = r.permrepsExtra;
    if (p && p.next && !p.nextProfile && p.daysToHandover <= 60) out.push({ tone: "warn", ic: "flag", t: "No profile yet for the " + p.next + " Presidency", s: "It takes over in " + adPl(p.daysToHandover, "day") + "." });
    if (pr && pr.oldestDays > 40) out.push({ tone: "warn", ic: "group", t: "Hand-added perm reps need a recheck", s: adPl(pr.entries, "entry", "entries") + ". The oldest was checked " + adPl(pr.oldestDays, "day") + " ago." });
    if ((s.manifestProblems || []).length) out.push({ tone: "bad", ic: "warn", t: "The data manifest is out of step", s: adPl(s.manifestProblems.length, "entry", "entries") + " no longer match their file." });
    const h = (Date.now() - Date.parse(s.generated)) / 36e5;
    if (h > 36) out.push({ tone: "warn", ic: "warn", t: "The status snapshot is " + Math.round(h) + " hours old", s: "It is rewritten after every data run. Nothing has run since " + adWhen(s.generated) + "." });
    return out;
  }

  /* One row per data source: the workflow's last run, or the file date for sources refreshed outside GitHub. */
  function adRuns() {
    const s = ad.status || {}, f = s.freshness || {}, c = s.counts || {}, files = s.files || [];
    const wf = Object.fromEntries((s.workflows || []).map((w) => [w.name, w]));
    const fromWf = (name, label, sub) => {
      const w = wf[name]; if (!w) return null;
      const ok = w.latest.conclusion === "success", lateH = (Date.now() - Date.parse(w.lastSuccessAt || 0)) / 36e5;
      return { n: label, sub: sub + " · last run " + adWhen(w.latest.at), st: !ok ? "bad" : lateH > 72 && name !== "Validate data" ? "warn" : "ok", href: w.latest.url };
    };
    const fromDate = (d, max, label, sub) => { const a = adAge(d); return { n: label, sub: sub + " · updated " + adDay(d), st: a == null ? "warn" : a > max ? "warn" : "ok" }; };
    const maxChecked = files.reduce((m, x) => Math.max(m, x.checkedDays || 0), 0);
    return [
      fromWf("Update MEP directory", "MEP directory", "Weekdays"),
      fromWf("Update Commission and cabinets", "Commission cabinets", "Weekdays"),
      fromDate(f.council, 5, "Council and perm reps", "Mon and Thu on the Mac"),
      fromWf("Update plenary agenda", "Plenary agenda", "Twice a day"),
      fromWf("Update MEP activity", "MEP activity", (c.activityFiles || 0) + " feeds, " + (c.questionFiles || 0).toLocaleString("en-GB") + " questions"),
      fromWf("Update file stream", "News on the files", "Daily"),
      { ...fromDate(f.filesAsOf, 8, "Files status", "Mondays · " + adPl(files.length, "file")), st: maxChecked > 8 ? "warn" : adAge(f.filesAsOf) > 8 ? "warn" : "ok" },
      fromDate(f.calendar, 45, "Parliament calendar", "When the Parliament publishes"),
      fromWf("Validate data", "Data validation", "On every data push"),
    ].filter(Boolean);
  }

  function renderAdmin() {
    const v = $("vAdmin"), s = ad.status, o = ad.over;
    if (!s && !o && !ad.err.status && !ad.err.over) { v.innerHTML = `<div class="ad-wrap"><p class="cap ad-loading">Loading the admin overview…</p></div>`; return; }
    const needs = adNeeds(), runs = adRuns();
    const pill = (st) => st === "ok" ? `<span class="ad-pill ad-pill--ok">${icon("check")}OK</span>` : st === "bad" ? `<span class="ad-pill ad-pill--bad">${icon("warn")}Failed</span>` : `<span class="ad-pill ad-pill--warn">${icon("warn")}Late</span>`;
    const err = (m) => (m ? `<p class="ad-err" role="status">${icon("warn")}${esc(m)}</p>` : "");
    const ext = (href, t) => `<a class="ad-link" href="${esc(href)}" target="_blank" rel="noopener">${esc(t)}${icon("ext")}</a>`;
    const bad = runs.filter((r) => r.st !== "ok").length;
    const lead = !s ? "The data status could not be read." : needs.length
      ? adPl(needs.length, "thing needs", "things need") + " you. " + (bad ? adPl(bad, "data source is", "data sources are") + " late or failing." : "All data runs are green.")
      : "Nothing needs you. All data runs are green.";

    /* Users */
    let users = err(ad.err.over);
    if (o) {
      const days = o.daily || [], top = Math.max(1, ...days.map((d) => d.users));
      const people = o.people || [], shown = ad.all ? people : people.slice(0, 5);
      const bars = days.map((d) => {
        const h = d.users ? Math.max(6, Math.round((d.users / top) * 96)) : 2, dt = fromIso(d.day), wk = dt.getDay() === 1;
        return `<div class="ad-bar${d.users ? "" : " ad-bar--0"}"><span class="ad-bar__n">${d.users}</span><i style="height:${h}px"></i><span class="ad-bar__d${wk ? " ad-bar__d--mon" : ""}">${dt.getDate()}</span></div>`;
      }).join("");
      const label = days.map((d) => fmtD(fromIso(d.day), { day: "numeric", month: "short" }) + " " + d.users).join(", ");
      users += `
        <div class="ad-stats">
          <div class="ad-stat ad-stat--ep"><b>${o.accounts}</b><span>Accounts</span></div>
          <div class="ad-stat ad-stat--co"><b>${o.new7}</b><span>New in 7 days</span></div>
          <div class="ad-stat ad-stat--cal"><b>${o.active7}</b><span>Active in 7 days</span></div>
        </div>
        <section class="ad-card ad-chart" aria-labelledby="adActive">
          <h3 class="ad-h3" id="adActive">Active people per day</h3>
          <div class="ad-bars" role="img" aria-label="Active people, last 14 days: ${esc(label)}">${bars}</div>
          <p class="cap">${esc(fmtD(fromIso(days[0].day)) + " to " + fmtD(fromIso(days[days.length - 1].day)))}, live app only. Mondays in bold; preview sessions are left out.</p>
        </section>
        <section class="ad-card ad-people" aria-labelledby="adPeople">
          <div class="ad-row-h"><h3 class="ad-h3" id="adPeople">People</h3>${ext(AD_USERS, "Manage in Supabase")}</div>
          <ul class="ad-list">${shown.map((p) => {
            const nm = (p.name || "").trim(), meta = [nm ? p.email : "", p.org, "joined " + adDay(p.created), p.seen ? "seen " + adWhen(p.seen) : "not seen in the app"].filter(Boolean);
            return `<li><span class="ad-face" aria-hidden="true">${esc((nm || p.email || "?").trim().charAt(0).toUpperCase())}</span><span class="ad-li__tx"><b>${esc(nm || p.email || "No email")}${p.admin ? ` <span class="ad-tag">Admin</span>` : ""}</b><span>${esc(meta.join(" · "))}</span></span></li>`;
          }).join("")}</ul>
          ${people.length > 5 ? `<button class="eu-btn eu-btn--sm eu-btn--outline ad-more" type="button" data-adall aria-expanded="${ad.all}">${ad.all ? "Show fewer" : "Show all " + people.length}</button>` : ""}
        </section>`;
    }

    /* What people look for */
    let look = "";
    if (o) {
      const req = o.requests || [], emp = o.empty || [];
      look = `
        <section class="ad-card" aria-labelledby="adReq">
          <div class="ad-row-h"><h3 class="ad-h3" id="adReq">Files requested</h3><span class="cap">Request a full page</span></div>
          ${req.length ? `<ul class="ad-chips">${req.map((r) => `<li class="ad-chip">${esc(r.q)}${r.n > 1 ? ` <b>×${r.n}</b>` : ""}</li>`).join("")}</ul>` : `<p class="cap">No requests yet.</p>`}
        </section>
        <section class="ad-card" aria-labelledby="adEmpty">
          <div class="ad-row-h"><h3 class="ad-h3" id="adEmpty">Searches with no result</h3><span class="ad-num">${o.empty30} of ${o.searches30}</span></div>
          ${emp.length ? `<ul class="ad-list ad-list--q">${emp.map((r) => `<li><span>${esc(r.q)}</span><span class="cap">${r.n > 1 ? r.n + " times · " : ""}${adWhen(r.last)}</span></li>`).join("")}</ul>` : `<p class="cap">None in the last 30 days.</p>`}
          <p class="cap">Counts: live app, last 30 days. The list includes the preview.${o.feedback30 ? " " + adPl(o.feedback30, "feedback email") + " started in that time." : ""}</p>
        </section>`;
    }

    const big = s && s.sizes && (s.sizes.largest || [])[0];
    v.innerHTML = `<div class="ad-wrap">
      <header class="ad-head">
        <p class="ad-eyebrow"><span class="ad-badge">${icon("lock")}Admin</span><span class="cap">Only your account sees this</span></p>
        <h1 class="ad-title" tabindex="-1">How is nodo <strong>doing today?</strong></h1>
        <p class="ad-lead">${esc(lead)}</p>
        <p class="cap ad-stamp">${s ? "Status from " + adWhen(s.generated) : "No status"}${o ? " · users from " + adWhen(o.generated) : ""}
          <button class="linkbtn ad-refresh" type="button" data-adrefresh>${ad.busy ? "Refreshing…" : "Refresh"}</button></p>
      </header>
      ${err(ad.err.status)}

      <section aria-labelledby="adNeeds">
        <div class="ad-row-h"><h2 class="ad-h" id="adNeeds">Needs you</h2><span class="ad-num">${needs.length}</span></div>
        ${needs.length ? `<ul class="ad-needs">${needs.map((n) => `<li class="ad-need ad-need--${n.tone}"><span class="ad-need__disc" aria-hidden="true">${icon(n.ic)}</span>
          <span class="ad-need__tx"><b>${esc(n.t)}</b><span>${esc(n.s)}</span>${n.href ? ext(n.href, n.cta) : ""}</span></li>`).join("")}</ul>`
          : `<p class="ad-card ad-clear">${icon("check")}Nothing waits for you.</p>`}
      </section>

      <section aria-labelledby="adRuns">
        <div class="ad-row-h"><h2 class="ad-h" id="adRuns">Data runs</h2>${ext(AD_REPO + "/actions", "All runs")}</div>
        <ul class="ad-card ad-runs">${runs.map((r) => `<li>${r.href ? `<a href="${esc(r.href)}" target="_blank" rel="noopener">` : "<div>"}
          <span class="ad-li__tx"><b>${esc(r.n)}</b><span>${esc(r.sub)}</span></span>${pill(r.st)}${r.href ? "</a>" : "</div>"}</li>`).join("")}
          ${big ? `<li class="ad-size"><div class="ad-row-h"><b>Largest data file</b><span class="ad-num">${adMB(big.bytes)} of 100 MB</span></div>
            <span class="ad-meter" aria-hidden="true"><i style="width:${Math.min(100, (big.bytes / 104857600) * 100).toFixed(1)}%" class="${big.bytes > 52428800 ? "is-warn" : ""}"></i></span>
            <span class="cap">${esc(big.path)}. GitHub warns at 50 MB and refuses a file at 100 MB.</span></li>` : ""}
        </ul>
      </section>

      <section aria-labelledby="adUsers">
        <h2 class="ad-h" id="adUsers">Users</h2>
        ${users}
      </section>

      ${o ? `<section aria-labelledby="adLook"><h2 class="ad-h" id="adLook">What people look for</h2>${look}</section>` : ""}

      <p class="cap ad-foot">Read-only for now. Approve, edit and delete come in step 2.</p>
    </div>`;
  }

  document.addEventListener("click", (e) => {
    const t = e.target;
    if (t.closest("[data-adrefresh]")) { ad.at = 0; adLoad().then(() => { if (state.view === "admin") renderAdmin(); }); return renderAdmin(); }
    if (t.closest("[data-adall]")) { ad.all = !ad.all; renderAdmin(); }
  });

  /* ---------- 15. Who spoke in committee (since 22 Oct 2026) ----------
     v1/minutes.json comes from the Parliament committees' minutes (tools/minutes, run by the Mon and Thu refresh on the
     Mac): for each file, the meetings that dealt with it, the MEPs who spoke on it (whoever presided is left out) and
     the Commission officials who spoke or attended. Roles are decided here, against the file's own lists, so a
     rapporteur or shadow never shows twice.
     - Parliament tab: "Also spoke in committee", the MEPs with no role on the file, most active first, three shown and
       "Show N more"; each row says how often and when, plus the existing "Also on" line.
     - Commission tab: "Presented in committee", the officials the minutes name; the DG caption says when the minutes
       name the lead DG that was deduced from the portfolio.
     - Profiles: "Spoke in committee" under "On these files", the files an MEP spoke on without a role.
     - News and the file timeline: a People item when MEPs with no role speak on a file for the first time.
     When promoted, the Parliament and Commission blocks go into openFile, the DG caption into dgBlock, the profile list
     into fileLinks, and the news items into the update stream builder (scripts/build-updates.mjs). */
  let MIN = null;
  const mnOpen = new Set();
  const mnDay = (iso) => fmtIso(iso, { day: "numeric", month: "short" });
  const mnDays = (ds) => { const s = ds.slice().sort(); return s.length === 1 ? mnDay(s[0]) : s.length === 2 ? `${fromIso(s[0]).getDate()} and ${mnDay(s[1])}` : `latest ${mnDay(s[s.length - 1])}`; };
  const mnTimes = (n) => (n === 1 ? "Spoke" : n === 2 ? "Spoke twice" : `Spoke ${n} times`);
  /* "Spoke on 28 Sept" once, "Spoke twice · 2 and 28 Sept" more often. */
  const mnSpoke = (s) => (s.n === 1 && s.dates.length === 1 ? `Spoke on ${mnDay(s.dates[0])}` : `${mnTimes(s.n)} · ${mnDays(s.dates)}`);
  /* Everyone the file's lists name (and the people you added), as keys. */
  const mnOnList = (f) => { const m = membersOf(f); return new Set([...m.base, ...m.added].map((x) => x.key)); };
  function mnVoices(f) {
    const o = MIN && MIN.files && MIN.files[f.id]; if (!o) return [];
    const on = mnOnList(f);
    return (o.speakers || []).map((s) => ({ ...s, key: "ep:" + s.id })).filter((s) => BYKEY.has(s.key) && !on.has(s.key));
  }
  const mnThrough = (f) => { const o = MIN && MIN.files && MIN.files[f.id]; return o && o.meetings.length ? o.meetings.map((m) => m.date).sort().pop() : MIN && MIN.through; };
  function spokeBlock(f) {
    const v = mnVoices(f); if (!v.length) return "";
    const open = mnOpen.has(f.id), shown = open ? v : v.slice(0, 3), more = v.length - 3;
    const rowOf = (s) => { const o = BYKEY.get(s.key).o;
      return row({ attrs: tap(`data-open="${esc(s.key)}"`), lead: avaOf(s.key), name: esc(o.name), wrap: true,
        meta: esc(mnSpoke(s)),
        extra: `<span class="eu-row__tags">${gtag(o.group)}</span>${edAlsoHtml(s.key, new Set([f.id]))}`, tail: tailFor(s.key, o.name) }); };
    return `<section class="mn-spoke" aria-labelledby="mnH">
      <h3 id="mnH">Also spoke in committee <small>${v.length}</small></h3>
      <p class="mn-cap">MEPs with no role on this file who took the floor when the committee discussed it. Chairs aren't counted.</p>
      <div class="list">${shown.map(rowOf).join("")}</div>
      ${more > 0 ? `<button class="eu-btn eu-btn--outline eu-btn--block mt" type="button" data-mnmore="${esc(f.id)}" aria-expanded="${open}">${open ? "Show fewer" : `Show ${more} more`}</button>` : ""}
      <p class="mn-foot">From committee minutes, up to ${esc(mnDay(mnThrough(f)))}. Minutes come out a few weeks after each meeting. They name who spoke, not what they said.</p>
    </section>`;
  }
  /* Commission tab: the officials the minutes name for this file. */
  function offBlock(f) {
    const o = MIN && MIN.files && MIN.files[f.id], xs = (o && o.officials) || []; if (!xs.length) return "";
    const line = (e) => [e.spoke.length ? `Spoke on ${mnDays(e.spoke)}` : "", e.present.length ? `${e.spoke.length ? "present" : "Present"} on ${mnDays(e.present)}` : ""].filter(Boolean).join(" · ");
    return `<h3>Presented in committee <small>${xs.length}</small></h3>
      <p class="mn-cap">Commission officials the committee minutes name for this file. The minutes give the DG, not the job title.</p>
      <div class="list">${xs.map((e) => row({ cls: "is-static", lead: disc("user"), name: esc(e.name), wrap: true,
        meta: esc([e.dg ? "DG " + e.dg : e.role || "European Commission", line(e)].filter(Boolean).join(" · ")) })).join("")}</div>`;
  }
  /* The DG caption: a lead DG deduced from the portfolio and named in the minutes says so. */
  function mnDgCap(f) {
    const d = f.dg || {}, o = MIN && MIN.files && MIN.files[f.id]; if (d.basis === "source" || !o) return "";
    const hit = (o.officials || []).filter((e) => (d.lead || []).includes(e.dg)).flatMap((e) => [...e.spoke, ...e.present]).sort().pop();
    return hit ? `Named in committee minutes, ${mnDay(hit)}. Was deduced from the Commissioner's portfolio.` : "";
  }
  /* Profiles: the files an MEP spoke on without a role, under "On these files". */
  const mnFileLinks0 = fileLinks;
  fileLinks = (key) => {
    const base = mnFileLinks0(key);
    if (!MIN || !String(key).startsWith("ep:")) return base;
    const L = FILES.map((f) => { const s = mnVoices(f).find((x) => x.key === key); return s ? { f, s } : null; }).filter(Boolean);
    if (!L.length) return base;
    return base + `<h3>Spoke in committee <small>${L.length}</small></h3><p class="mn-cap">Files this MEP has no role on but spoke about in committee.</p>
      <div class="list">${L.map(({ f, s }) => row({ el: "button", attrs: `type="button" data-file="${esc(f.id)}"`, lead: disc("file"), name: esc(f.short), wrap: true,
        meta: esc(mnSpoke(s)), tail: go })).join("")}</div>`;
  };
  /* News and timeline: one People item per file and meeting where MEPs with no role spoke for the first time. */
  let mnMerged = false;
  function mnMerge() {
    if (mnMerged || !MIN || UPD.status !== "done") return;
    mnMerged = true;
    for (const f of FILES) {
      const by = new Map();
      for (const s of mnVoices(f)) { const d = s.dates.slice().sort()[0]; by.set(d, [...(by.get(d) || []), s]); }
      for (const [date, xs] of by) {
        const one = xs.length === 1 && BYKEY.get(xs[0].key);
        const e = { fileId: f.id, kind: "people", date, minutes: true, title: one ? `New voice in committee: ${one.o.name}` : `${xs.length} new voices in committee` };
        UPD.feed.push(e);
        (UPD.tl[f.id] = UPD.tl[f.id] || []).push(e);
      }
      if (UPD.tl[f.id]) UPD.tl[f.id].sort((a, b) => a.date.localeCompare(b.date));
    }
    if (typeof renderNews === "function") renderNews();
  }
  /* A People item from the minutes opens the file on its Parliament tab, where "Also spoke in committee" is. */
  const mnNewsRow0 = newsRow;
  newsRow = (e) => (e.minutes ? mnNewsRow0(e).replace('data-filetab="upd"', 'data-filetab="ep"') : mnNewsRow0(e));
  fetchJson(DATA_BASE + "minutes.json").then((j) => {
    MIN = j;
    const f = curFile(); if (f) openFile(f.id, true);
    if (state.view === "home" && !state.hq) edRender();
    const wait = setInterval(() => { if (UPD.status === "done" || UPD.status === "failed") { clearInterval(wait); mnMerge(); } }, 1000);
    setTimeout(() => clearInterval(wait), 60000);
  }).catch(() => { /* no minutes yet: every view works without them */ });
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-mnmore]"); if (!b) return;
    const id = b.getAttribute("data-mnmore");
    if (mnOpen.has(id)) mnOpen.delete(id); else mnOpen.add(id);
    openFile(id, true);
  });


  /* ---------- 12. Calendar: the files agenda, with the EP calendar beside it (since 26 Oct 2026) ---------- */
  /* Calendar opens on the agenda of the files: what happens next on the files you follow. One switch, Agenda or EP calendar.
     Agenda: this week and next week in full, one card per file per week (a meeting on consecutive days shows once, as a
     range); the four weeks after that as one line each (dates, the step count and the files),
     each opening in place; then one line per month. Since 30 Oct 2026 the agenda carries no EP-calendar context (no next
     plenary line, no week type, no plenary dates on month rows): that lives in the EP calendar tab, and a plenary shows
     here only as a dated step on a file. Upcoming items come first; Earlier and the no-followed-file note sit at the
     bottom. The files you follow by default; one link at the bottom adds the others.
     EP calendar: the previous calendar, simplified. A short hero (where MEPs are, the next plenary), then one list of
     months from now, the current and next month open, week rows with the day cells, the week type and a count of steps on
     your files that opens that week in the agenda. 2027 months show plenary dates only. Earlier months, the legend and the
     source sit at the bottom. Replaces the five-day strip, the plenary meter, the year folds and the Council lines.
     Next up left the Files view the same day: Calendar is where dated steps live. */
  const CL = { v: "agenda", all: false, open: new Set(), mOpen: null, earlier: false, jump: null, eOpen: false, file: null };
  const clFlag = (w) => (/indicative/i.test(w) ? "Indicative" : /reported by|agence europe/i.test(w) ? "Reported" : "");
  const clClean = (w) => String(w).replace(/\s*\([^)]*(?:indicative|reported|agence europe)[^)]*\)\s*$/i, "");
  const clInst = (w) => (/trilogue/i.test(w) ? ["tri", "Trilogue"] : /european council/i.test(w) ? ["co", "European Council"]
    : /cut-off|deadline|applies from|apply from/i.test(w) ? ["cal", "Deadline"] : [edInst(w), TD_INST[edInst(w)] || "Key date"]);
  function clScope() {
    const fol = followedFiles(), one = CL.file && FILE_BY[CL.file];
    if (one) return { files: [one], mine: false, nFol: fol.length, one, on: "on this file" };
    const mine = fol.length > 0 && !CL.all;
    return { files: mine ? fol : FILES, mine, nFol: fol.length, on: mine ? "on your files" : "on nodo's files" };
  }
  /* Earlier (since 26 Oct 2026): what happened, from the update stream, in place of the News view. The same items as
     Today's "Since you last looked" (milestones, procedure steps, people, and decision points with no published outcome),
     going back 120 days. Folded by default in one row at the bottom of the agenda (top until 30 Oct 2026); open, the two latest weeks with updates
     show in full (one card per file per week, outlined because they are done), older weeks fold into one line each. */
  const CL_INSTK = { Parliament: "ep", Council: "co", Commission: "ec" };
  function clPastCard(xs) {
    const f = xs[0].f;
    return `<button class="cl-card is-past" type="button" data-file="${esc(f.id)}"><span class="cl-tx"><span class="cl-f">${esc(edTag(f))}</span>${xs.map((x) => `<span class="cl-l">
        <span class="cl-w"><b>${esc(fmtD(fromIso(x.date), { weekday: "short", day: "numeric" }))}</b> · ${x.html}</span>
        ${x.pending ? `<span class="cl-pend">${icon("warn")}Outcome not published yet</span>` : ""}
        <span class="cl-m"><i class="cl-i cl-i--${CL_INSTK[x.inst] || "cal"}" aria-hidden="true"></i>${esc(clPastLbl(x))}${x.verified ? `<span class="cl-flag">Verified</span>` : ""}</span></span>`).join("")}</span></button>`;
  }
  /* A past item is labelled by its institution or its kind. "Key date" is for dated steps ahead (votes, Council positions,
     trilogues), never for something that already happened (29 Oct 2026). */
  const CL_KIND = { people: "People", milestone: "Milestone", procedural: "Procedure" };
  const clPastLbl = (x) => (x.src === "committee minutes" ? "Committee minutes" : x.inst || CL_KIND[x.kind] || "Update");
  const clByFile = (xs) => { const m = new Map(); xs.forEach((x) => { if (!m.has(x.f.id)) m.set(x.f.id, []); m.get(x.f.id).push(x); }); return [...m.values()]; };
  function clEarlier(sc) {
    const t = new Date(), mon = mondayOf(t), lastMon = addD(mon, -7), open = CL.eOpen;
    const ready = UPD.status === "done", items = ready ? tdSinceItems(sc.files, addD(t, -120)) : [];
    const recent = items.filter((x) => x.date >= isoD(lastMon)).length;
    const sub = !ready ? (UPD.status === "failed" ? "The updates could not load. Check your connection." : "Loading what happened…")
      : recent ? `${recent} ${pl(recent, "update", "updates")} ${sc.on} since ${fmtD(lastMon, { weekday: "short", day: "numeric", month: "short" })}`
      : items.length ? `Nothing new ${sc.on} in the last two weeks` : `Nothing recorded ${sc.on} yet`;
    let h = `<button class="cl-erow" type="button" data-clearl aria-expanded="${open && ready}"${ready && items.length ? "" : " disabled"}>
        <span class="cl-erow__ic" aria-hidden="true"><svg class="eu-icon" viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v4h4"/><path d="M12 8v4l3 2"/></svg></span>
        <span class="cl-erow__tx"><b>Earlier</b><small>${esc(sub)}</small></span>
        ${recent && !open ? `<span class="cl-cnt"><i class="cl-fol" aria-hidden="true"></i>${recent}</span>` : ""}
        ${ready && items.length ? `<span class="cl-go" aria-hidden="true">${icon("down")}</span>` : ""}</button>`;
    if (!open || !ready || !items.length) return h;
    const weeks = new Map();
    items.forEach((x) => { const k = isoD(mondayOf(fromIso(x.date))); if (!weeks.has(k)) weeks.set(k, []); weeks.get(k).push(x); });
    const keys = [...weeks.keys()].sort().reverse();
    const label = (k) => { const m = fromIso(k), r = rangeTxt(m, addD(m, 6)); return k === isoD(mon) ? `This week so far · ${r}` : k === isoD(lastMon) ? `Last week · ${r}` : r; };
    h += `<div class="cl-ear">${keys.map((k, i) => {
      const xs = weeks.get(k), gs = clByFile(xs);
      if (i < 2) return `<section class="cl-wk"><h2 class="cl-h cl-h--past">${esc(label(k))}</h2>${gs.map(clPastCard).join("")}</section>`;
      const key = "e:" + k, on = CL.open.has(key), names = gs.map((g) => edTag(g[0].f));
      return `<div class="cl-rw"><button class="cl-row" type="button" data-clrow="${key}" aria-expanded="${on}">
          <span class="cl-row__tx"><span class="cl-row__t"><b>${esc(label(k))}</b><small>${xs.length} ${pl(xs.length, "update", "updates")}</small></span>
          <span class="cl-row__f">${esc(names.join(" · "))}</span></span><span class="cl-go" aria-hidden="true">${icon("down")}</span></button>
        ${on ? `<div class="cl-sub">${gs.map(clPastCard).join("")}</div>` : ""}</div>`;
    }).join("")}</div>`;
    return h;
  }
  /* Dated steps between two ISO dates as one group per file (or set of files), consecutive days of one step merged. */
  function clGroups(files, from, to) {
    const groups = [];
    edSteps(files, from, to).forEach((s) => {
      const key = s.files.map((f) => f.id).join("+");
      let g = groups.find((x) => x.key === key);
      if (!g) groups.push((g = { key, files: s.files, lines: [] }));
      const what = clClean(s.what), prev = g.lines[g.lines.length - 1];
      if (prev && edFold(prev.what) === edFold(what) && isoD(addD(fromIso(prev.end), 1)) === s.date) { prev.end = s.date; return; }
      g.lines.push({ date: s.date, end: s.date, what, flag: clFlag(s.what), inst: clInst(s.what), files: s.files });
    });
    return groups;
  }
  const clN = (gs) => gs.reduce((n, g) => n + g.lines.length, 0);
  const clSteps = (n) => `${n} ${pl(n, "step", "steps")}`;
  function clCard(g) {
    const a = g.lines[0].date, b = g.lines.reduce((m, l) => (l.end > m ? l.end : m), a), da = fromIso(a), db = fromIso(b), one = a === b;
    const dow = one ? fmtD(da, { weekday: "short" }) : `${fmtD(da, { weekday: "short" })}–${fmtD(db, { weekday: "short" })}`;
    const num = one ? String(da.getDate()) : `${da.getDate()}–${db.getDate()}`, multi = g.lines.length > 1;
    const line = (l) => {
      const when = multi ? `<b>${esc(fmtD(fromIso(l.date), { weekday: "short", day: "numeric" }))}${l.end !== l.date ? "–" + fromIso(l.end).getDate() : ""}</b> · ` : "";
      return `<span class="cl-l"><span class="cl-w">${when}${esc(edWhat({ what: l.what, files: l.files }))}</span>
        <span class="cl-m"><i class="cl-i cl-i--${l.inst[0]}" aria-hidden="true"></i>${esc(l.inst[1])}${l.flag ? `<span class="cl-flag">${l.flag}</span>` : ""}</span></span>`;
    };
    const fol = CL.all && g.files.some((f) => state.follow.has(f.id));
    return `<button class="cl-card" type="button" data-file="${esc(g.files[0].id)}" data-filetab="next">
      <span class="cl-d${a === todayIso() ? " is-today" : ""}"><span>${esc(dow)}</span><b${num.length > 3 ? ' class="is-long"' : ""}>${esc(num)}</b><span>${esc(fmtD(db, { month: "short" }))}</span></span>
      <span class="cl-tx"><span class="cl-f">${esc(g.files.map(edTag).join(" · "))}${fol ? `<i class="cl-fol" role="img" aria-label="Following"></i>` : ""}</span>${g.lines.map(line).join("")}</span></button>`;
  }
  function clBand(mon) {
    const wk = weekOf(mon), a = isoD(mon), b = isoD(addD(mon, 6));
    const s = CAL.sessions.find((x) => x.start <= b && x.end >= a);
    const sub = wk.kind === "P" && s ? `Sitting ${rangeTxt(fromIso(s.start), fromIso(s.end))}` : wk.kind === "C" || wk.kind === "G" ? "MEPs in Brussels" : wk.kind === "X" ? "MEPs away from Brussels" : "";
    return { k: wk.kind === "?" ? "_" : wk.kind, text: wk.label + (sub ? " · " + sub : "") };
  }
  const clDays = (iso) => Math.round((fromIso(iso) - fromIso(todayIso())) / 864e5);
  /* The file's own next plenary step, if it has one. A plenary matters to a file only when the file is on its agenda. */
  function clFilePlenary(f) {
    const t = todayIso(), xs = (f.next || []).filter((x) => x.date && x.date >= t && /plenary/i.test(x.what)).sort((a, b) => a.date.localeCompare(b.date));
    if (!xs.length) return "";
    const s = xs[0], same = xs.filter((x) => x.date === s.date), n = clDays(s.date), flag = clFlag(s.what);
    const d = fmtD(fromIso(s.date), { weekday: "short", day: "numeric", month: "short" }), when = n === 0 ? "today" : n === 1 ? "tomorrow" : `in ${n} days`;
    const what = same.length > 1 ? `${same.length} plenary votes` : clClean(s.what);
    return `<p class="cl-npb"><i class="k-P" aria-hidden="true"></i>${esc(`${what}, ${d}${flag ? ` (${flag.toLowerCase()})` : ""} · ${when}`)}</p>`;
  }
  const clUndated = (f) => (f.next || []).filter((x) => !x.date).map((x) => clClean(String(x.what).replace(/:\s*no (?:date|dates) set(?: yet)?\.?$/i, "")));
  /* One file: the weeks with steps in full; runs of empty weeks fold into one line; steps with no date close the list. */
  function clAgendaOne(sc) {
    const f = sc.one, t = todayIso(), mon0 = edMonday(), ahead = edAhead(), names = ahead ? ["Next week", "The week after"] : ["This week", "Next week"];
    const segs = [];
    for (let i = 0; i < 6; i++) {
      const m = addD(mon0, 7 * i), from = i === 0 && t > isoD(m) ? t : isoD(m), to = isoD(addD(m, 6));
      segs.push({ a: fromIso(from), b: fromIso(to), title: (i < 2 ? names[i] + " · " : "") + rangeTxt(m, addD(m, 6)), gs: clGroups(sc.files, from, to) });
    }
    const mFrom = isoD(addD(mon0, 42)), byM = new Set();
    clGroups(sc.files, mFrom, "9999-12-31").forEach((g) => g.lines.forEach((l) => byM.add(l.date.slice(0, 7))));
    [...byM].sort().forEach((k) => {
      const y = +k.slice(0, 4), mi = +k.slice(5, 7) - 1, last = isoD(new Date(y, mi + 1, 0)), from = k + "-01" > mFrom ? k + "-01" : mFrom;
      segs.push({ a: fromIso(from), b: fromIso(last), title: MONTHS[mi] + (y !== new Date().getFullYear() ? " " + y : ""), month: true, gs: clGroups(sc.files, from, last) });
    });
    const any = segs.some((x) => x.gs.length);
    let h = "", run = null;
    const flush = (trailing) => {
      if (!run) return;
      h += trailing ? `<p class="cl-none">${any ? "Nothing else dated on this file." : "Nothing dated on this file."}</p>`
        : `<p class="cl-gap">Nothing dated · ${esc(rangeTxt(run.a, run.b))}</p>`;
      run = null;
    };
    segs.forEach((x) => {
      if (!x.gs.length) { run = run ? { a: run.a, b: x.b } : { a: x.a, b: x.b }; return; }
      flush(false);
      h += `<section class="cl-wk"><h2 class="cl-h">${esc(x.title)}</h2>${x.gs.map(clCard).join("")}</section>`;
    });
    flush(true);
    const und = clUndated(f);
    if (und.length) h += `<div class="cl-und"><b>Not dated yet</b>${und.map((w) => `<span>${esc(w)}</span>`).join("")}</div>`;
    return h;
  }
  function clAgenda() {
    const sc = clScope(), t = todayIso(), mon0 = edMonday(), ahead = edAhead(), names = ahead ? ["Next week", "The week after"] : ["This week", "Next week"];
    const wr = (m) => rangeTxt(m, addD(m, 6));
    const hiddenTxt = (all, mine) => (sc.mine && all > mine ? ` ${all - mine} on other files.` : "");
    let h = sc.one ? `<div class="cl-only"><span>Showing only</span><button class="cl-chip" type="button" data-clfile="" aria-label="Show all your files again">${esc(edTag(sc.one))}<span aria-hidden="true">×</span></button></div>`
      : "";
    if (sc.one) return h + clFilePlenary(sc.one) + clAgendaOne(sc) + `<div class="cl-past">${clEarlier(sc)}</div>` + clFoot();
    [0, 1].forEach((i) => {
      const m = addD(mon0, 7 * i), from = i === 0 && t > isoD(m) ? t : isoD(m), to = isoD(addD(m, 6));
      const gs = clGroups(sc.files, from, to);
      h += `<section class="cl-wk" id="cl-${isoD(m)}"><h2 class="cl-h">${esc(names[i])} · ${esc(wr(m))}</h2>
        ${gs.length ? gs.map(clCard).join("") : `<p class="cl-none">Nothing dated ${esc(sc.on)}.${sc.one ? "" : hiddenTxt(clN(clGroups(FILES, from, to)), 0)}</p>`}</section>`;
    });
    const rows = [];
    for (let i = 2; i < 6; i++) {
      const m = addD(mon0, 7 * i), from = isoD(m), to = isoD(addD(m, 6)), band = clBand(m);
      rows.push({ key: from, title: wr(m), band, gs: clGroups(sc.files, from, to), other: clGroups(FILES, from, to) });
    }
    const mFrom = isoD(addD(mon0, 42)), byM = new Map();
    clGroups(sc.files, mFrom, "9999-12-31").forEach((g) => g.lines.forEach((l) => {
      const k = l.date.slice(0, 7); if (!byM.has(k)) byM.set(k, []); byM.get(k).push(l);
    }));
    [...byM.keys()].sort().forEach((k) => {
      const y = +k.slice(0, 4), mi = +k.slice(5, 7) - 1, last = isoD(new Date(y, mi + 1, 0));
      const from = k + "-01" > mFrom ? k + "-01" : mFrom, sum = monthSummary(y, mi);
      rows.push({ key: "m:" + k, month: true, title: MONTHS[mi] + (y !== new Date().getFullYear() ? " " + y : ""),
        band: { k: sum ? "P" : "_", text: sum ? "Plenary · " + sum : "No plenary" }, gs: clGroups(sc.files, from, last), other: [] });
    });
    h += `<h2 class="cl-h cl-h--later">Later</h2><div class="cl-rows">${rows.map((r) => {
      const n = clN(r.gs), on = CL.open.has(r.key) && n > 0, files = [...new Set(r.gs.map((g) => g.files.map(edTag).join(" · ")))];
      const other = n ? "" : !sc.one && clN(r.other) ? `${clSteps(clN(r.other))} on other files` : `Nothing dated ${sc.on}`;
      return `<div class="cl-rw" id="cl-${esc(r.key.replace(":", "-"))}"><button class="cl-row${r.month ? " cl-row--m" : ""}" type="button" data-clrow="${esc(r.key)}" aria-expanded="${on}"${n ? "" : " disabled"}>
          <span class="cl-row__tx"><span class="cl-row__t"><b>${esc(r.title)}</b><small>${n ? clSteps(n) : ""}</small></span>
          <span class="cl-row__f">${esc(n ? files.join(" · ") : other)}</span></span>
          ${n ? `<span class="cl-go" aria-hidden="true">${icon("down")}</span>` : ""}</button>
        ${on ? `<div class="cl-sub">${r.gs.map(clCard).join("")}</div>` : ""}</div>`;
    }).join("")}</div>`;
    if (sc.nFol && !sc.one) h += `<button class="cl-more" type="button" data-clall>${CL.all ? "Only the files you follow" : `Include the ${FILES.length - sc.nFol} ${pl(FILES.length - sc.nFol, "file", "files")} you don't follow`}</button>`;
    h += `<div class="cl-past">${clEarlier(sc)}</div>`;
    if (!sc.nFol && !sc.one) h += `<p class="cap cl-lead cl-lead--end">You follow no file yet, so this shows all of nodo's ${FILES.length} files. <button class="linkbtn" type="button" data-nxpick>Choose your files</button></p>`;
    return h + clFoot();
  }
  function clFoot() {
    return `<p class="foot">One card per file per week. A date appears only when an official source ties it to the file. Indicative marks a forecast date in the Legislative Observatory, Reported a date taken from press reporting.${dataCheckedTxt() ? " " + esc(dataCheckedTxt()) : ""}</p>`;
  }
  function clEp() {
    const today = new Date(), tIso = isoD(today), mon = mondayOf(today), wk = weekOf(mon), np = plenaryLine(nextPlenary(today), today), sc = clScope();
    const npTxt = np.n === "Now" ? `${np.t}: ${np.s}` : np.n === "–" ? np.t : `${np.t}, ${np.s}, in ${np.n} ${np.u}`;
    const cy = today.getFullYear(), cm = today.getMonth();
    if (!CL.mOpen) CL.mOpen = new Set([`${cy}-${cm}`, `${cm === 11 ? cy + 1 : cy}-${(cm + 1) % 12}`]);
    const lastY = Math.max(...CAL.sessions.map((s) => +s.start.slice(0, 4)));
    const months = [];
    for (let y = cy; y <= lastY; y++) for (let m = 0; m < 12; m++) {
      if (y === cy && m < cm && !CL.earlier) continue;
      months.push({ y, m });
    }
    let divided = false;
    const rows = months.map(({ y, m }) => {
      const key = `${y}-${m}`, days = !!CAL.days[y], sum = monthSummary(y, m), now = y === cy && m === cm, past = y === cy && m < cm;
      let div = "";
      if (!days && !divided) { divided = true; div = `<p class="cl-div">${y} · plenary dates only from here</p>`; }
      const first = new Date(y, m, 1), last = new Date(y, m + 1, 0), weeks = [];
      if (days) for (let w = mondayOf(first); w <= last; w = addD(w, 7)) {
        if (addD(w, 3).getMonth() !== m) continue;
        if (now && w < mon && !CL.earlier) continue;
        weeks.push(w);
      }
      const nOf = (w) => { const a = isoD(w), b = isoD(addD(w, 6)); return clN(clGroups(sc.files, a < tIso && b >= tIso ? tIso : a, b)); };
      const total = weeks.reduce((n, w) => n + (isoD(addD(w, 6)) >= tIso ? nOf(w) : 0), 0), open = days && CL.mOpen.has(key);
      const head = `<span class="cl-mf__tx"><b>${esc(MONTHS[m])}${y !== cy ? " " + y : ""}</b><small><i class="cl-pd${sum ? "" : " is-none"}" aria-hidden="true"></i>${esc(now && !sum ? "This month" : sum || "No plenary")}</small></span>
        ${total && !open ? `<span class="cl-cnt"><i class="cl-fol" aria-hidden="true"></i>${total}<span class="cl-sr"> steps on your files</span></span>` : ""}`;
      return `${div}<div class="cl-mo">${days ? `<button class="cl-mf${past ? " is-past" : ""}" type="button" data-clmonth="${key}" aria-expanded="${open}">${head}<span class="cl-go" aria-hidden="true">${icon("down")}</span></button>`
          : `<div class="cl-mf cl-mf--flat">${head}</div>`}
        ${open ? `<div class="cl-wks">${weeks.map((w) => {
          const a = isoD(w), x = weekOf(w), n = isoD(addD(w, 6)) >= tIso ? nOf(w) : 0, cur = a === isoD(mon), isPast = isoD(addD(w, 6)) < tIso;
          return `<button class="cl-wr${cur ? " is-cur" : ""}${isPast ? " is-past" : ""}" type="button" data-clweek="${a}"${isPast ? " disabled" : ""}>
            <span class="cl-wr__d">${esc(rangeTxt(w, addD(w, 6)))}</span><span class="cells">${x.days.map((d) => cellHtml(d, today)).join("")}</span>
            <span class="cl-wr__l">${esc(x.label)}</span><span class="cl-cnt">${n ? `<i class="cl-fol" aria-hidden="true"></i>${n}<span class="cl-sr"> steps on your files</span>` : ""}</span></button>`;
        }).join("")}</div>` : ""}</div>`;
    }).join("");
    return `<section class="eu-hero cl-hero"><div class="eu-hero__eyebrow">This week · ${esc(fmtD(mon))} – ${esc(fmtD(addD(mon, 6)))}</div>
        <h2 class="eu-hero__title">${heroTitle(wk)}</h2><p class="eu-hero__text cl-np"><i class="k-P" aria-hidden="true"></i>${esc(npTxt)}</p></section>
      <div class="cl-mos">${rows}</div>
      <button class="cl-more" type="button" data-clearlier>${CL.earlier ? `Hide earlier months` : `Earlier in ${cy}`}</button>
      <div class="legend">${["P", "C", "G", "X"].map((k) => `<span><i class="k-${k}"></i>${esc(k === "P" ? "Plenary" : k === "G" ? "Political groups" : k === "X" ? "External activities" : KLABEL[k])}</span>`).join("")}
        <span><i class="cl-fol" aria-hidden="true"></i>Steps on ${sc.mine ? "your" : "nodo's"} files</span><span>Each day: top half morning, bottom half afternoon</span></div>
      <p class="note">Source: European Parliament calendar ${cy} and plenary dates for ${lastY}. Committee and group weeks are shown where the Parliament has published them. Checked ${esc(fmtD(fromIso(CAL.checked || CAL.fetched), { day: "numeric", month: "short", year: "numeric" }))}.</p>`;
  }
  renderCal = function () {
    const v = $("vCal"); if (!v) return;
    const tab = (k, label) => `<button class="fl-tab" type="button" role="tab" id="clTab-${k}" aria-controls="clPanel" aria-selected="${CL.v === k}" tabindex="${CL.v === k ? 0 : -1}" data-clv="${k}">${label}</button>`;
    v.innerHTML = `<h1 class="eu-headline">The weeks <strong>ahead</strong></h1>
      <div class="fl-tabs cl-tabs" role="tablist" aria-label="Calendar views">${tab("agenda", "Agenda")}${tab("ep", "EP calendar")}</div>
      <div id="clPanel" role="tabpanel" aria-labelledby="clTab-${CL.v}" class="fl-panel">${CL.v === "ep" ? clEp() : clAgenda()}</div>`;
    if (CL.jump) {
      const el = document.getElementById("cl-" + CL.jump); CL.jump = null;
      if (el) requestAnimationFrame(() => el.scrollIntoView({ block: "start" }));
    }
  };
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-clv],[data-clrow],[data-clmonth],[data-clweek],[data-clall],[data-clearlier],[data-clearl],[data-clfile]"); if (!b || !b.closest("#vCal")) return;
    let refocus = null;
    if (b.dataset.clv) { CL.v = b.dataset.clv; refocus = `[data-clv="${CL.v}"]`; window.scrollTo(0, 0); Track.log("view", { section: "cal-" + CL.v }); }
    else if (b.dataset.clrow) { const k = b.dataset.clrow; if (CL.open.has(k)) CL.open.delete(k); else CL.open.add(k); refocus = `[data-clrow="${k}"]`; }
    else if (b.dataset.clmonth) { const k = b.dataset.clmonth; if (CL.mOpen.has(k)) CL.mOpen.delete(k); else CL.mOpen.add(k); refocus = `[data-clmonth="${k}"]`; }
    else if (b.dataset.clweek) {
      const mon = fromIso(b.dataset.clweek), i = Math.round((mon - edMonday()) / (7 * 864e5)), k = b.dataset.clweek;
      CL.v = "agenda";
      if (i <= 1) CL.jump = k;
      else if (i <= 5) { CL.open.add(k); CL.jump = k; }
      else { const mk = "m:" + isoD(addD(mon, 3)).slice(0, 7); CL.open.add(mk); CL.jump = mk.replace(":", "-"); }
      Track.log("view", { section: "cal-agenda-week" });
    }
    else if (b.hasAttribute("data-clall")) { CL.all = !CL.all; refocus = "[data-clall]"; }
    else if (b.hasAttribute("data-clearlier")) { CL.earlier = !CL.earlier; refocus = "[data-clearlier]"; }
    else if (b.hasAttribute("data-clearl")) { CL.eOpen = !CL.eOpen; refocus = "[data-clearl]"; Track.log("view", { section: "cal-earlier" }); }
    else if (b.hasAttribute("data-clfile")) { CL.file = b.dataset.clfile || null; CL.eOpen = !!CL.file; window.scrollTo(0, 0); refocus = CL.file ? null : "[data-clearl]"; }
    renderCal();
    if (refocus) { const n = document.querySelector("#vCal " + refocus); if (n) n.focus({ preventScroll: true }); }
  });
  document.addEventListener("keydown", (e) => {
    const t = e.target.closest && e.target.closest("#vCal .fl-tab"); if (!t || (e.key !== "ArrowRight" && e.key !== "ArrowLeft")) return;
    e.preventDefault(); document.querySelector(`#vCal .fl-tab[data-clv="${t.dataset.clv === "agenda" ? "ep" : "agenda"}"]`).click();
  });

  /* Ways into Calendar from elsewhere (26 Oct 2026). News is Earlier now: any button that opened the News view opens the
     agenda with Earlier unfolded; Today's "in Calendar, Earlier" link does the same; a file page's "Dates and updates on
     this file" opens the agenda showing only that file, Earlier unfolded. */
  function clGo(file) {
    CL.v = "agenda"; CL.eOpen = true; CL.file = file || null;
    setView("cal");
  }
  document.addEventListener("click", (e) => {
    const n = e.target.closest('[data-view="news"],[data-clopen],[data-clgo]'); if (!n) return;
    e.preventDefault(); e.stopImmediatePropagation();
    clGo(n.dataset.clgo || null);
    Track.log("view", { section: n.dataset.clgo ? "cal-file" : "cal-earlier" });
  }, true);

  /* A file's page (26 Oct 2026): where it stands and who is on it. Next steps and Timeline give way to one row that opens
     Calendar on this file (dates ahead and Earlier); the hero shows the stage track and the one-line state; the full
     status, caveats and sources fold into "About this file" at the bottom. Links that asked for the old tabs open Parliament. */
  const fpOpen0 = openFile;
  openFile = function (id, keep, startTab) {
    if (startTab === "next" || startTab === "upd") startTab = "ep";
    if (keep && (state.ftab === "next" || state.ftab === "upd")) state.ftab = "ep";
    fpOpen0(id, keep, startTab);
    const f = FILE_BY[id], p = $("profile"); if (!f || !p || state.open !== "file:" + id) return;
    const bio = p.querySelector(".hero .bio");
    if (bio) bio.outerHTML = `<div class="fp-track">${edTrack(f)}</div>${f.lede || f.status ? `<p class="bio">${esc(flStatus(f))}</p>` : ""}`;
    const chk = p.querySelector(".hero .cap"); if (chk && /^Status checked/.test(chk.textContent)) chk.remove();
    const stats = p.querySelector(".stats");
    const ahead = (f.next || []).filter((x) => x.date && x.date >= todayIso()).sort((a, b) => a.date.localeCompare(b.date)), nx1 = ahead[0], nDates = ahead.length, nPast = UPD.status === "done" ? tdSinceItems([f], addD(new Date(), -120)).length : 0;
    if (stats && !p.querySelector(".fp-cal")) stats.insertAdjacentHTML("afterend", `<button class="fp-cal" type="button" data-clgo="${esc(f.id)}">
        <span class="fp-cal__ic" aria-hidden="true">${icon("cal")}</span>
        <span class="fp-cal__tx"><b>Dates and updates on this file</b><small>${esc([nx1 ? `Next: ${fmtIso(nx1.date, { day: "numeric", month: "short" })}, ${String(nx1.what || "").replace(/\s*\(indicative date\)$/i, " (indicative)")}` + (nDates > 1 ? ` · ${nDates - 1} more` : "") : "No date ahead yet", nPast ? `${nPast} earlier ${pl(nPast, "update", "updates")}` : ""].filter(Boolean).join(" · "))}</small></span>
        <span class="fp-cal__go" aria-hidden="true">${icon("arrow")}</span></button>`);
    const foot = p.querySelector(".foot");
    const cav = (f.caveats || []).map((x) => (typeof x === "string" ? x : x.text || x.note || "")).filter(Boolean);
    /* Sources show only as the footnote, in plain words (28 Oct 2026): no list of source links. */
    if (foot && !p.querySelector(".fp-about")) foot.insertAdjacentHTML("beforebegin", `<details class="fp-about"><summary><span><b>About this file</b><small>Full status${cav.length ? " and what to check" : ""}</small></span>${icon("down")}</summary>
        <p>${esc(f.status || "")}</p>${f.checked ? `<p class="cap">Status checked ${fdDate(f.checked, true)}</p>` : ""}
        ${cav.length ? `<h3>Check before you rely on it</h3>${cav.map((x) => `<div class="block"><p>${esc(x)}</p></div>`).join("")}` : ""}</details>`);
    if (foot) foot.textContent = "Sources: the Parliament's open data and Legislative Observatory, the Commission's and the Council's own pages, and press reporting. Names marked Verified come from the Parliament's records.";
  };
  /* Links that pointed at the old Next steps tab ("N sources" under the title) open "About this file" instead. */
  document.addEventListener("click", (e) => {
    const b = e.target.closest('#profile [data-ftab="next"], #profile [data-ftab="upd"]'); if (!b) return;
    const d = $("profile").querySelector(".fp-about"); if (!d) return;
    e.preventDefault(); e.stopImmediatePropagation();
    d.open = true; d.scrollIntoView({ block: "start", behavior: "smooth" }); d.querySelector("summary").focus({ preventScroll: true });
  }, true);

  /* ---------- Latest developments (since 28 Oct 2026; was "In the press") ----------
     v1/press.json holds dated items on nodo's files: institutional pages and press reporting, each with nodo's own
     one- or two-sentence takeaway (never a quote) and a link to the source. Items are picked by the press scan (feeds
     every morning on GitHub, web search on Mondays and Thursdays) and published only after review (branch review/press).
     A file page shows the items of the last windowDays days under "Dates and updates on this file": three, then
     "Show N more". Each item names the institution or "Press", the outlet, the date, "subscribers" for a paywalled source,
     and the MEPs it names as chips that open their profiles. No push notification yet: items marked stage (a change of a
     file's stage) are the ones meant to notify once nodo sends pushes. When promoted, the block goes into openFile. */
  let PRESS = null;
  const prOpen = new Set();
  const prIso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const PR_INST = { ep: "Parliament", council: "Council", commission: "Commission", advisory: "Advisory body", press: "Press" };
  function prItems(f) {
    const xs = (PRESS && PRESS.files && PRESS.files[f.id]) || [];
    const from = prIso(addD(new Date(), -(PRESS.windowDays || 30)));
    return xs.filter((x) => x.date >= from).sort((a, b) => b.date.localeCompare(a.date));
  }
  function pressBlock(f) {
    const xs = prItems(f); if (!xs.length) return "";
    const max = PRESS.maxPerFile || 3, open = prOpen.has(f.id), shown = open ? xs : xs.slice(0, max), more = xs.length - max;
    const fresh = prIso(addD(new Date(), -3));
    const item = (x) => {
      const ppl = (x.people || []).filter((k) => BYKEY.has(k));
      return `<li class="pr-item">
        <a class="pr-link" href="${esc(x.url)}" target="_blank" rel="noopener" data-prid="${esc(x.id)}">
          <span class="pr-meta"><span class="pr-dot pr-dot--${esc(x.inst)}" aria-hidden="true"></span>${esc(PR_INST[x.inst] || "Press")}${x.date >= fresh ? `<span class="pr-new">New</span>` : ""}</span>
          <span class="pr-text">${esc(x.text)}</span>
          <span class="pr-src">${esc([x.source, fmtIso(x.date), x.paywall ? "subscribers" : ""].filter(Boolean).join(" · "))}<span class="sr"> (opens the source)</span></span>
        </a>
        ${ppl.length ? `<span class="pr-people">${ppl.map((k) => { const o = BYKEY.get(k).o; return `<button type="button" class="pr-person" data-open="${esc(k)}">${avaOf(k, "pr-ava")}<span>${esc(o.name)} · ${esc(o.group || "")}</span></button>`; }).join("")}</span>` : ""}
      </li>`;
    };
    return `<section class="pr-press" aria-labelledby="prH">
      <div class="pr-head"><h3 id="prH">Latest developments</h3><small>Last ${PRESS.windowDays || 30} days</small></div>
      <ul class="pr-list">${shown.map(item).join("")}</ul>
      ${more > 0 ? `<button class="eu-btn eu-btn--outline eu-btn--block mt" type="button" data-prmore="${esc(f.id)}" aria-expanded="${open}">${open ? "Show fewer" : `Show ${more} more`}</button>` : ""}
      <p class="pr-foot">Picked by nodo's scan on Mondays and Thursdays. The summaries are nodo's own words; tap one to read the source.</p>
    </section>`;
  }
  const prOpen0 = openFile;
  openFile = function (id, keep, startTab) {
    prOpen0(id, keep, startTab);
    const f = FILE_BY[id], p = $("profile"); if (!f || !p || state.open !== "file:" + id || !PRESS) return;
    const old = p.querySelector(".pr-press"); if (old) old.remove();
    const html = pressBlock(f); if (!html) return;
    const at = p.querySelector(".fp-cal") || p.querySelector(".stats");
    if (at) at.insertAdjacentHTML("afterend", html);
  };
  document.addEventListener("click", (e) => {
    const m = e.target.closest("[data-prmore]");
    if (m) { const id = m.dataset.prmore; prOpen.has(id) ? prOpen.delete(id) : prOpen.add(id); const f = curFile(); if (f) openFile(f.id, true); return; }
    const a = e.target.closest("[data-prid]");
    if (a) { const f = curFile(); Track.log("press_open", { section: f ? f.id : null, item: a.dataset.prid }); }
  });
  fetchJson(DATA_BASE + "press.json").then((j) => {
    PRESS = j;
    const f = curFile(); if (f) openFile(f.id, true);
  }).catch(() => { /* no press file yet: file pages work without it */ });

  /* ---------- 16. Why they're here (since 29 Oct 2026) ----------
     MEPs with no role on a file (role relevant in v1/files.json) are there because of a related text. "Active on the
     topic" never said which. Each one now names the text (rel, an id in the file's related list) and their role in it
     (relRole: rapporteur, shadow or chair). The Parliament tab groups them under each text: what it is, when, nodo's
     one sentence on why it matters for this file (whyBy nodo) and a link to the source. The row says the person's
     role in that text. scripts/validate-data.mjs refuses a relevant MEP without a text, and checks the role against
     reports.json when the text is a Parliament document. When promoted, relBlock replaces the relevant section in
     openFile and the two labels below replace "Active on the topic" in ROLE_ONE and ROLE_MANY. */
  ROLE_ONE.relevant = "Worked on a related text";
  ROLE_MANY.relevant = "Worked on related texts";
  const RL_KIND = { resolution: "Parliament resolution", report: "Parliament report", opinion: "Committee opinion", committee: "Committee" };
  const rlRole = (m, r) => (m.relRole === "chair" ? "Chair" : (r && r.kind === "opinion" ? "Opinion " : "") + (m.relRole === "rapporteur" ? (r && r.kind === "opinion" ? "rapporteur" : "Rapporteur") : m.relRole === "shadow" ? (r && r.kind === "opinion" ? "shadow" : "Shadow") : ""));
  const RL_ORDER = { rapporteur: 0, chair: 1, shadow: 2 };
  function relBlock(f, xs) {
    if (!xs.length) return "";
    const raw = (x) => (f.meps || []).find((m) => "ep:" + m.id === x.key && m.role === "relevant") || {};
    const groups = (f.related || []).map((r) => ({ r, xs: [] })), other = { r: null, xs: [] };
    xs.forEach((x) => { const m = raw(x), g = groups.find((y) => y.r.id === m.rel) || other; g.xs.push({ x, m }); });
    const hasRole = (f.meps || []).some((m) => m.role !== "relevant");
    const nm = (a) => BYKEY.get(a.x.key).o.name;
    const rowOf = ({ x, m }, r) => { const o = BYKEY.get(x.key).o;
      return row({ attrs: tap(`data-open="${esc(x.key)}"`), lead: avaOf(x.key), name: esc(o.name), wrap: true,
        meta: esc([countryName(o.country), r ? rlRole(m, r) : m.note].filter(Boolean).join(" · ")),
        extra: `<span class="eu-row__tags">${gtag(o.group)}</span>${edAlsoHtml(x.key, new Set([f.id]))}`, tail: tailFor(x.key, o.name) }); };
    const grp = ({ r, xs: ys }) => {
      if (!ys.length) return "";
      ys.sort((a, b) => (RL_ORDER[a.m.relRole] ?? 3) - (RL_ORDER[b.m.relRole] ?? 3) || nm(a).localeCompare(nm(b)));
      if (!r) return `<div class="rl-grp"><h4 class="rl-t">Other reasons</h4><div class="list">${ys.map((y) => rowOf(y, null)).join("")}</div></div>`;
      const press = ys.some((y) => y.m.basis === "press");
      const meta = [RL_KIND[r.kind] || "", r.cmte, r.date ? fmtIso(r.date, { day: "numeric", month: "short", year: "numeric" }) : "", press ? "role reported in the press" : ""].filter(Boolean).join(" · ");
      return `<div class="rl-grp">
        <h4 class="rl-t">${esc(r.title)}</h4>
        <p class="rl-m">${esc(meta)}</p>
        <p class="rl-why">${esc(r.why)}</p>
        <a class="rl-src" href="${esc(r.url)}" target="_blank" rel="noopener">Open the source${r.procedure ? ` · ${esc(r.procedure)}` : ""}<span aria-hidden="true"> ↗</span><span class="sr"> (opens in a new tab)</span></a>
        <div class="list">${ys.map((y) => rowOf(y, r)).join("")}</div></div>`;
    };
    /* 29 Oct 2026: one short line; the group cards already show each text and the role in it. */
    const cap = hasRole ? "They have no role on this file. Each sits under the related text they worked on."
      : "No rapporteur yet. These MEPs worked on texts this file builds on.";
    return `<section class="rl" aria-labelledby="rlH"><h3 id="rlH">${hasRole ? "Also worked on related texts" : "Worked on related texts"} <small>${xs.length}</small></h3>
      <p class="rl-cap">${esc(cap)}</p>${groups.map(grp).join("")}${grp(other)}
      <p class="rl-foot">Roles come from the Parliament's records, or from press reporting where the text says so. The sentence under each text is nodo's own summary of why it matters for this file.</p></section>`;
  }

  /* ---------- 17. Sources in one tab, counts that open their list (since 29 Oct 2026) ----------
     The content tabs (Parliament, Commission, Council) carry no wording about where data comes from. Everything about
     sources sits in the Sources tab, opened from one row at the bottom of each tab: the checked date, the full status
     and what to check, the official record on the Observatory, how nodo knows who is on the file (Verified, press, DG,
     working party, committee minutes), the related texts and the source links. Moved out of the tabs: the Checked pill,
     "N sources" and the Observatory link under the title, the Verified tags on rows, the source line under the DG, the
     minutes and press footnotes, "Open the source" under related texts, "About this file" and the page footnote.
     Kept on the tabs, because they warn rather than cite: From press on a name, Not confirmed on an inferred DG or
     working party, and the attachés line. The three counts are buttons: MEPs opens Parliament, Commissioners and
     Cabinet staff open Commission at their section. When promoted, openFile renders the Sources tab and the counts directly. */
  const SRC = { to: null };
  const srcChecked = (f) => f.checked || f.asOf || (DATA.fl && DATA.fl.asOf) || "";
  const srcLinks = (f) => (f.sources || []).filter((x) => safeUrl(x.url));
  const srcObs = (f) => {
    const ps = [f.procedure, ...(f.procedures || []), ...((f.parts || []).map((x) => x.procedure))].filter(Boolean);
    return [...new Set(ps)].map((p) => ({ p, label: ((f.parts || []).find((x) => x.procedure === p) || {}).title || "", url: "https://oeil.europarl.europa.eu/oeil/en/procedure-file?reference=" + encodeURIComponent(p) }));
  };
  const srcPress = (f) => [...new Set((f.meps || []).filter((m) => m.basis === "press").map((m) => "ep:" + m.id))].filter((k) => BYKEY.has(k));
  const srcCaveats = (f) => (f.caveats || []).map((x) => (typeof x === "string" ? x : x.text || x.note || "")).filter(Boolean);
  function srcRowHtml(f) {
    const n = srcLinks(f).length, chk = srcChecked(f), toCheck = srcPress(f).length + srcCaveats(f).length;
    const sub = [chk ? `Checked ${fdDate(chk, true)}` : "", n ? `${n} ${pl(n, "source", "sources")}` : "", toCheck ? `${toCheck} to check` : ""].filter(Boolean).join(" · ");
    return `<button class="fp-cal fp-srcrow" type="button" data-ftab="src">
      <span class="fp-cal__ic" aria-hidden="true">${icon("check")}</span>
      <span class="fp-cal__tx"><b>Sources and checks</b>${sub ? `<small>${esc(sub)}</small>` : ""}</span>
      <span class="fp-cal__go" aria-hidden="true">${icon("arrow")}</span></button>`;
  }
  function srcTabHtml(f) {
    const chk = srcChecked(f), cav = srcCaveats(f), press = srcPress(f), obs = srcObs(f), links = srcLinks(f);
    const ver = new Set((f.meps || []).filter((m) => m.basis === "ep-open-data" || m.basis === "ep-procedure-file").map((m) => m.id)).size;
    const d = f.dg || {}, wps = ((f.council || {}).workingParties || []).filter((w) => w.name && w.basis !== "none");
    const mn = MIN && MIN.files && MIN.files[f.id];
    const how = [
      ver ? `${ver} ${pl(ver, "MEP comes", "MEPs come")} from the Parliament's open data or its Legislative Observatory procedure files, matched to the MEP record.` : "",
      press.length ? `From published reporting, to check in the procedure file before external use: ${press.map((k) => BYKEY.get(k).o.name).join(", ")}.` : "",
      (d.lead || []).length ? `Lead DG (${d.lead.map((x) => "DG " + x).join(", ")}): ${mnDgCap(f) || (d.basis === "source" ? "named in a Parliament or Commission document." : "deduced from the Commissioner's portfolio. Verify before external use.")}${d.note ? " " + d.note : ""}` : "",
      ...wps.map((w) => `${w.name}: ${w.basis === "source" ? "named in Council documents." : "inferred, not confirmed."}`),
      mn ? `Committee speakers and Commission officials: committee minutes up to ${fmtIso(mnThrough(f), { day: "numeric", month: "short" })}. Minutes come out a few weeks after each meeting and name who spoke, not what they said.` : "",
      (f.related || []).length ? "MEPs with no role on the file: their role comes from the Parliament's records, or from press reporting where the text says so. The sentence under each related text is nodo's own summary." : "",
      PRESS && prItems(f).length ? "Latest developments: picked by nodo's scan on Mondays and Thursdays. The summaries are nodo's own words." : "",
      "Cabinet staff: matched on the responsibilities each cabinet publishes on the Commission's pages."
    ].filter(Boolean);
    const rel = (f.related || []).filter((r) => safeUrl(r.url));
    return `<section class="fp-src" aria-labelledby="fpSrcH">
      <h3 id="fpSrcH">Sources and checks</h3>
      ${chk ? `<p class="fp-src__chk">${icon("check")}Checked ${esc(fdDate(chk, true))}</p>` : ""}
      ${f.status ? `<h4>Status in full</h4><p class="fp-src__p">${esc(f.status)}</p>` : ""}
      ${cav.length ? `<h4>Check before you rely on it</h4>${cav.map((x) => `<div class="block"><p>${esc(x)}</p></div>`).join("")}` : ""}
      ${obs.length ? `<h4>Official record</h4><div class="list">${obs.map((o) => extRow(esc(o.p) + (o.label ? ` <small>${esc(o.label)}</small>` : "") + " on the Observatory", esc(o.url))).join("")}</div>` : ""}
      <h4>How nodo knows who is on it</h4><ul class="fp-src__ul">${how.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
      ${rel.length ? `<h4>Related texts <small>${rel.length}</small></h4><div class="list">${rel.map((r) => extRow(esc(r.title) + (r.procedure ? ` <small>${esc(r.procedure)}</small>` : ""), esc(safeUrl(r.url)))).join("")}</div>` : ""}
      ${links.length ? `<h4>Sources <small>${links.length}</small></h4><div class="list">${links.map((x) => extRow(esc(x.title), esc(safeUrl(x.url)))).join("")}</div>` : ""}
      <p class="foot">Where the Legislative Observatory and press reporting disagree, nodo follows the Observatory.</p></section>`;
  }
  function srcStats(f, p) {
    const s = p.querySelector(".stats"); if (!s || s.dataset.fstat) return;
    const c = countsOf(f), tab = state.ftab || "ep";
    /* Cabinet staff is pressed only right after it was tapped; Commissioners otherwise. */
    const b = (k, tb, n, lab) => `<button type="button" data-fstat="${k}" data-ftab="${tb}" aria-pressed="${tab === tb && (tb !== "ec" || (k === "cab") === (SRC.to === "cab"))}" aria-label="${n} ${lab}: open the list"><b>${n}</b><span>${lab}</span></button>`;
    s.dataset.fstat = "1";
    s.innerHTML = b("ep", "ep", c.ep, pl(c.ep, "MEP", "MEPs")) + b("ec", "ec", c.ec, pl(c.ec, "Commissioner", "Commissioners")) + b("cab", "ec", c.cab, "Cabinet staff");
  }
  const srcOpen0 = openFile;
  openFile = function (id, keep, startTab) {
    srcOpen0(id, keep, startTab);
    const f = FILE_BY[id], p = $("profileBody") || $("profile"); if (!f || !p || state.open !== "file:" + id) return;
    const tab = state.ftab || "ep";
    p.querySelectorAll(".nx-prov, .fp-about").forEach((x) => x.remove());
    srcStats(f, p);
    const chips = p.querySelector('.chips[aria-label="View"]');
    if (tab === "src") {
      if (chips) { let n = chips.nextElementSibling; while (n) { const nx = n.nextElementSibling; n.remove(); n = nx; } chips.querySelectorAll("[aria-pressed]").forEach((x) => x.setAttribute("aria-pressed", "false")); }
      (chips || p).insertAdjacentHTML(chips ? "afterend" : "beforeend", srcTabHtml(f));
    } else {
      p.querySelectorAll(".eu-group.tag.tg-ok, .rl-src, .rl-foot, .mn-foot, .pr-foot").forEach((x) => x.remove());
      p.querySelectorAll("h3").forEach((h) => { if (/^Presented in committee/.test(h.textContent) && h.nextElementSibling && h.nextElementSibling.classList.contains("mn-cap")) h.nextElementSibling.remove(); });
      p.querySelectorAll(".block .cap").forEach((x) => {
        const t = x.textContent;
        if (/^(Named in a Parliament|Named in committee minutes)/.test(t)) x.remove();
        else if (/^Deduced from the Commissioner/.test(t) || /^Venue inferred/.test(t)) x.outerHTML = `<p class="cap"><span class="eu-group tag tg-press">Not confirmed</span></p>`;
      });
      const foot = p.querySelector(":scope > .foot") || [...p.querySelectorAll(".foot")].pop();
      if (foot) foot.outerHTML = srcRowHtml(f); else p.insertAdjacentHTML("beforeend", srcRowHtml(f));
    }
    if (SRC.to) {
      const to = SRC.to; SRC.to = null;
      const el = to === "cab" ? [...p.querySelectorAll("h3")].find((h) => /^Cabinet staff/.test(h.textContent)) : chips;
      if (el) requestAnimationFrame(() => el.scrollIntoView({ block: "start", behavior: "smooth" }));
    }
  };
  /* Counts and the Sources row switch the tab here (before the app's own handler) and bring the list into view. */
  document.addEventListener("click", (e) => {
    const b = e.target.closest('#profile [data-fstat], #profile .fp-srcrow'); if (!b) return;
    const f = curFile(); if (!f) return;
    e.preventDefault(); e.stopImmediatePropagation();
    SRC.to = b.dataset.fstat === "cab" ? "cab" : "tabs";
    state.ftab = b.dataset.ftab;
    openFile(f.id, true);
    Track.log("view", { section: "file-" + (b.dataset.fstat || "sources"), item: f.id });
  }, true);

  /* ---------- Your list of people on a file (since 30 Oct 2026) ----------
     The edits were already stored as state.lists[fileId] = { add, rem } on top of nodo's list and synced with the account.
     This block reworks how they are made and shown:
     - under the tabs, one line says whose list it is ("nodo's list" or "You added 1 and hid 2") with an Edit pill; Edit opens
       "Edit your list" with Done, "Add someone" first, a remove button on every person (Hide for nodo's people, Remove for the
       ones you added) and an Undo toast; people you hid stay in their own section, faded, with Show;
     - out of edit mode, "N hidden by you · Show" closes the list and opens edit mode at the first hidden person;
     - "Reset to nodo's list" closes edit mode, with what it does in one line;
     - in edit mode, people listed on the file without a role (who spoke in committee, for instance) get Add instead of remove;
     - every profile has "Add to a file": a sheet with your followed files (or all, when you follow none) as checkboxes.
     Updates keep flowing: a person nodo adds joins your list unless you hid them, and someone you added who later appears on
     nodo's list loses the "Added by you" label (membersOf already does this). On Today, people updates about someone you hid
     on that file stay out, except "Rapporteur named". */
  const peIsMember = (f, key) => { const m = membersOf(f); return [...m.base, ...m.added].some((x) => x.key === key); };
  const peHidden = (f, tab) => membersOf(f).removed.filter((k) => (BYKEY.get(k).t === "ep") === (tab === "ep"));
  function peHiddenSkip(e) {
    if (e.kind !== "people" || !e.personId || /^Rapporteur named/.test(e.title || "")) return false;
    const l = state.lists[e.fileId]; return !!(l && (l.rem || []).includes("ep:" + e.personId));
  }
  function peSecOf(f, key) {
    const b = baseOf(f).find((x) => x.key === key); if (!b) return "";
    return b.role === "lead" ? "Lead Commissioner" : b.role === "associated" ? "Associated Commissioners" : b.role === "cabinet" ? "Cabinet staff" : ROLE_MANY[b.role] || "";
  }
  function peRoleText(f, key) {
    const b = baseOf(f).find((x) => x.key === key); if (!b) return "";
    return b.role === "lead" ? "Lead Commissioner" : b.role === "associated" ? "Associated Commissioner" : b.role === "cabinet" ? (b.why || "Cabinet staff") : [ROLE_ONE[b.role], b.cmte].filter(Boolean).join(", ");
  }
  const peHidRow = (f, key) => { const o = BYKEY.get(key).o;
    return row({ cls: "is-static pe-hid", lead: avaOf(key), name: esc(o.name), meta: esc(["Hidden by you", peRoleText(f, key)].filter(Boolean).join(" · ")), wrap: true,
      tail: `<button class="eu-btn eu-btn--sm" type="button" data-frs="${esc(key)}" aria-label="Show ${esc(o.name)} again">Show</button>` }); };
  function peSummary(f) {
    const m = membersOf(f), a = m.added.length, h = m.removed.length;
    if (!a && !h) return "nodo's list. Edit it to add or hide people; only your list changes.";
    return "Your list. " + [a ? `You added ${a} ${pl(a, "person", "people")}` : "", h ? `${a ? "hid" : "You hid"} ${h}` : ""].filter(Boolean).join(" and ") + ".";
  }
  const peOpen0 = openFile;
  openFile = function (id, keep, startTab) {
    peOpen0(id, keep, startTab);
    const f = FILE_BY[id], p = $("profileBody") || $("profile"); if (!f || !p || state.open !== "file:" + id) return;
    const tab = state.ftab || "ep", edit = !!state.fedit;
    p.querySelectorAll(".tb [data-fedit]").forEach((b) => b.remove());
    if (tab !== "ep" && tab !== "ec") return;
    const chips = p.querySelector('.chips[aria-label="View"]'); if (!chips) return;
    /* the app's own edit tools at the bottom: its add button and Removed section go, the reset moves into our footer */
    p.querySelectorAll(".eu-btn[data-fadd]").forEach((b) => b.remove());
    p.querySelectorAll("h3").forEach((h) => { if (/^Removed\b/.test(h.textContent)) { const l = h.nextElementSibling; if (l && l.classList.contains("list")) l.remove(); h.remove(); } });
    const reset = $("resetBox"); if (reset) reset.remove();
    chips.insertAdjacentHTML("afterend", edit
      ? `<div class="pe-bar pe-bar--on"><span class="pe-bar__t"><small>${esc(f.short)}</small><b>Edit your list</b></span><button class="eu-btn eu-btn--brand" type="button" data-fedit>Done</button></div>
         <button class="pe-add" type="button" data-fadd><span class="pe-add__ic" aria-hidden="true">${icon("plus")}</span><span class="pe-add__t"><b>Add someone</b><small>MEPs, Commissioners and cabinet staff</small></span></button>`
      : `<div class="pe-bar"><p>${esc(peSummary(f))}</p><button class="eu-btn eu-btn--sm eu-btn--outline" type="button" data-fedit>${icon("edit")}Edit</button></div>`);
    const hid = peHidden(f, tab), anchor = p.querySelector(".fp-srcrow") || p.querySelector(":scope > .note") || null;
    const place = (html) => (anchor ? anchor.insertAdjacentHTML("beforebegin", html) : p.insertAdjacentHTML("beforeend", html));
    if (edit) {
      p.querySelectorAll("[data-frm]").forEach((b) => {
        const k = b.dataset.frm, o = BYKEY.get(k) && BYKEY.get(k).o; if (!o) return;
        if (!peIsMember(f, k)) { b.outerHTML = `<button class="eu-btn eu-btn--sm" type="button" data-peadd="${esc(k)}" aria-label="Add ${esc(o.name)} to your list">${icon("plus")}Add</button>`; return; }
        b.classList.add("pe-rm"); b.setAttribute("aria-label", (isBase(f, k) ? "Hide " : "Remove ") + o.name);
      });
      const left = [];
      hid.forEach((k) => {
        const t = peSecOf(f, k), h = t && [...p.querySelectorAll("h3")].find((x) => x.textContent.trim().startsWith(t));
        const l = h && h.nextElementSibling;
        if (l && l.classList.contains("list")) l.insertAdjacentHTML("beforeend", peHidRow(f, k)); else left.push(k);
      });
      place((left.length ? `<h3>Hidden by you <small>${left.length}</small></h3><div class="list">${left.map((k) => peHidRow(f, k)).join("")}</div>` : "")
        + `<div class="pe-reset">${state.lists[f.id] ? `<div id="resetBox"><button class="eu-btn eu-btn--outline" type="button" data-freset>${icon("swap")}Reset to nodo's list</button></div>
            <p class="cap">Brings back the people you hid and removes the ones you added. Only your list changes.</p>` : `<p class="cap">This is nodo's list. Hide or add people and only your list changes.</p>`}</div>`);
    } else {
      /* long role lists (13 shadows) fold to three rows with "Show all"; edit mode shows everyone so each can be hidden */
      p.querySelectorAll("h3").forEach((h) => {
        const l = h.nextElementSibling; if (!l || !l.classList.contains("list") || l.closest(".pe-reset")) return;
        const rows = [...l.children], t = h.childNodes[0] ? h.childNodes[0].textContent.trim() : "", k = f.id + "|" + t;
        if (rows.length <= 5 || peOpenSec.has(k)) return;
        rows.slice(3).forEach((r) => (r.hidden = true));
        l.insertAdjacentHTML("afterend", `<button class="eu-btn eu-btn--sm pe-more" type="button" data-pemore="${esc(k)}">Show all ${rows.length} ${esc(t.toLowerCase())}</button>`);
      });
      if (hid.length) place(`<button class="pe-hidrow" type="button" data-pehid><span>${icon("eye")}${hid.length} hidden by you</span><b>Show</b></button>`);
    }
  };
  const peOpenSec = new Set();
  document.addEventListener("click", (e) => {
    const b = e.target.closest("#profile [data-pemore]"), f = curFile(); if (!b || !f) return;
    e.preventDefault(); e.stopImmediatePropagation();
    peOpenSec.add(b.dataset.pemore); openFile(f.id, true);
  }, true);
  /* Remove, hide, show, add and reset run here, before the app's own handlers, so each says what happened and can be undone. */
  document.addEventListener("click", (e) => {
    const t = e.target, f = curFile();
    const rm = t.closest("#profile [data-frm]"), rs = t.closest("#profile [data-frs]"), ad = t.closest("#profile [data-peadd]");
    if (f && (rm || rs || ad)) {
      e.preventDefault(); e.stopImmediatePropagation();
      const key = (rm || rs || ad).dataset.frm || (rm || rs || ad).dataset.frs || (rm || rs || ad).dataset.peadd, o = BYKEY.get(key) && BYKEY.get(key).o; if (!o) return;
      const before = state.lists[f.id] ? JSON.parse(JSON.stringify(state.lists[f.id])) : null, base = isBase(f, key);
      if (rm) listRemove(f, key); else listAdd(f, key);
      const undo = { label: "Undo", fn: () => { if (before) state.lists[f.id] = before; else delete state.lists[f.id]; saveLists(); if (curFile() === f) openFile(f.id, true); } };
      toast(rm ? (base ? o.name + " hidden" : o.name + " removed") : rs ? o.name + " is back on your list" : o.name + " added", 0, undo);
      Track.log("list-edit", { section: rm ? (base ? "hide" : "remove") : rs ? "show" : "add", item: f.id });
      return openFile(f.id, true);
    }
    if (f && t.closest("#profile [data-pehid]")) {
      e.preventDefault(); e.stopImmediatePropagation();
      state.fedit = true; openFile(f.id, true);
      const h = $("profile").querySelector(".pe-hid");
      if (h) requestAnimationFrame(() => h.scrollIntoView({ block: "center", behavior: "smooth" }));
      return;
    }
    if (f && t.closest("#profile [data-freset-yes]")) {
      e.preventDefault(); e.stopImmediatePropagation();
      const before = state.lists[f.id] ? JSON.parse(JSON.stringify(state.lists[f.id])) : null;
      delete state.lists[f.id]; saveLists();
      toast("Back to nodo's list", 0, before ? { label: "Undo", fn: () => { state.lists[f.id] = before; saveLists(); if (curFile() === f) openFile(f.id, true); } } : null);
      Track.log("list-edit", { section: "reset", item: f.id });
      return openFile(f.id, true);
    }
  }, true);
  /* The add sheet: "Add someone", and the picked person shows with the toast's Undo. */
  const peAdd0 = openAdd;
  openAdd = function (id) {
    peAdd0(id);
    const f = FILE_BY[id], h = $("sName"); if (f && h) { h.textContent = "Add someone"; const c = h.nextElementSibling; if (c) c.textContent = "to " + f.short + " · MEPs, Commissioners and cabinet staff"; }
  };

  /* Add to a file, from a profile: followed files first (all files when none is followed), each a checkbox. Ticking adds the
     person to your list on that file (or shows them again if you hid them); unticking hides or removes them. */
  const peProfKey = () => { const k = state.open; return k && BYKEY.has(k) ? k : ""; };
  function peProfBtn() {
    const k = peProfKey(), P = $("profile"); if (!k || !P || P.querySelector("[data-pefto]")) return;
    const btn = `<button class="eu-btn eu-btn--outline" type="button" data-pefto="${esc(k)}">${icon("files")}Add to a file</button>`;
    const acts = P.querySelector(".acts");
    if (acts) acts.insertAdjacentHTML("beforeend", btn);
    else { const h = P.querySelector(".hero, .top"); if (h) h.insertAdjacentHTML("afterend", `<div class="acts">${btn}</div>`); }
  }
  ["openMep", "openCom", "openCab"].forEach((n) => {
    const f0 = n === "openMep" ? openMep : n === "openCom" ? openCom : openCab;
    const w = function () { const r = f0.apply(this, arguments); peProfBtn(); return r; };
    if (n === "openMep") openMep = w; else if (n === "openCom") openCom = w; else openCab = w;
  });
  const peSpoke = (f, key) => { const o = MIN && MIN.files && MIN.files[f.id]; return !!(o && key.startsWith("ep:") && (o.speakers || []).some((s) => "ep:" + s.id === key)); };
  function peFtoOpen(key, all) {
    const e = BYKEY.get(key); if (!e) return;
    const fol = FILES.filter((f) => state.follow.has(f.id)), list = all || !fol.length ? FILES : fol;
    state.sheet = "pefto:" + key;
    if ($("sheet").hidden) layer.sheet = document.activeElement;
    const item = (f) => {
      const on = peIsMember(f, key), base = isBase(f, key), note = base ? (on ? "On nodo's list. Untick to hide." : "On nodo's list, hidden by you") : peSpoke(f, key) ? "Spoke in committee on this file" : "";
      return `<label class="pe-fto"><input type="checkbox" data-pef="${esc(f.id)}"${on ? " checked" : ""}><span><b>${esc(f.short)}</b>${note ? `<small>${esc(note)}</small>` : ""}</span></label>`;
    };
    $("sheet").innerHTML = `<div class="sheet__bar"><button class="eu-iconbtn eu-iconbtn--sm" type="button" data-sheet-close aria-label="Close">${icon("x")}</button></div>
      <div class="top"><div class="top__tx"><h2 id="sName">Add to your files</h2><div class="cap">${esc(e.o.name)} shows on the files you tick. Only your lists change.</div></div></div>
      <fieldset class="pe-ftos"><legend class="sr">${list === FILES ? "All files" : "Files you follow"}</legend>${list.map(item).join("")}</fieldset>
      ${list !== FILES ? `<button class="eu-btn eu-btn--sm pe-ftoall" type="button" data-peftoall="${esc(key)}">Show all ${FILES.length} files</button>` : ""}
      <button class="eu-btn eu-btn--brand eu-btn--block mt" type="button" data-peftosave="${esc(key)}">Save</button>`;
    $("scrim").hidden = false; $("sheet").hidden = false; $("sheet").scrollTop = 0;
    syncLayers();
    const first = $("sheet").querySelector("input"); if (first) first.focus({ preventScroll: true });
  }
  document.addEventListener("click", (e) => {
    const t = e.target, op = t.closest("[data-pefto]"), all = t.closest("[data-peftoall]"), sv = t.closest("[data-peftosave]");
    if (op) { e.preventDefault(); e.stopImmediatePropagation(); return peFtoOpen(op.dataset.pefto); }
    if (all) { e.preventDefault(); e.stopImmediatePropagation(); return peFtoOpen(all.dataset.peftoall, true); }
    if (!sv) return;
    e.preventDefault(); e.stopImmediatePropagation();
    const key = sv.dataset.peftosave, o = BYKEY.get(key) && BYKEY.get(key).o; if (!o) return;
    let added = 0, gone = 0;
    $("sheet").querySelectorAll("[data-pef]").forEach((c) => {
      const f = FILE_BY[c.dataset.pef]; if (!f) return;
      const on = peIsMember(f, key);
      if (c.checked && !on) { listAdd(f, key); added++; }
      else if (!c.checked && on) { listRemove(f, key); gone++; }
    });
    closeSheet();
    toast(added || gone ? [added ? `Added to ${added} ${pl(added, "file", "files")}` : "", gone ? `off ${gone}` : ""].filter(Boolean).join(", ") : "No change");
    if (added || gone) Track.log("list-edit", { section: "from-profile", item: key });
    /* refresh "On these files" on the profile in place */
    const P = $("profile"), h = P && [...P.querySelectorAll("h3")].find((x) => /^On these files/.test(x.textContent));
    const fresh = fileLinks(key);
    if (h) { const l = h.nextElementSibling; if (l && l.classList.contains("list")) l.remove(); h.outerHTML = fresh; }
    else if (fresh && P) { const a = P.querySelector(".acts"); if (a) a.insertAdjacentHTML("afterend", fresh); }
  }, true);

  /* Profile as a contact card (since 30 Oct 2026), for MEPs and Commissioners. Inspired by iOS Contacts: a short tinted band in the
     institution's colour, a round portrait overlapping it, the name centred, then one row of actions (Email or Cabinet, Save,
     Add to a file, Share). The three count tiles went. "On these files" moves up under the actions; the contact rows move below
     the institution sections under a "Contact" heading. The original openers still build the page; pcCard reshapes it.
     When promoted, openMep and openCom render this header directly and the .mh / .stats header code goes. */
  function pcCard(kind) {
    const P = $("profileBody"), mh = P && P.querySelector(":scope > .mh"), key = state.open, e = key && BYKEY.get(key), o = e && e.o;
    if (!mh || !o) return;
    const ep = kind === "ep";
    const name = mh.querySelector("#pName"), arch = mh.querySelector(".mh__arch"), tags = mh.querySelector(".eu-row__tags"),
      where = mh.querySelector(".mh__where"), back = mh.querySelector("[data-close]"), sh = mh.querySelector("#pShare");
    const copyFn = sh && sh.onclick;
    const roleLine = ep ? "Member of the European Parliament" : [o.title, (o.portfolio || []).join(" · ")].filter(Boolean).join(" · ");
    const head = document.createElement("header");
    head.className = "pc";
    head.style.setProperty("--pt", ep ? "var(--tint-sky)" : "var(--tint-apricot)");
    head.style.setProperty("--pa", ep ? "var(--accent-sky)" : "var(--accent-apricot)");
    head.innerHTML = `<div class="pc__band"><div class="tb"></div></div><div class="pc__who"></div>`;
    if (back) head.querySelector(".tb").appendChild(back);
    const who = head.querySelector(".pc__who");
    if (arch) { arch.classList.add("pc__ava"); who.appendChild(arch); }
    if (name) { name.className = "pc__name"; who.appendChild(name); }
    who.insertAdjacentHTML("beforeend", `<p class="pc__role">${esc(roleLine)}</p><div class="pc__chips"></div>`);
    const chips = who.querySelector(".pc__chips");
    if (ep && tags) [...tags.children].forEach((c) => chips.appendChild(c));
    const place = where ? where.textContent.trim() : "";
    if (place) chips.insertAdjacentHTML("beforeend", `<span class="pc__chip">${esc(place)}</span>`);
    if (!chips.children.length) chips.remove();

    /* Actions. Save keeps data-fav without data-label, so syncFav only flips aria-pressed and the label follows in CSS. */
    const saved = state.favs.has(key);
    const save = (primary) => `<button class="pc__act${primary ? " is-primary" : ""}" type="button" data-fav="${esc(key)}" aria-pressed="${saved}">${icon("star")}<span class="pc__off">Save</span><span class="pc__on">Saved</span></button>`;
    const acts = [];
    const mail = ep && o.email ? o.email : "";
    const cabH = !ep && [...P.querySelectorAll(":scope > h3")].find((h) => /^Cabinet/.test(h.textContent));
    if (mail) acts.push(`<a class="pc__act is-primary" href="${esc(contactHref("mail", mail))}">${icon("mail")}<span>Email</span></a>`);
    else if (cabH) acts.push(`<button class="pc__act is-primary" type="button" data-pccab>${icon("group")}<span>Cabinet</span></button>`);
    acts.push(save(!acts.length));
    acts.push(`<button class="pc__act" type="button" data-pefto="${esc(key)}">${icon("files")}<span>Add to file</span></button>`);
    acts.push(`<button class="pc__act" type="button" data-pcshare>${icon("share")}<span>Share</span></button>`);
    head.insertAdjacentHTML("beforeend", `<div class="acts pc__acts">${acts.join("")}</div>`);

    /* The contact rows sat right under the old actions: keep them for later. */
    const oldActs = P.querySelector(":scope > .acts"), contact = oldActs && oldActs.nextElementSibling && oldActs.nextElementSibling.classList.contains("list") ? oldActs.nextElementSibling : null;
    P.querySelectorAll(":scope > .stats, :scope > .acts").forEach((x) => x.remove());
    mh.replaceWith(head);

    const filesH = [...P.querySelectorAll(":scope > h3")].find((h) => /^On these files/.test(h.textContent));
    if (filesH) { const l = filesH.nextElementSibling; head.after(filesH); if (l && l.classList.contains("list")) filesH.after(l); }
    if (contact) {
      const anchor = [...P.querySelectorAll(":scope > h3, :scope > details, :scope > .foot")].find((x) => x.matches(".foot, details") || /^(Links|Activity|Mandate|Departments|Career)/.test(x.textContent));
      const h = document.createElement("h3"); h.textContent = "Contact";
      if (anchor) { anchor.before(h); h.after(contact); } else { P.append(h, contact); }
    }

    const shareBtn = head.querySelector("[data-pcshare]");
    shareBtn.onclick = async () => {
      const text = [o.name, roleLine, place, mail].filter(Boolean).join(" · ");
      if (navigator.share) { try { await navigator.share({ title: o.name, text }); Track.log("share", { section: kind, item: key }); return; } catch (err) { if (err && err.name === "AbortError") return; } }
      if (copyFn) copyFn(); else copy(text, "Contact");
    };
    const cb = head.querySelector("[data-pccab]");
    if (cb && cabH) cb.onclick = () => cabH.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  }
  {
    const m0 = openMep, c0 = openCom;
    openMep = function () { const r = m0.apply(this, arguments); pcCard("ep"); return r; };
    openCom = function () { const r = c0.apply(this, arguments); pcCard("ec"); return r; };
  }

  /* ---------- Auto pages for files nodo doesn't follow (since 30 Oct 2026) ----------
     v1/auto-files.json (tools/files/auto_pages.py, weekly) holds every ordinary legislative procedure, ongoing or of this
     term, that is not one of nodo's curated files, read from the Parliament's Legislative Observatory and shaped like an
     entry of files.json plus `auto: true`. The file is loaded only when it is needed: on the first search, or at start-up
     when you follow an auto page.
     - Search: under the curated results, "Not followed by nodo yet": one line on what that means, then each matching
       procedure with its stage and rapporteur and "Generate page" (or "Open page" once you have opened it). The generic
       request card gives way when there are such results.
     - "Two kinds of file page": a sheet that tells the auto page (ready now, built and updated automatically from the
       procedure file, not checked by nodo) from the full page (cabinet staff, the Council working party, committee
       speakers and latest developments, checked by nodo). "Generate the auto page" opens it; "Request a full page" is the
       existing request (a usage event, in the weekly requests recap).
     - The auto page is the normal file page with: the note "Auto page. Built from the procedure file, not followed by
       nodo. What's the difference?" at the top, "–" for cabinet staff, "Not on this page yet" with Request a full page
       under the lists, the Observatory's key events as the file's dates and updates, and its own Sources tab.
     - Follow works as for any file: a followed auto page joins Your files in its policy area, marked Auto, and syncs.
     When promoted, this block moves into the app as it stands; the live app ignores followed auto ids until then. */
  const AU = { list: null, by: new Map(), loading: null, GEN: "nodo.autoGen" };
  const auGen = () => { try { return new Set(JSON.parse(store.get(AU.GEN) || "[]")); } catch { return new Set(); } };
  const auMark = (id) => { const s = auGen(); s.add(id); store.set(AU.GEN, JSON.stringify([...s].slice(-200))); };
  const AU_STEP = { "pre-proposal": "Pre-proposal", "positions-in-preparation": "Positions forming", trilogue: "In trilogue", "in-force": "Adopted" };
  const auLabel = (f) => f.stageLabel || AU_STEP[f.stage] || "";
  const auRap = (f) => (f.meps || []).filter((m) => m.role === "rapporteur").map((m) => BYKEY.get("ep:" + m.id)).filter(Boolean).map((x) => x.o.name);
  /* Its events become the file's timeline, so "Dates and updates on this file" and Calendar show them. */
  const auTl = (f) => (f.events || []).map((e, i) => ({ id: `${f.id}:oeil:${e.date}:${i}`, fileId: f.id, date: e.date, source: "ep", proc: f.procedure, kind: "milestone", title: e.what, push: false }));
  {
    let tl = UPD.tl;
    Object.defineProperty(UPD, "tl", { configurable: true, get: () => tl, set: (v) => { tl = v || {}; AU.by.forEach((f) => { if (FILE_BY[f.id] && !tl[f.id]) tl[f.id] = auTl(f); }); } });
  }
  /* An auto page becomes a file the app knows: FILE_BY always, FILES only while followed. */
  function auRegister(f) {
    if (!f || f._au) return f;
    f._au = true;
    f._sh = words(f.short); f._nm = words([f.short, f.title].join(" ")); f._hay = words([f.short, f.title, f.procedure, f.id, ((f.ep || {}).lead || []).join(" ")].join(" "));
    FILE_BY[f.id] = f;
    if (!UPD.tl[f.id]) UPD.tl[f.id] = auTl(f);
    Object.assign(DG_NAMES, (f.dg && f.dg.names) || {});
    return f;
  }
  function auSyncFiles() {
    let changed = false;
    AU.by.forEach((f) => {
      const want = state.follow.has(f.id), at = FILES.indexOf(f);
      if (want && at < 0) { auRegister(f); FILES.push(f); changed = true; }
      if (!want && at >= 0) { FILES.splice(at, 1); changed = true; }
    });
    if (changed) EP_FILES = null;
    return changed;
  }
  function auLoad() {
    if (AU.list) return Promise.resolve(AU.list);
    if (AU.loading) return AU.loading;
    AU.loading = fetchJson(DATA_BASE + "auto-files.json").then((d) => {
      const xs = Array.isArray(d.files) ? d.files.filter((f) => f && f.id && !FILE_BY[f.id] && !FILES.some((c) => c.procedure && c.procedure === f.procedure)) : [];
      xs.forEach((f) => {
        f._find = words([f.short, f.procedure, f.procedure.replace(/[/()]/g, " "), ((f.ep || {}).lead || []).join(" "), auRap(f).join(" ")].join(" "));
        f._t = words(f.short);
        AU.by.set(f.id, f);
      });
      AU.list = xs; AU.asOf = d.asOf || "";
      if (auSyncFiles()) renderView();
      const cur = state.open && state.open.startsWith("file:") && AU.by.get(state.open.slice(5));
      if (cur) { auRegister(cur); openFile(cur.id, true); }
      if (state.view === "home" && state.hq) renderHome();
      return xs;
    }).catch(() => { AU.loading = null; return []; });
    return AU.loading;
  }
  /* Load at start-up only for someone who follows or edited an auto page. */
  if ([...state.follow, ...Object.keys(state.lists || {})].some((id) => String(id).startsWith("auto-"))) auLoad();
  {
    const adopt0 = adoptRemote;
    adoptRemote = function (d, quiet) {
      if (AU.list) auSyncFiles();
      else if ((Array.isArray(d.follow) ? d.follow : []).some((id) => String(id).startsWith("auto-"))) auLoad();
      const r = adopt0(d, quiet); if (AU.list && auSyncFiles()) renderView(); return r;
    };
  }

  /* Search. */
  function auFind(t) {
    if (!AU.list) { auLoad(); return null; }
    if (!t.length || !t.some((x) => x.length >= 3 || /^\d+$/.test(x))) return [];
    const done = (f) => (f.stage === "in-force" ? 1 : 0);
    return AU.list.filter((f) => hits(f._find, t)).sort((a, b) => (hits(b._t, t) - hits(a._t, t)) || done(a) - done(b) || (a.procedure < b.procedure ? 1 : -1));
  }
  {
    const s0 = searchAll;
    searchAll = function (q) { const r = s0(q); if (r) r.af = auFind(r.t); return r; };
  }
  const AU_MAX = 5;
  function auCard(f) {
    const open = auGen().has(f.id) || state.follow.has(f.id), rap = auRap(f);
    const meta = [f.procedure, auLabel(f), rap.length ? "Rapporteur " + rap.join(", ") : ((f.ep || {}).lead || []).length ? f.ep.lead.join("-") + ", no rapporteur yet" : ""].filter(Boolean).join(" · ");
    return `<article class="au-card"><div class="au-card__tx"><b>${esc(f.short)}</b><small>${esc(meta)}</small></div>
      <button class="eu-btn eu-btn--sm${open ? "" : " eu-btn--brand"}" type="button" data-augen="${esc(f.id)}">${open ? "Open page" : "Generate page"}</button></article>`;
  }
  function auSection(r) {
    if (r.af == null) return `<p class="cap nx-wait">Looking in the Legislative Observatory…</p>`;
    if (!r.af.length) return "";
    const xs = r.af.slice(0, AU_MAX);
    return `<section class="au-sec" aria-labelledby="auSecH"><h3 id="auSecH">Not followed by nodo yet <small>${r.af.length}</small></h3>
      <p class="cap au-sec__cap">nodo doesn't follow ${r.af.length === 1 ? "this file" : "these files"} yet. Generate a page from the Parliament's procedure file. <button class="linkbtn" type="button" data-ausheet="">What's the difference?</button></p>
      <div class="au-list">${xs.map(auCard).join("")}</div>
      ${r.af.length > AU_MAX ? `<p class="cap nx-more">Showing ${AU_MAX} of ${r.af.length}. Add a word or the procedure number to narrow it down.</p>` : ""}</section>`;
  }
  {
    const h0 = resultsHtml;
    resultsHtml = function (r, q) {
      let h = h0(r, q);
      const sec = auSection(r); if (!sec) return h;
      if (r.af && r.af.length) { const i = h.lastIndexOf('<div class="block nx-req">'); if (i >= 0) h = h.slice(0, i); }
      if (/^<p class="empty/.test(h.trim())) h = "";
      const at = h.indexOf("<h3>Parliament reports and opinions");
      return at >= 0 ? h.slice(0, at) + sec + h.slice(at) : h + sec;
    };
  }

  /* The sheet: two kinds of file page. */
  function auSheet(id) {
    const f = id && (AU.by.get(id) || FILE_BY[id]), have = f && (auGen().has(f.id) || state.follow.has(f.id) || (state.open === "file:" + f.id));
    const reqQ = f ? `${f.short} (${f.procedure})` : "";
    const asked = f && nxRequested().has(fold(reqQ).trim());
    state.sheet = "auto";
    if ($("sheet").hidden) layer.sheet = document.activeElement;
    $("sheet").innerHTML = `<div class="sheet__bar"><button class="eu-iconbtn eu-iconbtn--sm" type="button" data-sheet-close aria-label="Close">${icon("x")}</button></div>
      <div class="au-sh">
        <h2 id="sName" class="au-sh__h">Two kinds of <b>file page</b></h2>
        <p class="au-sh__lead">${f ? `${esc(f.short)} isn't on nodo's list. You can have the basics now, or ask nodo to follow it.` : "nodo follows a list of files in full. For any other file you can have the basics now, or ask nodo to follow it."}</p>
        <div class="au-kind"><div class="au-kind__h"><h3>Auto page</h3><span>Ready now</span></div>
          <p>Stage, next step, rapporteur, shadows, opinion rapporteurs, Commissioner and DG.</p>
          <p class="au-kind__fine">Built and updated automatically from the Parliament's procedure file, every week. Nobody at nodo checks it.</p></div>
        <div class="au-kind au-kind--full"><div class="au-kind__h"><h3>Full page</h3><span>On request</span></div>
          <p>Everything above, plus cabinet staff, the Council working party, committee speakers and latest developments.</p>
          <p class="au-kind__fine">nodo follows the file and checks it against Council and Commission sources.</p></div>
        <div class="au-sh__acts">
          ${f && !have ? `<button class="eu-btn eu-btn--brand eu-btn--block" type="button" data-augo="${esc(f.id)}">Generate the auto page</button>` : ""}
          ${f ? `<button class="eu-btn eu-btn--outline eu-btn--block" type="button" data-nxreq="${esc(reqQ)}"${asked ? " disabled" : ""}>${asked ? "Requested" + icon("check") : "Request a full page"}</button>` : `<button class="eu-btn eu-btn--outline eu-btn--block" type="button" data-sheet-close>Got it</button>`}
          ${f && !have ? `<p class="cap au-sh__note">You can request a full page later from the auto page.</p>` : ""}
        </div></div>`;
    $("scrim").hidden = false; $("sheet").hidden = false; $("sheet").scrollTop = 0;
    syncLayers();
    const go1 = $("sheet").querySelector("[data-augo], [data-sheet-close]"); if (go1) go1.focus({ preventScroll: true });
    Track.log("view", { section: "auto-sheet", item: f ? f.procedure : "" });
  }
  function auOpen(id) {
    const f = auRegister(AU.by.get(id)); if (!f) return toast("This file is not in nodo's data yet");
    const first = !auGen().has(id);
    auMark(id);
    if (first) Track.log("auto", { section: "file", item: f.procedure });
    closeSheet();
    openFile(id);
  }
  document.addEventListener("click", (e) => {
    const s = e.target.closest("[data-ausheet]"), g = e.target.closest("[data-augen]"), o = e.target.closest("[data-augo]");
    if (!s && !g && !o) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (s) return auSheet(s.dataset.ausheet || (curFile() && curFile().auto ? curFile().id : ""));
    if (o) return auOpen(o.dataset.augo);
    const id = g.dataset.augen;
    if (auGen().has(id) || state.follow.has(id)) auOpen(id); else auSheet(id);
  }, true);

  /* Follow: a followed auto page is one of your files. */
  {
    const t0 = toggleFollow;
    toggleFollow = function (id, undo) {
      const f = AU.by.get(id);
      if (f) { auRegister(f); if (!state.follow.has(id) && !FILES.includes(f)) { FILES.push(f); EP_FILES = null; } }
      t0(id, undo);
      if (f && !state.follow.has(id)) { const at = FILES.indexOf(f); if (at >= 0) { FILES.splice(at, 1); EP_FILES = null; if (state.view === "files") renderFilesView(); } }
      if (f && state.view === "home") renderHome();
    };
  }
  /* Files directory: an auto page is marked Auto. */
  {
    const r0 = frRow;
    frRow = function (f) { const h = r0(f); return f.auto ? h.replace(/(<span class="fr__n">[^<]*)<\/span>/, `$1 <span class="au-tag">Auto</span></span>`) : h; };
  }
  /* Its Sources tab says what an auto page is made of. */
  {
    const st0 = srcTabHtml;
    srcTabHtml = function (f) {
      if (!f.auto) return st0(f);
      const obs = srcObs(f), n = new Set((f.meps || []).map((m) => m.id)).size;
      return `<section class="fp-src" aria-labelledby="fpSrcH">
        <h3 id="fpSrcH">Sources and checks</h3>
        ${f.checked ? `<p class="fp-src__chk">${icon("check")}Read from the Observatory ${esc(fdDate(f.checked, true))}</p>` : ""}
        ${f.status ? `<h4>Status in full</h4><p class="fp-src__p">${esc(f.status)}</p>` : ""}
        <h4>Official record</h4><div class="list">${obs.map((o) => extRow(esc(o.p) + " on the Observatory", esc(o.url))).join("")}</div>
        <h4>How this page is made</h4><ul class="fp-src__ul">
          <li>This is an auto page. nodo builds it every week from the Parliament's Legislative Observatory procedure file and nobody at nodo checks it.</li>
          <li>${n} ${pl(n, "MEP comes", "MEPs come")} from the procedure file's key players, matched to the MEP record. MEPs who have left the Parliament are not shown.</li>
          ${(f.commission && (f.commission.names || []).length) ? `<li>Commissioner and DG: as the procedure file names them.</li>` : ""}
          <li>Dates ahead are the Observatory's forecasts and are indicative.</li>
          <li>Not on an auto page: cabinet staff, the Council working party, committee speakers and latest developments. They come with a full page.</li></ul>
        <p class="foot">Where the Observatory changes, the auto page follows it at the next weekly update.</p></section>`;
    };
  }
  /* The page itself. */
  function auGapHtml(f) {
    const q = `${f.short} (${f.procedure})`, asked = nxRequested().has(fold(q).trim());
    return `<section class="au-gap" aria-labelledby="auGapH"><h3 id="auGapH">Not on this page yet</h3>
      <p>Cabinet staff, the Council working party, committee speakers and latest developments. nodo adds them when a file gets a full page.</p>
      <button class="eu-btn eu-btn--outline eu-btn--block" type="button" data-nxreq="${esc(q)}"${asked ? " disabled" : ""}>${asked ? "Requested" + icon("check") : "Request a full page"}</button></section>`;
  }
  {
    const o0 = openFile;
    openFile = function (id, keep, startTab) {
      const f0 = AU.by.get(id); if (f0) auRegister(f0);
      o0(id, keep, startTab);
      const f = FILE_BY[id], p = $("profileBody") || $("profile");
      if (!f || !f.auto || !p || state.open !== "file:" + id) return;
      const hero = p.querySelector(".hero");
      if (hero && !hero.querySelector(".au-note")) hero.insertAdjacentHTML("afterbegin", `<button class="au-note" type="button" data-ausheet="${esc(f.id)}"><svg class="eu-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg><span><b>Auto page.</b> Built from the procedure file, not followed by nodo. <u>What's the difference?</u></span></button>`);
      const cab = p.querySelector('[data-fstat="cab"]');
      if (cab && !countsOf(f).cab) { cab.querySelector("b").textContent = "–"; cab.setAttribute("aria-label", "Cabinet staff: not on an auto page"); }
      if ((state.ftab || "ep") !== "src" && !p.querySelector(".au-gap")) {
        const at = p.querySelector(".fp-srcrow");
        if (at) at.insertAdjacentHTML("beforebegin", auGapHtml(f)); else p.insertAdjacentHTML("beforeend", auGapHtml(f));
      }
    };
  }

  /* ---------- Search the way Brussels talks (since 30 Oct 2026) ----------
     v1/search-terms.json is hand-kept: nicknames (the names Brussels uses, each pointing at procedures checked against
     their Observatory titles) and topics (a word people search, with the words official titles use for it). Loaded with
     the auto pages, on the first search.
     - A nickname ("pharma package") answers first: one line says it is the usual name for these files and that their
       official titles follow; each card carries "<name> · known officially as", the official title, procedure, stage and
       rapporteur, and opens the file (Generate page for an auto page).
     - A topic ("plastics", typed alone or as "files on plastics") answers with "Files on plastics": one line saying how
       many files nodo follows on it and how many more have an auto page, the followed files first, then auto pages with
       the matched words marked, adopted files last, eight before "Show all", the other words that matched, and "Request it".
     - Nothing anywhere: "Nothing in nodo matches", where nodo looked (with counts), what to try, and one action: request it.
     Files shown under a nickname or topic are not repeated in the sections below. The fuzzy fix of a typo does not run
     when a nickname or topic matched. Searches answered only by these sections or by auto pages no longer count as
     "found nothing" in the Monday recap. */
  const ST = { data: null, loading: null, more: new Set(), last: { q: "", n: 0 } };
  const ST_STOP = new Set(["files", "file", "on", "about", "laws", "law", "eu", "the", "policy", "legislation", "rules", "dossiers", "dossier"]);
  function stLoad() {
    if (ST.data) return Promise.resolve(ST.data);
    if (ST.loading) return ST.loading;
    ST.loading = fetchJson(DATA_BASE + "search-terms.json").then((d) => {
      (d.nicknames || []).forEach((n) => { n._aka = [n.name, ...(n.aka || [])].map(words).filter((w) => w.trim().length >= 3); });
      (d.topics || []).forEach((t) => { t._match = (t.match || []).map((m) => fold(m).replace(/[^a-z0-9]+/g, " ").trim()); t._words = (t.words || []).map((w) => words(w).slice(0, -1)).filter((w) => w.trim()); });
      ST.data = d;
      if (state.view === "home" && state.hq) renderHome();
      return d;
    }).catch(() => { ST.loading = null; return null; });
    return ST.loading;
  }
  const stProcs = (f) => [f.procedure, ...(f.procedures || []), ...((f.parts || []).map((x) => x.procedure))].filter(Boolean);
  function stFileOf(ref) {
    const c = FILES.find((f) => !f.auto && stProcs(f).includes(ref)); if (c) return c;
    return (AU.list || []).find((f) => f.procedure === ref) || null;
  }
  function stNick(q) {
    if (!ST.data || !AU.list) return null;
    const qw = words(q); let best = null, len = 0;
    for (const n of ST.data.nicknames || []) for (const a of n._aka) if (qw.includes(a) && a.length > len) { best = n; len = a.length; }
    if (!best) return null;
    const files = [...new Set(best.procedures.map(stFileOf).filter(Boolean))];
    return files.length ? { n: best, files } : null;
  }
  const stQueryCore = (q) => fold(q).replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter((w) => w && !ST_STOP.has(w)).join(" ");
  function stTopic(q) {
    if (!ST.data || !AU.list) return null;
    const core = stQueryCore(q); if (!core) return null;
    const t = (ST.data.topics || []).find((x) => x._match.some((m) => m === core || m + "s" === core || m === core + "s"));
    if (!t) return null;
    const hit = (f) => t._words.filter((w) => words(f.short + " " + (f.title || "")).includes(w));
    const cur = FILES.filter((f) => !f.auto && ((t.area && f.area === t.area) || hit(f).length));
    const au = (AU.list || []).map((f) => ({ f, w: hit(f) })).filter((x) => x.w.length)
      .sort((a, b) => ((a.f.stage === "in-force") - (b.f.stage === "in-force")) || (b.w.length - a.w.length) || (a.f.procedure < b.f.procedure ? 1 : -1));
    return { t, cur, au };
  }
  {
    const s0 = searchAll;
    searchAll = function (q) {
      stLoad(); if (!AU.list) auLoad();
      const nick = stNick(q || ""), topic = nick ? null : stTopic(q || "");
      let r;
      if (nick || topic) { r = nxSearchBase(q); if (r) { r.rp = nxDocs(r.t); r.af = auFind(r.t); } }
      else r = s0(q);
      if (!r) return r;
      r.nick = nick; r.topic = topic;
      const shown = new Set([...(nick ? nick.files : []), ...(topic ? [...topic.cur, ...topic.au.map((x) => x.f)] : [])].map((f) => f.id));
      if (shown.size) { r.fl = r.fl.filter((f) => !shown.has(f.id)); if (r.af) r.af = r.af.filter((f) => !shown.has(f.id)); }
      ST.last = { q: String(q || "").trim().toLowerCase().slice(0, 80), n: shown.size + ((r.af && r.af.length) || 0) };
      return r;
    };
  }
  {
    const tr0 = Track.search.bind(Track);
    Track.search = function (where, q, n) { const k = String(q || "").trim().toLowerCase().slice(0, 80); return tr0(where, q, !n && k === ST.last.q ? ST.last.n : n); };
  }
  const stEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  function stMark(title, ws) {
    let h = esc(title);
    ws.map((w) => w.trim()).filter(Boolean).sort((a, b) => b.length - a.length).forEach((w) => {
      const rx = new RegExp("(^|[^\\p{L}\\p{N}>])(" + w.split(" ").map(stEsc).join("[^\\p{L}\\p{N}]+") + "[\\p{L}\\p{N}]*)", "giu");
      h = h.replace(rx, "$1<mark class=\"st-mark\">$2</mark>");
    });
    return h;
  }
  const stMeta = (f) => { const rap = auRap(f); return [f.procedure, f.auto ? auLabel(f) : (STAGE[f.stage] || [f.stage])[0], rap.length ? rap.join(", ") : ""].filter(Boolean).join(" · "); };
  const stWhat = `<button class="linkbtn" type="button" data-ausheet="">What's an auto page?</button>`;
  function stNickHtml(x) {
    const k = x.files.length, anyAuto = x.files.some((f) => f.auto);
    const card = (f) => {
      const open = !f.auto || auGen().has(f.id) || state.follow.has(f.id);
      return `<article class="st-card"><span class="st-chip">${esc(x.n.name)} · known officially as</span>
        <b class="st-card__t">${esc(f.title || f.short)}</b><small class="st-card__m">${esc(stMeta(f))}</small>
        <span class="st-card__acts">${f.auto
          ? `<button class="eu-btn eu-btn--sm${open ? "" : " eu-btn--brand"}" type="button" data-augen="${esc(f.id)}">${open ? "Open page" : "Generate page"}</button>`
          : `<button class="eu-btn eu-btn--sm eu-btn--brand" type="button" data-file="${esc(f.id)}">Open page</button><span class="st-full">Followed by nodo</span>`}</span></article>`;
    };
    return `<section class="st-sec" aria-labelledby="stNickH"><h3 id="stNickH" class="st-h"><span>Known as</span> ${esc(x.n.name)}</h3>
      <p class="cap st-cap">“${esc(x.n.name)}” is the usual name for ${k === 1 ? "this file" : `these ${k} files`}. ${k === 1 ? "Its official title is" : "Their official titles are"} below.${anyAuto ? " " + stWhat : ""}</p>
      <div class="st-list">${x.files.map(card).join("")}</div></section>`;
  }
  function stTopicHtml(x, q) {
    const { t, cur, au } = x, nc = cur.length, na = au.length, all = ST.more.has(t.name), shownAu = all ? au : au.slice(0, 8);
    const cap = !nc && !na ? `nodo has no file on ${esc(t.name)} yet.`
      : !nc ? `nodo follows no file on ${esc(t.name)}. ${na === 1 ? "This one is" : `These ${na} are`} in the Legislative Observatory and ${na === 1 ? "has" : "have"} an auto page. ${stWhat}`
      : !na ? `nodo follows ${nc} ${pl(nc, "file", "files")} on ${esc(t.name)}.`
      : `nodo follows ${nc} ${pl(nc, "file", "files")} on ${esc(t.name)}. ${na} more ${na === 1 ? "is" : "are"} in the Legislative Observatory and ${na === 1 ? "has" : "have"} an auto page. ${stWhat}`;
    const seen = [...new Set(shownAu.flatMap((y) => y.w.map((w) => w.trim())))];
    const base = new Set(t._match.flatMap((m) => [m, m + "s", m.replace(/s$/, "")]));
    const also = seen.filter((w) => !base.has(w));
    const card = (y) => `<button class="st-card st-card--tap" type="button" data-augen="${esc(y.f.id)}">
        <b class="st-card__t st-card__t--clamp">${stMark(y.f.short, y.w)}</b><small class="st-card__m">${esc(stMeta(y.f))}</small></button>`;
    const asked = nxRequested().has(fold(q).trim());
    return `<section class="st-sec" aria-labelledby="stTopH"><h3 id="stTopH" class="st-h"><span>Files on</span> ${esc(t.name)}</h3>
      <p class="cap st-cap">${cap}</p>
      ${nc ? `<div class="list">${cur.map(homeFile).join("")}</div>` : ""}
      ${na ? `${nc ? `<p class="cap st-sub">Auto pages</p>` : ""}<div class="st-list">${shownAu.map(card).join("")}</div>` : ""}
      ${na > shownAu.length ? `<button class="eu-btn eu-btn--block st-all" type="button" data-stmore="${esc(t.name)}">Show all ${na}</button>` : ""}
      ${also.length ? `<p class="cap st-also">Also matched: ${also.slice(0, 6).map((w) => `<b>${esc(w)}</b>`).join(", ")}.${na > 1 ? " Adopted files come last." : ""}</p>` : ""}
      <div class="st-ask"><span>Looking for a file that isn't here?</span><button class="eu-btn eu-btn--sm eu-btn--outline" type="button" data-nxreq="${esc(q)}"${asked ? " disabled" : ""}>${asked ? "Requested" : "Request it"}</button></div></section>`;
  }
  function stNothingHtml(q) {
    const nCur = FILES.filter((f) => !f.auto).length, nAu = (AU.list || []).length, nRp = (NX.docs || []).length, asked = nxRequested().has(fold(q).trim());
    const n = (x) => x.toLocaleString("en-GB");
    return `<section class="st-none" aria-labelledby="stNoneH"><h3 id="stNoneH" class="st-h"><span>Nothing in nodo matches</span> “${esc(nxClip(q, 40))}”</h3>
      <p class="st-none__k">Where nodo looked</p>
      <ul class="st-none__ul"><li>The ${n(nCur)} files nodo follows</li>${nAu ? `<li>${n(nAu)} files from the Legislative Observatory</li>` : ""}${nRp ? `<li>${n(nRp)} Parliament reports and opinions</li>` : ""}<li>Every MEP, Commissioner, cabinet member and Council delegation</li></ul>
      <p class="st-none__p">Try the official title, the procedure number (like 2025/0102) or a broader word.</p>
      <div class="st-none__ask"><p><b>Know the file exists?</b> Tell nodo. The most requested files get a full page first.</p>
        <button class="eu-btn ${asked ? "" : "eu-btn--brand "}eu-btn--block" type="button" data-nxreq="${esc(q)}"${asked ? " disabled" : ""}>${asked ? "Requested" + icon("check") : `Request “${esc(nxClip(q, 30))}”`}</button></div></section>`;
  }
  {
    const h0 = resultsHtml;
    resultsHtml = function (r, q) {
      let h = h0(r, q);
      const top = (r.nick ? stNickHtml(r.nick) : "") + (r.topic ? stTopicHtml(r.topic, q) : "");
      if (top) {
        const i = h.lastIndexOf('<div class="block nx-req">'); if (i >= 0) h = h.slice(0, i);
        if (/^\s*<p class="empty/.test(h)) h = "";
        return top + h;
      }
      const none = !r.fl.length && !r.com.length && !r.cab.length && !r.ep.length && !r.co.length;
      if (none && r.rp && !r.rp.length && r.af && !r.af.length && ST.data && String(q).trim().length >= 3 && !r.fixedTo) return stNothingHtml(q);
      return h;
    };
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-stmore]"); if (!b) return;
    e.preventDefault(); e.stopImmediatePropagation();
    ST.more.add(b.dataset.stmore);
    if (state.view === "home" && state.hq) renderHome();
  }, true);
