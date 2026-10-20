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
          <li><button class="nx-subitem" type="button" data-view="about" data-nx="about">About nodo</button></li>
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
  /* The Files view opens on the files themselves. Three views under one switch:
     - Line: the five stages from idea to law as a vertical line, each file hanging off its stage, with a one-line status,
       the next step and a star to follow it. An empty stage says so. "Any other file" search sits under the line.
     - Next up: every dated step on nodo's files, soonest first, by week and then by month; files with no date set listed apart.
     - Following: the files you follow with their track, then the Monday email and alert switches, which only concern them.
     News and Map become two small buttons beside the count. The "Choose the files you track" block and the empty-state
     text above the list are gone: the star on each file is how you follow it. This override runs last and replaces the
     body the earlier Files overrides built. */
  const FL_STATION = ["Pre-proposal", "Positions in preparation", "Council negotiating box", "Trilogue", "In force"];
  const FL_SVG = {
    news: '<svg class="eu-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 9h8M8 13h8M8 17h5"/></svg>',
    map: '<svg class="eu-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.3 10.8l7.4-3.6M8.3 13.2l7.4 3.6"/></svg>',
    plus: '<svg class="eu-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  };
  const flNext = (f) => { const t = todayIso(), xs = f.next || [];
    return xs.filter((s) => s.date && s.date >= t).sort((a, b) => (a.date < b.date ? -1 : 1))[0] || xs.find((s) => !s.date) || null; };
  const flSoon = (s) => !!(s && s.date && s.date <= isoD(addD(new Date(), 7)));
  const flDay = (iso) => fmtD(fromIso(iso), { weekday: "short", day: "numeric", month: "short" });
  /* The card line: an optional short "lede" in files.json, else the status without its opening "Proposed on …" sentence. */
  function flStatus(f) {
    if (f.lede) return f.lede;
    const xs = String(f.status || "").split(/(?<=[.;])\s+(?=[A-Z])/);
    if (xs.length > 1 && /^(Proposed|The Commission proposed)\b/.test(xs[0])) xs.shift();
    return nxClip(xs.join(" "), 120);
  }
  function flMeta(f) {
    const c = countsOf(f), lead = (f.ep && f.ep.lead) || [];
    return [lead.join(" · "), `${c.ep} ${pl(c.ep, "MEP", "MEPs")}`].filter(Boolean).join(" · ");
  }
  function flNextLine(f) {
    const s = flNext(f);
    if (!s) return `<span class="fl-next"><i class="fl-dot fl-dot--none" aria-hidden="true"></i><span>No next step recorded</span></span>`;
    return `<span class="fl-next"><i class="fl-dot${flSoon(s) ? " fl-dot--soon" : s.date ? "" : " fl-dot--none"}" aria-hidden="true"></i>
      <span><b>${s.date ? esc(flDay(s.date)) : "No date set"}</b> · ${esc(s.what)}</span></span>`;
  }
  function flCard(f, track) {
    const at = ED_STAGE.indexOf(f.stage);
    return `<article class="fl-card">
      <div class="fl-card__top">
        <button class="fl-card__open" type="button" data-file="${esc(f.id)}">
          ${track ? `<span class="fl-card__stage">${esc(FL_STATION[at] || (STAGE[f.stage] || [f.stage])[0])} · ${at + 1} of 5</span>` : ""}
          <span class="fl-card__n">${esc(f.short)}</span>
          <span class="fl-card__m">${esc(flMeta(f))}</span>
        </button>
        ${followBtn(f.id, f.short)}
      </div>
      ${track ? edTrack(f) : ""}
      ${f.status || f.lede ? `<p class="fl-card__s">${esc(flStatus(f))}</p>` : ""}
      <button class="fl-card__nx" type="button" data-file="${esc(f.id)}" data-filetab="next">${flNextLine(f)}</button>
    </article>`;
  }
  function flLine() {
    const by = ED_STAGE.map((st) => FILES.filter((f) => f.stage === st));
    const other = FILES.filter((f) => !ED_STAGE.includes(f.stage));
    return `<p class="cap fl-lead">From first idea to law in force. Tap the star on a file to follow it.</p>
      <ol class="fl-line">${ED_STAGE.map((st, i) => { const xs = by[i];
        return `<li class="fl-st${xs.length ? "" : " is-empty"}"><h3 class="fl-st__h"><i class="fl-st__node" aria-hidden="true"></i>${esc(FL_STATION[i])} <small>${xs.length ? `${xs.length} ${pl(xs.length, "file", "files")}` : ""}</small></h3>
          ${xs.length ? xs.map((f) => flCard(f, false)).join("") : `<p class="cap fl-st__none">No file at this stage right now.</p>`}</li>`; }).join("")}
        ${other.length ? `<li class="fl-st"><h3 class="fl-st__h"><i class="fl-st__node" aria-hidden="true"></i>Other <small>${other.length}</small></h3>${other.map((f) => flCard(f, false)).join("")}</li>` : ""}
      </ol>
      <section class="nx-any" aria-labelledby="nxAnyH">
        <h3 id="nxAnyH">Any other file</h3>
        <p class="cap nx-sub">Search every Parliament report and opinion in nodo: who the rapporteur and the shadows are.</p>
        <label class="eu-search">${icon("search")}<input id="nxdq" type="search" placeholder="A file, an acronym or a committee" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Search Parliament reports and opinions" value="${esc(NX.dq || "")}"></label>
        <div id="nxdres" aria-live="polite">${nxAnyHtml(NX.dq || "")}</div></section>`;
  }
  function flNextUp() {
    const t = new Date(), tIso = todayIso(), mon = mondayOf(t), sun = isoD(addD(mon, 6)), sun2 = isoD(addD(mon, 13));
    const steps = edSteps(FILES, tIso, "9999-12-31"), groups = [];
    const put = (k, label, now, s) => { let g = groups.find((x) => x.k === k); if (!g) groups.push((g = { k, label, now, xs: [] })); g.xs.push(s); };
    steps.forEach((s) => {
      if (s.date <= sun) put("w0", "This week", true, s);
      else if (s.date <= sun2) put("w1", "Next week", false, s);
      else { const d = fromIso(s.date); put(s.date.slice(0, 7), fmtD(d, d.getFullYear() === t.getFullYear() ? { month: "long" } : { month: "long", year: "numeric" }), false, s); }
    });
    const item = (s) => { const d = fromIso(s.date), f = s.files[0];
      return `<button class="fl-ev" type="button" data-file="${esc(f.id)}" data-filetab="next">
        <span class="fl-ev__d"><span>${esc(fmtD(d, { weekday: "short" }))}</span><b>${d.getDate()}</b><span>${esc(fmtD(d, { month: "short" }))}</span></span>
        <span class="fl-ev__tx"><span class="fl-ev__f">${esc(s.files.map((x) => x.short).join(" · "))}</span><span class="fl-ev__w">${esc(s.what)}</span></span></button>`; };
    const undated = [];
    FILES.forEach((f) => (f.next || []).forEach((s) => { if (!s.date) undated.push({ f, what: s.what }); }));
    return `<p class="cap fl-lead">Every dated step on nodo's ${FILES.length} files, soonest first. Today is ${esc(fmtD(t, { weekday: "short", day: "numeric", month: "short" }))}.</p>
      ${groups.length ? groups.map((g) => `<section class="fl-wk"><h3>${g.now ? `<i class="fl-dot fl-dot--soon" aria-hidden="true"></i>` : ""}${esc(g.label)} <small>${g.xs.length}</small></h3>${g.xs.map(item).join("")}</section>`).join("")
        : `<div class="hint"><span>No dated step on nodo's files yet.</span></div>`}
      ${undated.length ? `<section class="fl-wk"><h3>No date set yet <small>${undated.length}</small></h3><div class="fl-und">${undated.map((u) =>
        `<button class="fl-und__r" type="button" data-file="${esc(u.f.id)}" data-filetab="next"><b>${esc(u.f.short)}</b><span>${esc(nxClip(u.what.replace(/:\s*no dates? set yet$/i, ""), 60))}</span></button>`).join("")}</div></section>` : ""}
      <p class="foot">A date appears only when an official source ties it to the file.</p>`;
  }
  function flFollowing() {
    const fol = followedFiles();
    return `${fol.length ? fol.map((f) => flCard(f, true)).join("")
        : `<div class="hint"><span>You follow no file yet. Tap the star on a file in Line or Next up, and it comes here.</span></div>
           <button class="eu-btn eu-btn--block" type="button" data-nxpick>${icon("star")}Choose from the list</button>`}
      ${fol.length ? `<button class="fl-more" type="button" data-fview="line">${FL_SVG.plus}Follow more files</button>` : ""}
      <section class="block nx-notify fl-notify" aria-label="What nodo sends you">${nxSwitch("weekly", "Monday email", fol.length ? `What moved on ${fol.length === 1 ? "this file" : `these ${fol.length} files`} last week` : "What moved on your files last week")}${nxSwitch("alerts", "Same-day alerts", "When a stage or a date changes")}
        <p class="cap">${esc((state.profile && state.profile.email) || "Your sign-in email")} · Testing: nothing is sent yet.</p>
        ${fol.length ? `<button class="eu-btn eu-btn--outline eu-btn--block" type="button" data-nxweek>${icon("mail")}Preview your Monday email</button>` : ""}</section>`;
  }
  const flFilesViewBase = renderFilesView;
  renderFilesView = function () {
    flFilesViewBase();
    if (!FILES.length) return;
    const v = ["line", "next", "following"].includes(state.fview) ? state.fview : "line", n = state.follow.size;
    const checked = FILES.map((f) => f.checked).filter(Boolean).sort()[0] || (DATA.fl && DATA.fl.asOf);
    $("filesCount").hidden = true;
    const tab = (k, label, extra) => `<button class="fl-tab" type="button" role="tab" id="flTab-${k}" aria-controls="flPanel" aria-selected="${v === k}" tabindex="${v === k ? 0 : -1}" data-fview="${k}">${label}${extra || ""}</button>`;
    $("filesBody").innerHTML = `<div class="fl-top"><p class="cap">${FILES.length} files${checked ? ` · statuses checked ${esc(fdDate(checked))}` : ""}</p>
        <span class="fl-top__acts"><button class="fl-pill" type="button" data-view="news">${FL_SVG.news}News</button><button class="fl-pill" type="button" data-edmap="">${FL_SVG.map}Map</button></span></div>
      <div class="fl-tabs" role="tablist" aria-label="Files views">${tab("line", "Line")}${tab("next", "Next up")}${tab("following", "Following", `<span class="fl-count">${n}</span>`)}</div>
      <div id="flPanel" role="tabpanel" aria-labelledby="flTab-${v}" class="fl-panel">${v === "next" ? flNextUp() : v === "following" ? flFollowing() : flLine()}</div>
      <p class="foot">Names marked Verified come from the Parliament's open data or its Legislative Observatory procedure files. Names marked From press are taken from published reporting and need a check in the Parliament's procedure file before external use.</p>`;
  };
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-fview]"); if (!b) return;
    state.fview = b.dataset.fview; renderFilesView();
    const now = document.querySelector(`.fl-tab[data-fview="${state.fview}"]`);
    /* Keep focus on the switch after a tab press (the old button is gone); from "Follow more files", go back to the top. */
    if (now && b.classList.contains("fl-tab")) now.focus({ preventScroll: true, focusVisible: false });
    if (now && b.classList.contains("fl-more")) { $("filesBody").scrollIntoView({ block: "start" }); now.focus({ preventScroll: true }); }
    Track.log("view", { section: "files-" + state.fview });
  });
  document.addEventListener("keydown", (e) => {
    const t = e.target.closest && e.target.closest(".fl-tab"); if (!t || (e.key !== "ArrowRight" && e.key !== "ArrowLeft")) return;
    const ks = ["line", "next", "following"], i = ks.indexOf(t.dataset.fview), k = ks[(i + (e.key === "ArrowRight" ? 1 : 2)) % 3];
    e.preventDefault(); document.querySelector(`.fl-tab[data-fview="${k}"]`).click();
  });


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
