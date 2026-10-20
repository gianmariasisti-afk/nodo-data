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
        and a drawer from the right: Today, People with Parliament, Commission and Council, Calendar, Files, then News, Saved
        people and your profile card. The bar takes the masthead's deep ground on Today and the light surface elsewhere.
     6. About nodo and feedback (since 20 Oct 2026): an About view from the menu (what nodo covers, where the data comes from,
        how fresh it is, what it is not) and one inbox, feedback@nodo.eu. Send feedback in the menu, the About page and the
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

  /* Also on (since 20 Oct 2026): the other nodo files a person is named on, shown under their row on a file page and in
     On these files. It replaces the Home section "Who ties them together", which repeated the people the file pages list. */
  function edAlsoOn(key, except) {
    return FILES.filter((f) => !except.has(f.id) && (() => { const m = membersOf(f); return [...m.base, ...m.added].some((x) => x.key === key); })());
  }
  const edAlsoHtml = (key, except) => { const fs = edAlsoOn(key, except);
    return fs.length ? `<span class="ed-also">Also on ${fs.map((f) => `<b>${esc(fileTag(f))}</b>`).join(", ")}</span>` : ""; };
  /* File page rows: the live fileRow, with "Also on" added at the end of the row body (before the star or remove button). */
  const edFileRow0 = fileRow;
  fileRow = (x) => {
    const h = edFileRow0(x), f = curFile(); if (!f) return h;
    const add = edAlsoHtml(x.key, new Set([f.id])), i = h.lastIndexOf('<button class="eu-iconbtn');
    return add && i > 7 && h.slice(i - 7, i) === "</span>" ? h.slice(0, i - 7) + add + h.slice(i - 7) : h;
  };

  /* After the week on the card: four weeks of dated steps and plenary sittings, one card per week in a carousel
     (since 19 Oct 2026). A meeting on consecutive days of the same week shows once, as a range ("26–27"). */
  let edWeeks = [], edWkI = 0, edRoomAll = false;
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
        <div class="ed-wk__h"><span class="ed-wk__t">${esc(title)}</span><span class="ed-wk__c">${esc(["Week " + isoWeek(w.mon), kind].filter(Boolean).join(" · "))}</span><span class="ed-wk__c">${esc(count)}</span></div>
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
      if (i !== edWkI) { edWkI = i; edRoomAll = false; edRoomPaint(); }
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
    const shown = edRoomAll ? ppl : ppl.slice(0, 5);
    const rows = shown.map((p) => { const o = BYKEY.get(p.key).o;
      return row({ attrs: tap(`data-open="${esc(p.key)}"`), lead: avaOf(p.key), name: esc(o.name), meta: esc(edRoomRole(p)), wrap: true, extra: edAlsoHtml(p.key, new Set(ids)), tail: starBtn(p.key, o.name) }); }).join("");
    const more = ppl.length > 5 ? `<button class="ed-room__more" type="button" data-edroom="${edRoomAll ? "less" : "all"}">${edRoomAll ? "Show fewer" : `Show all ${ppl.length}`}</button>` : "";
    const note = noRap.length ? `<p class="ed-room__note">No rapporteur yet on ${esc(noRap.map((f) => f.short).join(", "))}. Parliament names one once the file reaches it.</p>` : "";
    const pres = presOf(w.mon), wps = files.flatMap((f) => ((f.council || {}).workingParties || []).map((x) => x.name));
    const council = wps.length ? `<div class="ed-room__co"><span class="ed-room__k"><i class="ed-mark ed-mark--co" aria-hidden="true"></i>Council working ${new Set(wps).size > 1 ? "parties" : "party"}</span>
      <span class="ed-room__wp">${esc([...new Set(wps)].join(" · "))}</span>
      <span class="ed-room__m">Where member states discuss ${files.length > 1 ? "these files" : "the file"}${pres ? ` · chaired by the Presidency, ${esc(countryName(pres[0]))}` : ""}</span>
      ${edAttache(files, new Set(wps).size > 1)}</div>` : "";
    const links = `<div class="ed-room__files">${files.map((f) => `<button class="eu-chip" type="button" data-file="${esc(f.id)}">Everyone on ${esc(f.short)}</button>`).join("")}</div>`;
    return `${head(cap)}${note}${rows ? `<div class="list">${rows}</div>` : ""}${more}${council}${links}`;
  }
  /* Said where the gap shows (20 Oct 2026): the attachés who cover a working party are not in nodo, because the Council
     does not publish them. The link opens "Who covers…" for the file's Council configuration, where people add names. */
  function edAttache(files, many) {
    const conf = files.map((f) => ((f.council || {}).configs || [])[0]).find((c) => c && CONF_BY[c]);
    return `<p class="ed-room__att">Attachés who cover ${many ? "these working parties" : "this working party"} aren't in nodo. The Council doesn't publish them.${conf ? ` <button class="ed-room__add" type="button" data-prwp="${esc(conf)}">Add the ones you know</button>` : ""}</p>`;
  }
  function edRoomPaint() { const el = $("edRoom"); if (!el) return; el.innerHTML = edRoomHtml(); el.hidden = !el.innerHTML.trim(); }

  function edRender() {
    if (!$("edMast")) return;
    const now = new Date();
    $("edDate").textContent = `${now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })} · Week ${isoWeek(now)}`;
    renderGreeting();
    $("edWeek").innerHTML = edWeekHtml();
    $("edFiles").innerHTML = edFilesHtml();
    const sl = $("edWks") ? $("edWks").scrollLeft : 0;
    $("edNext").innerHTML = edNextHtml(); edWksWire();
    if (edWkI >= edWeeks.length) edWkI = 0;
    if ($("edWks") && sl) $("edWks").scrollLeft = sl;
    edRoomPaint();
    ["edFiles", "edNext"].forEach((id) => { $(id).hidden = !$(id).innerHTML.trim(); });
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
      <section id="edNext" class="ed-sec" aria-label="Coming up"></section>
      <section id="edRoom" class="ed-sec ed-room" aria-label="On these files"></section>
      <h2 class="ed-h ed-browse">Browse</h2></div>`);
    $("hq").placeholder = "A name, a file, a committee, a date";
    $("edRoom").addEventListener("click", (e) => { const b = e.target.closest("[data-edroom]"); if (!b) return; edRoomAll = b.dataset.edroom === "all"; edRoomPaint(); });
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
    /* The Council's Europa building (Philippe Samyn), from Wikimedia Commons under CC BY-SA 4.0, stored in monuments/.
       The licence asks for credit, a licence link and a note that the photo was changed (cut into columns). */
    { v: "co", k: "Council of the", t: "European Union", meta: "metaCo", img: MON_BASE + "council-europa.jpg", place: "Europa building by Philippe Samyn, Brussels", r: 1, z: 1, f: 0.12,
      creditHtml: `Photo: <a href="https://commons.wikimedia.org/wiki/File:Europa_Building_in_Brussels.jpg" target="_blank" rel="noopener">Wikimedia Commons</a>, <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener">CC BY-SA 4.0</a>, cropped` },
  ];
  const ppMeta = (id) => { const el = $(id); if (!el) return ""; const kids = [...el.children].map((c) => c.textContent.trim()).filter(Boolean); return kids.length ? kids.join(" · ") : el.textContent.trim(); };
  function renderPeople() {
    const PROTOCOL = ["BE", "BG", "CZ", "DK", "DE", "EE", "IE", "EL", "ES", "FR", "HR", "IT", "CY", "LV", "LT", "LU", "HU", "MT", "NL", "AT", "PL", "PT", "RO", "SI", "SK", "FI", "SE"];
    const flagsArt = () => `<span class="pp-flags" aria-hidden="true">${PROTOCOL.map((cc, i) => { const f = FLAGS[cc] || {}, d = (i - 13) / 13;
      return `<i style="height:${Math.round(110 + 80 * (1 - d * d))}px;background:${f.bg || "var(--surface)"}"></i>`; }).join("")}</span>`;
    const photoArt = (p) => `<span class="mon pp-mon" aria-hidden="true" style="--r:${p.r};--f:${p.f || 0};--z:${p.z};--x:${((p.z - 1) / 2).toFixed(3)}">${MON_COLS.map((off, i) =>
          `<span class="mon__col" style="--off:${off}px;--i:${i}"><img src="${p.img}" alt="" decoding="async" loading="lazy"></span>`).join("")}</span>`;
    const card = (p) => `<div class="pp-wrap pp-wrap--${p.v}"><button class="pp-card pp-card--${p.v}" type="button" data-dir="${p.v}" aria-label="${esc(`${p.k} ${p.t}. ${ppMeta(p.meta)}`)}">
        ${p.flags ? flagsArt() : photoArt(p)}
        <span class="pp-band" aria-hidden="true"></span>
        <span class="pp-row"><span class="pp-tx"><span class="pp-k">${esc(p.k)}</span><span class="pp-t">${esc(p.t)}</span><span class="pp-m">${esc(ppMeta(p.meta))}</span></span>
          <span class="pp-go" aria-hidden="true">${icon("arrow")}</span></span>
        </button><p class="pp-credit">${esc(p.place)}${p.creditHtml ? " · " + p.creditHtml : p.credit ? ` · Photo: ${esc(p.credit)} / Unsplash` : ""}</p></div>`;
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
        <p class="nx-week" id="nxWeek"></p>
        <nav aria-label="Main"><ul class="nx-list">
          <li><button class="nx-item" type="button" data-view="home" data-nx="home">${NX_ICON("navHome")}Today</button></li>
          <li><div class="nx-split"><button class="nx-item" type="button" data-view="people" data-nx="people">${NX_ICON("navDir")}People</button>
              <button class="nx-tog" type="button" id="nxTog" aria-expanded="true" aria-controls="nxSub" aria-label="Parliament, Commission and Council">${NX_SVG.chev}</button></div>
            <ul class="nx-sub" id="nxSub">
              <li><button class="nx-subitem" type="button" data-dir="ep" data-nx="ep"><span class="nx-dot nx-dot--ep" aria-hidden="true"></span>Parliament</button></li>
              <li><button class="nx-subitem" type="button" data-dir="ec" data-nx="ec"><span class="nx-dot nx-dot--ec" aria-hidden="true"></span>Commission</button></li>
              <li><button class="nx-subitem" type="button" data-dir="co" data-nx="co"><span class="nx-dot nx-dot--co" aria-hidden="true"></span>Council</button></li>
            </ul></li>
          <li><button class="nx-item" type="button" data-view="cal" data-nx="cal">${NX_ICON("navCal")}Calendar</button></li>
          <li><button class="nx-item" type="button" data-view="files" data-nx="files">${NX_ICON("navFiles")}Files</button></li>
        </ul>
        <hr class="nx-rule">
        <ul class="nx-list nx-list--2">
          <li><button class="nx-subitem" type="button" data-view="news" data-nx="news">News on the files</button></li>
          <li><button class="nx-subitem" type="button" data-view="saved" data-nx="saved">Saved people</button></li>
          <li><button class="nx-subitem" type="button" data-view="about" data-nx="about">About nodo</button></li>
          <li><button class="nx-subitem" type="button" data-nx-mail>Send feedback</button></li>
        </ul></nav>
        <button class="nx-me" type="button" data-nx-me><span class="nx-me__face" id="nxFace" aria-hidden="true"></span>
          <span class="nx-me__tx"><span class="nx-me__n" id="nxName">Your profile</span><span class="nx-me__s">Profile, files you follow, countries you cover</span></span></button>
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
      const wk = weekOf(edMonday()), phrase = ED_WEEK[wk.place || wk.kind];
      $("nxWeek").textContent = `Week ${isoWeek(edMonday())}${phrase ? " · " + phrase.replace(/^an? /, "").replace(/^./, (c) => c.toUpperCase()) : ""}`;
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
      if (t.closest("[data-nx-mail]")) { nxClose(true); return nxMail("nodo feedback"); }
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
     One inbox for everything, feedback@nodo.eu. Send feedback (menu and About) and the search request card open an email
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
        <div class="ab-addr"><span>${NX_MAIL}</span><button class="eu-btn eu-btn--outline" type="button" data-abcopy>${icon("copy")}Copy</button></div>
        <p class="cap">The email opens with the screen you came from, so a fix can start right away.</p>
      </section>

      <p class="cap ab-foot">nodo · Untangle the EU<br>Portraits and texts belong to the institutions that publish them.</p>`;
  }

  document.addEventListener("click", (e) => {
    const t = e.target;
    if (t.closest("[data-abmail]")) return nxMail("nodo feedback");
    const cp = t.closest("[data-abcopy]");
    if (cp) {
      const done = () => { cp.innerHTML = icon("check") + "Copied"; toast("Address copied"); setTimeout(() => { cp.innerHTML = icon("copy") + "Copy"; }, 1800); };
      try { navigator.clipboard.writeText(NX_MAIL).then(done, () => toast(NX_MAIL)); } catch (_) { toast(NX_MAIL); }
      return;
    }
    const rq = t.closest("[data-nxreqmail]");
    if (rq) return nxMail("File request: " + rq.dataset.nxreqmail, ["I'd like nodo to follow: " + rq.dataset.nxreqmail, "Why it matters to me:"]);
  });

  /* The search request card keeps its one-tap request and adds a way to write, for anything a request can't say. */
  const nxReqBase = nxRequestCard;
  nxRequestCard = function (q, lead) {
    return nxReqBase(q, lead).replace(/<\/div>\s*$/, `<p class="cap nx-reqmail">Want to say more? <button class="linkbtn" type="button" data-nxreqmail="${esc(nxClip(q, 80))}">Write to ${NX_MAIL}</button></p></div>`);
  };
