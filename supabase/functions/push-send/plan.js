// nodo push notifications: what one person gets, if anything. Pure functions, no I/O.
// Used by index.ts (the push-send Edge Function) and tested by tests/push/plan.test.mjs.
//
// Tiers (approved 16 Nov 2026):
//   move  a followed file changes stage (committee report adopted, plenary vote, trilogue deal endorsed, signature...)
//   day   weekday roundup at 08:30 Brussels: everything else new on followed files (people, steps, Latest developments)
//   week  Monday at 08:30: the next 7 days on followed files; on a Monday it takes the roundup's place
//         (the roundup's updates then go out on Tuesday); with no step in the week, Monday gets the roundup
// Rules: one notification per person per Brussels day; weekdays 08:00-19:00 only; an update is never sent twice;
// a file move found after the day's notification waits for the next morning; muted files and turned-off tiers are skipped;
// people the person hid on a file are skipped unless they are named rapporteur (same rule as Today).

export const MORNING_HOUR = 8;
export const FIRST_HOUR = 8;
export const LAST_HOUR = 18; // last run that may send starts before 19:00
export const FRESH_DAYS = 7; // an update first seen more than a week ago is never sent

const MOVES = [
  /^Stage change/,
  /^Report adopted in committee/,
  /^Committee endorsed the trilogue agreement/,
  /^Trilogue mandate confirmed/,
  /^Plenary vote$/,
  /^Parliament adopted its position/,
  /^Act signed/,
  /^Published in the Official Journal/,
];
export const isMove = (e) => e.kind === "milestone" && MOVES.some((r) => r.test(e.title || ""));

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Brussels calendar date (YYYY-MM-DD), hour (0-23) and weekday (1 = Monday ... 7 = Sunday) of a moment. */
export function brussels(when) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Brussels", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23", weekday: "short",
  }).formatToParts(new Date(when)).map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour), dow: DOW.indexOf(parts.weekday) + 1 };
}

export const addDays = (iso, n) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

/** The person's choices, from user_state.body. Tiers default to on once notifications are allowed on the phone. */
export function prefsOf(body) {
  const n = (body && body.profile && body.profile.notify) || {};
  return {
    move: n.pushMoves !== false,
    day: n.pushDaily !== false,
    week: n.pushWeek !== false,
    muted: new Set(Array.isArray(n.pushMuted) ? n.pushMuted : []),
  };
}

function hidden(e, body) {
  if (e.kind !== "people" || !e.personId || /^Rapporteur named/.test(e.title || "")) return false;
  const l = body && body.lists && body.lists[e.fileId];
  return !!(l && (l.rem || []).includes("ep:" + e.personId));
}

const clip = (s, n) => (s.length <= n ? s : s.slice(0, n - 1).replace(/[\s,;:.]+\S*$/, "") + "…");
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const shortDate = (iso) => { const d = new Date(iso + "T12:00:00Z"); return `${d.getUTCDate()} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()]}`; };
const STAGE_WORDS = {
  "pre proposal": "Back to pre-proposal",
  "positions in preparation": "Positions now forming",
  "council negotiating box": "Moved to the Council",
  trilogue: "Moved to trilogue",
  "in force": "Now in force",
};
const stageWords = (t) => { const m = /^Stage change: .* to (.+)$/.exec(t || ""); return m ? STAGE_WORDS[m[1]] || `Moved to ${m[1]}` : t; };

