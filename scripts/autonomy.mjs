/* Autonomy policy: which detected changes go live without a human, and the log of what did.

   Tier 1 (applied automatically, logged): a small set of ordinary cabinet changes; Latest developments items
   from an EU institution's own page that do not change a file's stage (since 10 Nov 2026).
   Tier 3 (wait for Gianmaria): anything senior, anything about who sits in the College, and any large batch.
   The rule is all-or-nothing per run: if one change in the batch needs review, the whole batch waits,
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

/* Returns { auto: boolean, reasons: [why it waits] } for a list of Commission structural changes. */
export function classifyCommission(changes, policy = POLICY.commission) {
  const reasons = [];
  if (!changes.length) return { auto: false, reasons: ["nothing to apply"] };
  if (changes.length > policy.maxChanges) reasons.push(`${changes.length} changes in one run (limit ${policy.maxChanges})`);
  for (const c of changes) {
    const who = c.name ? `${c.name} (${c.commissioner})` : c.slug;
    if (!policy.autoTypes.includes(c.type)) { reasons.push(`${c.type}: ${who}`); continue; }
    const roles = c.type === "role" ? [c.from, c.to] : [c.role];
    if (roles.some(isSeniorRole)) reasons.push(`senior role: ${who}, ${roles.filter(Boolean).join(" → ")}`);
  }
  return { auto: reasons.length === 0, reasons };
}

/* Latest developments. An item goes live without review when an institution published it (Parliament, Council,
   Commission, advisory bodies: kind institutional, never inst press) and it does not change the file's stage.
   Press reporting and every stage change wait for Gianmaria on review/press. More than maxAuto institutional items
   in one run looks like a scan gone wrong: then all of them wait. Returns { auto: [...], review: [...], reasons }. */
POLICY.press = { maxAuto: 12, autoInst: ["ep", "council", "commission", "advisory"] };
export function classifyPress(items, policy = POLICY.press) {
  const auto = [], review = [], reasons = [];
  for (const x of items) {
    const why = x.kind !== "institutional" || !policy.autoInst.includes(x.inst) ? "press reporting" : x.stage === true ? "changes the file's stage" : null;
    if (why) { review.push(x); reasons.push(`${x.file}: ${why} (${x.source})`); } else auto.push(x);
  }
  if (auto.length > policy.maxAuto) {
    reasons.push(`${auto.length} institutional items in one run (limit ${policy.maxAuto}): all wait`);
    return { auto: [], review: [...auto, ...review], reasons };
  }
  return { auto, review, reasons };
}

const LOG_KEEP = 200;
export async function logAuto(cacheDir, entry) {
  const p = path.join(cacheDir, "autonomy-log.json");
  let log = [];
  try { log = JSON.parse(await fs.readFile(p, "utf8")); if (!Array.isArray(log)) log = []; } catch { /* first entry */ }
  log.push({ at: new Date().toISOString(), ...entry });
  await fs.writeFile(p, JSON.stringify(log.slice(-LOG_KEEP), null, 1) + "\n");
}
