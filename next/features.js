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

  /* ---------- Export a file's people (since 3 Nov 2026) ----------
     A "More" button (…) in a file page's top bar opens a menu with "Export people". The sheet offers Excel (.xlsx) or CSV
     (semicolons, UTF-8 with BOM, for European Excel and CRMs) and three switches: people you added (on), published email
     addresses (on: MEPs' from the Parliament, cabinet staff's from the Commission team pages; Commissioners have none) and
     committee speakers (off). The export follows the person's own list: hidden people stay out.
     The file is built on the device (a small built-in .xlsx writer, no library) and handed to the share sheet where the
     browser can share files (iPhone, Android), otherwise downloaded. Nothing is uploaded; one "export" event is logged with
     the file id and format only. Every export carries its date and sources: a footer in CSV, an "About this export" tab in Excel. */
  const XP = { fmt: "xlsx", mine: true, mail: true, speak: false };
  const XP_SVG = {
    more: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.8" fill="currentColor"/><circle cx="12" cy="12" r="1.8" fill="currentColor"/><circle cx="19" cy="12" r="1.8" fill="currentColor"/></svg>',
    dl: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>',
  };
  const xpEpUrl = (o) => {
    if (!/^\d+$/.test(String(o.id))) return "";
    const slug = [o.given, o.family].filter(Boolean).join(" ").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z\- ]/g, "").trim().toUpperCase().replace(/ +/g, "+");
    return `https://www.europarl.europa.eu/meps/en/${encodeURIComponent(o.id)}/${slug || "MEP"}/`;
  };
  const xpSource = (b) => (b === "press" ? "Press" : b === "ep-open-data" ? "EP Open Data Portal" : b === "ep-procedure-file" ? "Legislative Observatory" : "nodo");
  function xpRows(f, o) {
    const m = membersOf(f), list = [...m.base, ...(o.mine ? m.added : [])], seen = new Set(), rows = [];
    const order = (x) => { const t = BYKEY.get(x.key).t; return t === "ep" ? 0 : t === "ec" ? 1 : 2; };
    list.slice().sort((a, b) => order(a) - order(b)).forEach((x) => {
      if (seen.has(x.key)) return; seen.add(x.key);
      const e = BYKEY.get(x.key), p = e.o, mine = !!x.mine;
      if (e.t === "ep") rows.push({ name: p.name, inst: "Parliament", role: mine ? "Added by you" : ROLE_ONE[x.role] || "", cmte: x.cmte || (p.committees || []).map((c) => c.abbr).filter(Boolean).join(", "),
        pos: "Member of the European Parliament", group: p.group || "", party: p.party || "", country: countryName(p.country), email: p.email || "", url: xpEpUrl(p), src: mine ? "Your list" : xpSource(x.basis) });
      else if (e.t === "ec") rows.push({ name: p.name, inst: "Commission", role: mine ? "Added by you" : x.role === "lead" ? "Lead Commissioner" : "Associated Commissioner", cmte: (p.portfolio || []).join("; "),
        pos: p.title || "", group: "", party: "", country: countryName(p.country), email: "", url: "", src: mine ? "Your list" : "Commission team pages" });
      else rows.push({ name: p.name, inst: "Commission", role: mine ? "Added by you" : x.why || "Cabinet staff", cmte: "Cabinet of " + p.com.name,
        pos: p.role || "", group: "", party: "", country: "", email: p.email || "", url: "", src: mine ? "Your list" : "Commission team pages" });
    });
    if (o.speak) mnVoices(f).forEach((s) => {
      const p = BYKEY.get(s.key).o;
      rows.push({ name: p.name, inst: "Parliament", role: "Spoke in committee: " + (s.dates || []).slice().sort().join(", "), cmte: (p.committees || []).map((c) => c.abbr).filter(Boolean).join(", "),
        pos: "Member of the European Parliament", group: p.group || "", party: p.party || "", country: countryName(p.country), email: p.email || "", url: xpEpUrl(p), src: "Committee minutes" });
    });
    return rows;
  }
  function xpCols(o) {
    return [["Name", "name", 26], ["Institution", "inst", 12], ["Role on file", "role", 24], ["Committee or portfolio", "cmte", 28], ["Position", "pos", 30],
      ["Political group", "group", 14], ["National party", "party", 24], ["Country", "country", 14],
      ...(o.mail ? [["Published email", "email", 32]] : []), ["Official profile", "url", 44], ["Source", "src", 22]];
  }
  function xpAbout(f, o, n) {
    const d = new Date(), day = d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
    return [
      [`People on ${f.short}`], [f.title && f.title !== f.short ? f.title : ""], [f.procedure ? "Procedure " + f.procedure : ""], [""],
      [`Exported from nodo on ${day}: ${n} ${pl(n, "person", "people")}, as on your list in the app.`],
      ["Public sources: the Legislative Observatory, the European Parliament's Open Data Portal and MEP pages, the Commission's team pages" + (o.speak ? ", committee minutes" : "") + "."],
      ["Emails are included only where the institution publishes one. Commissioners have none listed."],
      ["Roles change. Check before you rely on this list."],
      [o.mine ? 'Rows marked "Added by you" are your own additions.' : "People you added are not included."],
      ["nodo built this file on your device and keeps no copy."],
    ].filter((r, i) => r[0] || i === 3);
  }
  /* --- a minimal .xlsx writer: two sheets of inline strings, bold header, frozen first row, column widths --- */
  const xpCrcT = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const xpCrc = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = xpCrcT[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  function xpZip(files) {
    const enc = new TextEncoder(), parts = [], cen = []; let off = 0;
    const u16 = (v) => [v & 255, (v >>> 8) & 255], u32 = (v) => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255];
    files.forEach(([name, text]) => {
      const nb = enc.encode(name), db = enc.encode(text), crc = xpCrc(db);
      const head = [...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(db.length), ...u32(db.length), ...u16(nb.length), ...u16(0)];
      const loc = new Uint8Array([...u32(0x04034b50), ...head]);
      parts.push(loc, nb, db);
      cen.push(new Uint8Array([...u32(0x02014b50), ...u16(20), ...head, ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(off)]), nb);
      off += loc.length + nb.length + db.length;
    });
    const cs = cen.reduce((a, b) => a + b.length, 0);
    const end = new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(cs), ...u32(off), ...u16(0)]);
    return new Blob([...parts, ...cen, end], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  }
  const xpX = (s) => String(s == null ? "" : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const xpColL = (i) => { let s = ""; i++; while (i) { const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); } return s; };
  function xpSheet(rows, widths, head) {
    const cell = (v, r, c, st) => `<c r="${xpColL(c)}${r}" t="inlineStr"${st ? ` s="${st}"` : ""}><is><t xml:space="preserve">${xpX(v)}</t></is></c>`;
    const data = rows.map((row, r) => `<row r="${r + 1}">${row.map((v, c) => cell(v, r + 1, c, head && r === 0 ? 1 : 0)).join("")}</row>`).join("");
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`
      + (head ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` : "")
      + `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols><sheetData>${data}</sheetData>`
      + (head && rows.length > 1 ? `<autoFilter ref="A1:${xpColL(rows[0].length - 1)}${rows.length}"/>` : "") + `</worksheet>`;
  }
  function xpXlsx(sheets) {
    const ns = "http://schemas.openxmlformats.org/", files = [
      ["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="${ns}package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`],
      ["_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${ns}package/2006/relationships"><Relationship Id="rId1" Type="${ns}officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
      ["xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="${ns}spreadsheetml/2006/main" xmlns:r="${ns}officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${xpX(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets>${sheets[0].head && sheets[0].rows.length > 1 ? `<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'${xpX(sheets[0].name).replace(/'/g, "''")}'!$A$1:$${xpColL(sheets[0].rows[0].length - 1)}$${sheets[0].rows.length}</definedName></definedNames>` : ""}</workbook>`],
      ["xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${ns}package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${ns}officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${sheets.length + 1}" Type="${ns}officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
      ["xl/styles.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="${ns}spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>`],
      ...sheets.map((s, i) => [`xl/worksheets/sheet${i + 1}.xml`, xpSheet(s.rows, s.widths, s.head)]),
    ];
    return xpZip(files);
  }
  function xpCsv(rows) {
    const q = (v) => { const s = String(v == null ? "" : v); return /[";\r\n]/.test(s) || /^[=+\-@]/.test(s) ? `"${(/^[=+\-@]/.test(s) ? "'" : "") + s.replace(/"/g, '""')}"` : s; };
    return new Blob(["﻿" + rows.map((r) => r.map(q).join(";")).join("\r\n") + "\r\n"], { type: "text/csv;charset=utf-8" });
  }
  const xpName = (f, ext) => `nodo - ${String(f.short).replace(/[\\/:*?"<>|]+/g, " ").trim()} - people - ${new Date().toISOString().slice(0, 10)}.${ext}`;
  function xpBuild(f, o) {
    const rows = xpRows(f, o), cols = xpCols(o), table = [cols.map((c) => c[0]), ...rows.map((r) => cols.map((c) => r[c[1]]))], about = xpAbout(f, o, rows.length);
    if (o.fmt === "csv") return { n: rows.length, blob: xpCsv([...table, [], ...about]), name: xpName(f, "csv") };
    return { n: rows.length, name: xpName(f, "xlsx"), blob: xpXlsx([
      { name: "People", rows: table, widths: cols.map((c) => c[2]), head: true },
      { name: "About this export", rows: about, widths: [110], head: false }]) };
  }
  async function xpDeliver(out) {
    const file = new File([out.blob], out.name, { type: out.blob.type });
    if (navigator.canShare && navigator.share) {
      try { if (navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: out.name }); return "shared"; } }
      catch (err) { if (err && err.name === "AbortError") return "cancelled"; }
    }
    const u = URL.createObjectURL(out.blob), a = document.createElement("a");
    a.href = u; a.download = out.name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 4000);
    return "downloaded";
  }
  /* the count on the button follows the switches */
  const xpCount = (f) => xpRows(f, XP).length;
  function xpOpen(id) {
    const f = FILE_BY[id]; if (!f) return;
    state.sheet = "xp:" + id;
    if ($("sheet").hidden) layer.sheet = document.activeElement;
    const m = membersOf(f), nAdd = m.added.length, nSpk = mnVoices(f).length, n = xpCount(f);
    const fmt = (k, t, s) => `<label class="pe-fto xp-fmt"><input type="radio" name="xpfmt" value="${k}" data-xpfmt${XP.fmt === k ? " checked" : ""}><span><b>${t}</b><small>${s}</small></span></label>`;
    const sw = (k, t, s, dis) => `<div class="yu-set xp-set${dis ? " is-off" : ""}"><span class="yu-set__tx" id="xpL-${k}"><b>${t}</b><span>${s}</span></span>
      <button class="nx-switch" type="button" role="switch" data-xpsw="${k}" aria-checked="${!!XP[k] && !dis}" aria-labelledby="xpL-${k}"${dis ? " disabled" : ""}></button></div>`;
    $("sheet").innerHTML = `<div class="sheet__bar"><button class="eu-iconbtn eu-iconbtn--sm" type="button" data-sheet-close aria-label="Close">${icon("x")}</button></div>
      <div class="top"><div class="top__tx"><h2 id="sName">Export people</h2><div class="cap">${esc(f.short)} · your list</div></div></div>
      <fieldset class="xp-grp"><legend class="xp-lg">Format</legend>
        ${fmt("xlsx", "Excel (.xlsx)", "Excel, Numbers, Google Sheets. Best for briefings")}
        ${fmt("csv", "CSV", "Semicolon-separated, for European Excel and CRMs")}</fieldset>
      <div class="xp-grp"><h3 class="xp-lg">Include</h3>
        ${sw("mine", "People you added", nAdd ? `${nAdd} ${pl(nAdd, "person", "people")}, marked as yours in the file` : "You haven't added anyone to this file", !nAdd)}
        ${sw("mail", "Published email addresses", "Only where the institution publishes one")}
        ${sw("speak", "Committee speakers", nSpk ? `${nSpk} MEPs with no role who spoke on this file, with the dates` : "Nobody listed for this file yet", !nSpk)}</div>
      <p class="xp-note">The file is made on your device. nodo keeps no copy. Data from public sources, as of today.</p>
      <button class="eu-btn eu-btn--brand eu-btn--block xp-go" type="button" data-xpgo="${esc(f.id)}"${n ? "" : " disabled"}>${XP_SVG.dl}<span id="xpGoT">${n ? `Export ${n} ${pl(n, "person", "people")}` : "Nobody to export"}</span></button>`;
    $("scrim").hidden = false; $("sheet").hidden = false; $("sheet").scrollTop = 0;
    syncLayers();
    $("sheet").querySelector("[data-sheet-close]").focus({ preventScroll: true });
  }
  function xpSyncGo(f) {
    const n = xpCount(f), b = $("sheet").querySelector("[data-xpgo]"), t = $("xpGoT"); if (!b || !t) return;
    b.disabled = !n; t.textContent = n ? `Export ${n} ${pl(n, "person", "people")}` : "Nobody to export";
  }
  /* the "More" button and its menu in a file's top bar */
  const xpOpen0 = openFile;
  openFile = function (id, keep, startTab) {
    xpOpen0(id, keep, startTab);
    const p = $("profileBody"), tbr = p && p.querySelector(":scope > .tb .tbr"); if (!tbr || tbr.querySelector("[data-xpmore]")) return;
    tbr.insertAdjacentHTML("beforeend", `<span class="xp-wrap"><button class="eu-iconbtn xp-more" type="button" data-xpmore aria-label="More actions" aria-haspopup="menu" aria-expanded="false" aria-controls="xpMenu">${XP_SVG.more}</button>
      <span class="xp-menu" id="xpMenu" role="menu" hidden><button class="xp-mi" type="button" role="menuitem" data-xpopen="${esc(id)}">${XP_SVG.dl}Export people</button></span></span>`);
  };
  const xpMenu = (open) => { const m = $("xpMenu"), b = document.querySelector("[data-xpmore]"); if (!m || !b) return; m.hidden = !open; b.setAttribute("aria-expanded", String(open)); if (open) m.querySelector("button").focus({ preventScroll: true }); };
  document.addEventListener("click", (e) => {
    const t = e.target, mo = t.closest("[data-xpmore]"), op = t.closest("[data-xpopen]");
    if (mo) { e.preventDefault(); e.stopImmediatePropagation(); return xpMenu($("xpMenu").hidden); }
    if (op) { e.preventDefault(); e.stopImmediatePropagation(); xpMenu(false); return xpOpen(op.dataset.xpopen); }
    if ($("xpMenu") && !$("xpMenu").hidden && !t.closest("#xpMenu")) xpMenu(false);
    const f = state.sheet && state.sheet.startsWith("xp:") ? FILE_BY[state.sheet.slice(3)] : null; if (!f) return;
    const sw = t.closest("[data-xpsw]"), go = t.closest("[data-xpgo]");
    if (sw && !sw.disabled) { e.preventDefault(); e.stopImmediatePropagation(); const k = sw.dataset.xpsw; XP[k] = !XP[k]; sw.setAttribute("aria-checked", String(XP[k])); return xpSyncGo(f); }
    if (go && !go.disabled) {
      e.preventDefault(); e.stopImmediatePropagation();
      const o = { ...XP, mine: XP.mine && membersOf(f).added.length > 0, speak: XP.speak && mnVoices(f).length > 0 };
      let out; try { out = xpBuild(f, o); } catch { return toast("The export failed. Try again."); }
      xpDeliver(out).then((how) => {
        if (how === "cancelled") return;
        closeSheet();
        Track.log("export", { section: o.fmt, item: f.id, results: out.n });
        toast(how === "shared" ? "Export ready" : `Saved ${out.name}`, 2600);
      });
    }
  }, true);
  document.addEventListener("change", (e) => { const r = e.target.closest && e.target.closest("[data-xpfmt]"); if (r) XP.fmt = r.value; }, true);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && $("xpMenu") && !$("xpMenu").hidden) { e.stopImmediatePropagation(); xpMenu(false); document.querySelector("[data-xpmore]").focus(); } }, true);