/** What changed on one file, in a few words: "2 new shadow rapporteurs", "Draft report tabled", "1 new development". */
function filePhrase(items) {
  const people = items.filter((x) => x.kind === "people"), press = items.filter((x) => x.kind === "press"), steps = items.filter((x) => x.kind !== "people" && x.kind !== "press");
  const out = [];
  if (steps.length === 1) out.push(stageWords(steps[0].title)); else if (steps.length) out.push(`${steps.length} new steps`);
  const rap = people.filter((x) => /^(Co-)?[Rr]apporteur named/.test(x.title || ""));
  if (rap.length) out.push(rap.length === 1 ? "rapporteur named" : `${rap.length} rapporteurs named`);
  const shadows = people.filter((x) => /shadow/i.test(x.title || "")), others = people.length - rap.length - shadows.length;
  if (shadows.length) out.push(plural(shadows.length, "new shadow rapporteur", "new shadow rapporteurs"));
  if (others > 0) out.push(plural(others, "new person", "new people"));
  if (press.length) out.push(plural(press.length, "new development", "new developments"));
  const s = out.join(", ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function byFile(items, fileBy) {
  const m = new Map();
  for (const x of items) { if (!fileBy[x.fileId]) continue; if (!m.has(x.fileId)) m.set(x.fileId, []); m.get(x.fileId).push(x); }
  return [...m.entries()];
}

function listBody(parts, max = 3) {
  const shown = parts.slice(0, max).join(". ");
  return clip(shown + (parts.length > max ? `. And ${parts.length - max} more.` : "."), 178);
}

/** Steps dated in the next 7 days on the given files: files.json `next` plus scheduled events from the update stream. */
export function weekSteps(files, scheduled, today) {
  const end = addDays(today, 6), out = [], seen = new Set();
  const add = (f, date, what) => { const k = f.id + "|" + date + "|" + what.toLowerCase(); if (seen.has(k)) return; seen.add(k); out.push({ fileId: f.id, short: f.short || f.id, date, what }); };
  for (const f of files) for (const s of f.next || []) if (s.date && s.date >= today && s.date <= end && s.what) add(f, s.date, s.what);
  const ids = new Map(files.map((f) => [f.id, f]));
  for (const e of scheduled) if (ids.has(e.fileId) && e.date >= today && e.date <= end && e.title) add(ids.get(e.fileId), e.date, e.title);
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * The notification one person gets on this run, or null.
 * @param {object} a
 * @param {Date|string} a.now
 * @param {object} a.body       user_state.body (profile, follow, lists)
 * @param {object[]} a.updates  update-stream events and press items, each with id, fileId, kind, title and firstSeen (ISO)
 * @param {object[]} a.scheduled scheduled events from the update stream (for the week ahead)
 * @param {object} a.fileBy     files.json by id
 * @param {object[]} a.sent     this person's push_log rows of the last weeks: { sent_at, kind, event_ids }
 */
export function planFor({ now, body, updates, scheduled, fileBy, sent }) {
  const b = brussels(now);
  if (b.dow > 5 || b.hour < FIRST_HOUR || b.hour > LAST_HOUR) return null;
  if ((sent || []).some((s) => s.kind !== "test" && brussels(s.sent_at).date === b.date)) return null;

  const p = prefsOf(body);
  const follow = new Set((Array.isArray(body && body.follow) ? body.follow : []).filter((id) => fileBy[id] && !p.muted.has(id)));
  if (!follow.size) return null;

  const done = new Set((sent || []).flatMap((s) => s.event_ids || []));
  const oldest = new Date(new Date(now).getTime() - FRESH_DAYS * 86400e3).toISOString();
  const fresh = (updates || []).filter((e) => follow.has(e.fileId) && !done.has(e.id) && e.firstSeen && e.firstSeen >= oldest && !hidden(e, body));

  const moves = fresh.filter(isMove);
  if (p.move && moves.length) {
    const groups = byFile(moves, fileBy);
    const ids = moves.map((e) => e.id), files = groups.map(([id]) => id);
    if (groups.length === 1) {
      const [fid, list] = groups[0], f = fileBy[fid], last = list[list.length - 1];
      const title = clip(`${f.short || fid} · ${stageWords(last.title)}`, 90);
      const body = list.length > 1 ? listBody(list.map((e) => stageWords(e.title))) : `${last.date ? `Recorded ${shortDate(last.date)}. ` : ""}See where the file stands now and who is on it.`;
      return { kind: "move", title, body, event_ids: ids, file_ids: files };
    }
    return { kind: "move", title: `${groups.length} of your files moved`, body: listBody(groups.map(([fid, l]) => `${fileBy[fid].short || fid}: ${stageWords(l[l.length - 1].title)}`)), event_ids: ids, file_ids: files };
  }

  if (b.hour !== MORNING_HOUR) return null;

  if (b.dow === 1 && p.week) {
    const steps = weekSteps([...follow].map((id) => fileBy[id]), scheduled || [], b.date);
    if (steps.length) {
      const nFiles = new Set(steps.map((s) => s.fileId)).size;
      const day = (iso) => DOW[(new Date(iso + "T12:00:00Z").getUTCDay() + 6) % 7];
      const what = (w) => clip(w.split(/:|\s\(/)[0].trim(), 40);
      const parts = steps.map((s) => `${day(s.date)} ${s.short}: ${what(s.what)}`);
      return { kind: "week", title: `Your week: ${plural(steps.length, "step", "steps")} on ${plural(nFiles, "file", "files")}`, body: listBody(parts), event_ids: [], file_ids: [...new Set(steps.map((s) => s.fileId))] };
    }
  }

  /* On a Monday with no step in the week ahead (or the week ahead turned off), the roundup goes out as usual. */
  if (p.day) {
    const items = p.move ? fresh.filter((e) => !isMove(e)) : fresh;
    if (!items.length) return null;
    const groups = byFile(items, fileBy).sort((x, y) => y[1].length - x[1].length);
    return {
      kind: "day",
      title: `${plural(items.length, "update", "updates")} on your files`,
      body: listBody(groups.map(([fid, l]) => `${fileBy[fid].short || fid}: ${filePhrase(l)}`)),
      event_ids: items.map((e) => e.id),
      file_ids: groups.map(([fid]) => fid),
    };
  }
  return null;
}
