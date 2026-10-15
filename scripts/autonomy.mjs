/* Autonomy policy: which detected changes go live without a human, and the log of what did.

   Tier 1 (applied automatically, logged): a small set of ordinary cabinet changes.
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

const LOG_KEEP = 200;
export async function logAuto(cacheDir, entry) {
  const p = path.join(cacheDir, "autonomy-log.json");
  let log = [];
  try { log = JSON.parse(await fs.readFile(p, "utf8")); if (!Array.isArray(log)) log = []; } catch { /* first entry */ }
  log.push({ at: new Date().toISOString(), ...entry });
  await fs.writeFile(p, JSON.stringify(log.slice(-LOG_KEEP), null, 1) + "\n");
}
