  /* ======================= nodo preview features =======================
     Source: next/features.js. tools/preview/build.mjs injects this file into the app's main script just before
     start-up, so it runs inside the same scope and uses the app's own helpers. Nothing here reaches the live app
     until it is promoted (tools/preview/promote.mjs). Everything up to 2026-11-18 was promoted on 2026-11-18. */

  /* ---------- How the committee voted (preview, since 25 Nov 2026) ----------
     From v1/committee-votes.json (scripts/build-committee-votes.mjs): the final roll-call vote in the committee
     responsible, read from the report's Word file on the Open Data Portal, only when the names add up to the result.
     File page: a card under "Dates and updates on this file" with the result, one row per group (tap for the names),
     the report as source. Profiles: "Committee votes", how this MEP voted on nodo's files, followed files first. */
  let CV = null;
  const CV_GROUPS = [["EPP", "epp"], ["S&D", "sd"], ["PfE", "pfe"], ["ECR", "ecr"], ["Renew", "renew"], ["Greens/EFA", "greens"], ["The Left", "left"], ["ESN", "esn"], ["NI", "ni"]];
  const CV_WORD = { f: "For", a: "Against", x: "Abstained" };
  const cvOpenGroups = new Set();
  const cvFor = (f) => (CV && CV.files && CV.files[f.id]) || [];
  const cvDay = (iso) => fmtIso(iso, { day: "numeric", month: "short", year: "numeric" });
  function cvCard(f, e, n) {
    const r = e.result, max = Math.max(1, ...Object.values(e.groups).map((t) => t[0] + t[1] + t[2]));
    const adopted = r.for > r.against;
    const seg = (k, v) => (v ? `<i class="cv-s cv-s--${k}" style="flex:${v}"></i>` : "");
    const names = (g, v) => Object.entries(e.votes).filter(([id, x]) => x === v && BYKEY.has("ep:" + id) && BYKEY.get("ep:" + id).o.group === g)
      .map(([id]) => BYKEY.get("ep:" + id).o).sort((a, b) => (a.family || a.name).localeCompare(b.family || b.name));
    const rows = CV_GROUPS.filter(([g]) => e.groups[g]).map(([g, cls]) => {
      const t = e.groups[g], k = e.id + "|" + g, open = cvOpenGroups.has(k);
      /* names under each vote, by today's group; a voter who has changed group since is counted, not named, here */
      const lists = ["f", "a", "x"].map((v, i) => {
        const L = names(g, v); if (!t[i]) return "";
        return `<div class="cv-names"><b class="cv-v cv-v--${v}">${CV_WORD[v]} ${t[i]}</b>${L.map((o) => `<button type="button" class="cv-name" data-open="${esc(o.key)}">${esc(o.name)}</button>`).join("")}${L.length < t[i] ? `<span class="cv-more">${t[i] - L.length} now in another group</span>` : ""}</div>`;
      }).join("");
      return `<li><details class="cv-g" data-cvg="${esc(k)}"${open ? " open" : ""}><summary>
          <span class="cv-gn"><i class="cv-dot" style="background:var(--grp-${cls})" aria-hidden="true"></i>${esc(g)}</span>
          <span class="cv-gbar" aria-hidden="true">${seg("f", t[0])}${seg("a", t[1])}${seg("x", t[2])}<i style="flex:${max - t[0] - t[1] - t[2]}"></i></span>
          <span class="cv-gt" aria-label="${esc(`${t[0]} for, ${t[1]} against, ${t[2]} ${pl(t[2], "abstention", "abstentions")}`)}">${t[0]} · ${t[1]} · ${t[2]}</span>
          ${icon("down")}</summary>${lists}</details></li>`;
    }).join("");
    const split = CV_GROUPS.map(([g]) => g).filter((g) => e.groups[g] && e.groups[g].filter(Boolean).length > 1);
    return `<section class="cv-card" aria-labelledby="cvH${n}">
      <div class="pr-head"><h3 id="cvH${n}">How the committee voted</h3><small>${esc(e.committee)} · ${esc(cvDay(e.date))}</small></div>
      <div class="cv-res${adopted ? "" : " cv-res--no"}"><span class="cv-ov">${adopted ? "Report adopted" : "Report rejected"}</span>
        <span class="cv-num"><b>${r.for}–${r.against}–${r.abstention}</b><span>for, against, ${pl(r.abstention, "abstention", "abstentions")}</span></span></div>
      <div class="cv-bar" role="img" aria-label="${esc(`${r.for} for, ${r.against} against, ${r.abstention} ${pl(r.abstention, "abstention", "abstentions")}`)}">${seg("f", r.for)}${seg("a", r.against)}${seg("x", r.abstention)}</div>
      <ul class="cv-key" aria-hidden="true"><li><i class="cv-s--f"></i>For</li><li><i class="cv-s--a"></i>Against</li><li><i class="cv-s--x"></i>Abstained</li></ul>
      <ul class="cv-groups">${rows}</ul>
      <p class="cv-foot">${split.length ? `${esc(split.join(" and "))} split. ` : ""}Tap a group for the names. From the final roll-call vote in ${esc(e.committee)}, report <a href="${esc(e.url)}" target="_blank" rel="noopener">${esc(e.label || e.id)}<span class="sr"> (opens the report)</span></a>.</p>
    </section>`;
  }
  const cvOpen0 = openFile;
  openFile = function (id, keep, startTab) {
    cvOpen0(id, keep, startTab);
    const f = FILE_BY[id], p = $("profile"); if (!f || !p || state.open !== "file:" + id) return;
    p.querySelectorAll(".cv-card").forEach((x) => x.remove());
    const xs = cvFor(f); if (!xs.length) return;
    const at = p.querySelector(".fp-cal") || p.querySelector(".stats");
    if (at) at.insertAdjacentHTML("afterend", xs.map((e, i) => cvCard(f, e, i)).join(""));
  };
  document.addEventListener("toggle", (e) => {
    const d = e.target; if (!d.matches || !d.matches(".cv-g")) return;
    const k = d.dataset.cvg; d.open ? cvOpenGroups.add(k) : cvOpenGroups.delete(k);
    if (d.open) { const f = curFile(); Track.log("cv_group", { section: f ? f.id : null, item: k.split("|")[1] }); }
  }, true);
  /* Profiles: how this MEP voted, after "On these files" (and "Spoke in committee" when there is one). */
  const cvFileLinks0 = fileLinks;
  fileLinks = (key) => {
    const base = cvFileLinks0(key);
    if (!CV || !String(key).startsWith("ep:")) return base;
    const id = key.slice(3);
    const L = FILES.flatMap((f) => cvFor(f).filter((e) => e.votes[id]).map((e) => ({ f, e, v: e.votes[id] })))
      .sort((a, b) => (state.follow.has(b.f.id) - state.follow.has(a.f.id)) || b.e.date.localeCompare(a.e.date));
    if (!L.length) return base;
    return base + `<h3>Committee votes <small>${L.length}</small></h3>
      <div class="list">${L.map(({ f, e, v }) => row({ el: "button", attrs: `type="button" data-file="${esc(f.id)}"`, lead: disc("file"), name: esc(f.short), wrap: true,
        meta: esc(`${e.committee} final vote, ${cvDay(e.date)}`), tail: `<span class="cv-v cv-v--${v}">${CV_WORD[v]}</span>` })).join("")}</div>`;
  };
  fetchJson(DATA_BASE + "committee-votes.json").then((j) => {
    CV = j;
    const f = curFile(); if (f) openFile(f.id, true);
  }).catch(() => { /* no votes file: pages work without it */ });
