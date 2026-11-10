#!/usr/bin/env node
/* Heartbeat of the scheduled Claude tasks.

   GitHub workflows show up in status.json through the Actions API; the scheduled Claude tasks do not, so a task that
   stopped running was only noticed days later through old data. Each task ends with:

     node scripts/task-heartbeat.mjs <task> <ok|failed> ["one line on what the run did"]

   and commits data-cache/tasks/<task>.json to main, also when the run changed no data. scripts/status-data.mjs reads the
   folder into status.json (reference.tasks) with each task's age and whether it is late; the weekday check reports it.
   One file per task, so two tasks never edit the same file. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* maxAgeDays: the longest gap between two runs on the task's schedule, plus one day of slack. */
export const TASKS = {
  "reference-refresh": { name: "nodo reference refresh (Mon and Thu)", maxAgeDays: 5 },
  "press-scan": { name: "nodo press scan (Mon and Thu)", maxAgeDays: 5 },
  "council-minutes": { name: "nodo Council and minutes refresh (weekdays)", maxAgeDays: 4 },
};
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const DIR = path.join(ROOT, "data-cache", "tasks");

export function readHeartbeats(today, dir = DIR) {
  const out = [];
  for (const [id, t] of Object.entries(TASKS)) {
    let hb = null;
    try { hb = JSON.parse(fs.readFileSync(path.join(dir, id + ".json"), "utf8")); } catch { /* never ran with a heartbeat */ }
    const ageDays = hb && hb.at ? Math.round((Date.parse(today) - Date.parse(String(hb.at).slice(0, 10))) / 864e5) : null;
    out.push({ task: id, name: t.name, at: (hb && hb.at) || null, result: (hb && hb.result) || null, note: (hb && hb.note) || "", ageDays, maxAgeDays: t.maxAgeDays, late: ageDays === null ? null : ageDays > t.maxAgeDays });
  }
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const [task, result, note = ""] = process.argv.slice(2);
  if (!TASKS[task] || !["ok", "failed"].includes(result)) { console.error(`usage: task-heartbeat.mjs <${Object.keys(TASKS).join("|")}> <ok|failed> ["note"]`); process.exit(2); }
  fs.mkdirSync(DIR, { recursive: true });
  const body = { task, at: new Date().toISOString(), result, note: String(note).replace(/\s+/g, " ").trim().slice(0, 300) };
  fs.writeFileSync(path.join(DIR, task + ".json"), JSON.stringify(body, null, 1) + "\n");
  console.log(JSON.stringify(body));
}
