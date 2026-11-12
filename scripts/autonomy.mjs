/* Autonomy policy: which detected changes go live without a human, and the log of what did.

   Tier 1 (applied automatically, logged): a small set of ordinary cabinet changes; Latest developments items
   from an EU institution's own page that do not change a file's stage (since 10 Nov 2026).
   Tier 2 (applied automatically after a double check, logged; since 12 Nov 2026): senior cabinet roles and the
   President's cabinet, when a run on a later day finds the same change again; press reporting and stage changes
   in Latest developments, when a second listed source states the same fact or a later run verifies the item again.
   Tier 3 (wait for Gianmaria): who sits in the College, and any large batch.
   The rule is all-or-nothing per run: if one change in the batch waits, the whole batch waits,
   so the review branch never has to be reconciled with a half-applied proposal.

   Every automatic application is appended to data-cache/autonomy-log.json, which status.json and the
   weekday check read, so each one can be seen and reverted. */
import fs from "node:fs/promises";
import path from "node:path";

export const POLICY = {
  commission: {
    maxChanges: 5, // more than this in one run looks like a reshuffle or a parser problem
    autoTypes: ["role", "added", "removed"],
  },
};

/* Senior cabinet roles. "Assistant to the Head of Cabinet" is not senior; "Cabinet Expert / Acting Deputy Head of Cabinet" is. */
export const isSeniorRole = (role) => {
  const r = String(role || "");
  if (/\bassistant\b/i.test(r)) return false;
  return /(^|\/\s*)(acting\s+)?(deputy\s+)?head of cabinet\b/i.test(r) || /director of coordination/i.test(r);
};

/* One stable key per structural change, so a later run can recognise the same change. */
export const changeKey = (c) => [c.type, c.commissioner || c.slug || "", c.name || "", c.type === "role" ? `${c.from}>${c.to}` : c.role || ""].join("|").toLowerCase();

/* Returns { auto, reasons: [why it waits], confirming: [changes seen once], pending: [{ key, firstSeen }], decision }
   for a list of Commission structural changes.
   - Ordinary changes apply at once.
   - A senior role, or any change opts.alwaysConfirm(c) names (the President's cabinet), applies only when
     opts.pending holds the same change first seen on an earlier day: two runs on different days read it the same.
   - A change to the College, or more than maxChanges in one run, waits for a person (decision: true).
   `pending` is what the next run must be given. */
export function classifyCommission(changes, policy = POLICY.commission, opts = {}) {
  const today = opts.today || new Date().toISOString().slice(0, 10);
  const seen = new Map((opts.pending || []).map((p) => [p.key, p.firstSeen]));
  const reasons = [], confirming = [], pending = [];
  let decision = false;
  if (!changes.length) return { auto: false, reasons: ["nothing to apply"], confirming, pending, decision };
  if (changes.length > policy.maxChanges) { decision = true; reasons.push(`${changes.length} changes in one run (limit ${policy.maxChanges})`); }
  for (const c of changes) {
    const who = c.name ? `${c.name} (${c.commissioner})` : c.slug;
    if (!policy.autoTypes.includes(c.type)) { decision = true; reasons.push(`${c.type}: ${who}`); continue; }
    const roles = c.type === "role" ? [c.from, c.to] : [c.role];
    const senior = roles.some(isSeniorRole), special = !!(opts.alwaysConfirm && opts.alwaysConfirm(c));
    if (!senior && !special) continue;
    const key = changeKey(c), first = seen.get(key) || today;
    pending.push({ key, firstSeen: first });
    if (first < today) continue; // confirmed: an earlier day's run read the same change
    confirming.push(c);
    reasons.push(`${senior ? "senior role" : "President's cabinet"}: ${who}, ${roles.filter(Boolean).join(" → ")} (seen once; applies when a later run finds it again)`);
  }
  return { auto: reasons.length === 0, reasons, confirming, pending, decision };
}

/* Latest developments.
   - An item an institution published on its own page (Parliament, Council, Commission, advisory bodies: kind
     institutional, never inst press) that does not change the file's stage goes live at once.
   - Press reporting and every stage change go live after a double check: the item names a second listed source
     stating the same fact (x.confirm, checked by press-merge.mjs), or opts.pending holds it from a run on an earlier
     day and this run verified it again. Until then it waits in data-cache/press/pending.json, unseen by the app.
   - Analysis never becomes an item.
   - More than maxAuto items ready in one run looks like a scan gone wrong: then none is published.
   opts.idOf gives an item's id; opts.sure(x) says the source list names the institution (else the item needs the double check).
   Returns { auto, review (waiting or dropped), pending: [{ id, firstSeen, item }], reasons, overLimit }. */
POLICY.press = { maxAuto: 12, autoInst: ["ep", "council", "commission", "advisory"] };
export function classifyPress(items, policy = POLICY.press, opts = {}) {
  const today = opts.today || new Date().toISOString().slice(0, 10);
  const idOf = opts.idOf || ((x) => `${x.file}|${x.url}`), sure = opts.sure || (() => true);
  const seen = new Map((opts.pending || []).map((p) => [p.id, p.firstSeen]));
  const auto = [], review = [], pending = [], reasons = [];
  for (const x of items) {
    if (x.kind === "analysis") { review.push(x); reasons.push(`${x.file}: analysis is never published (${x.source})`); continue; }
    const own = x.kind === "institutional" && policy.autoInst.includes(x.inst) && sure(x);
    if (own && x.stage !== true) { auto.push(x); continue; }
    const why = x.stage === true ? "changes the file's stage" : x.kind === "institutional" ? "source is not a named EU institution on the source list" : "press reporting";
    const first = seen.get(idOf(x)) || today;
    if (x.confirm || first < today) { auto.push(x); continue; }
    review.push(x); pending.push({ id: idOf(x), firstSeen: first, item: x });
    reasons.push(`${x.file}: ${why} (${x.source}), seen once; publishes with a second source or when a later run verifies it again`);
  }
  if (auto.length > policy.maxAuto) {
    reasons.push(`${auto.length} items ready in one run (limit ${policy.maxAuto}): none published`);
    const held = auto.map((x) => ({ id: idOf(x), firstSeen: today, item: x }));
    return { auto: [], review: [...auto, ...review], pending: [...held, ...pending], reasons, overLimit: true };
  }
  return { auto, review, pending, reasons, overLimit: false };
}

const LOG_KEEP = 200;
export async function logAuto(cacheDir, entry) {
  const p = path.join(cacheDir, "autonomy-log.json");
  let log = [];
  try { log = JSON.parse(await fs.readFile(p, "utf8")); if (!Array.isArray(log)) log = []; } catch { /* first entry */ }
  log.push({ at: new Date().toISOString(), ...entry });
  await fs.writeFile(p, JSON.stringify(log.slice(-LOG_KEEP), null, 1) + "\n");
}
