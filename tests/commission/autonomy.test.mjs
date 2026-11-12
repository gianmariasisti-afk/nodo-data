import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyCommission, isSeniorRole } from "../../scripts/autonomy.mjs";
import { roleClass, tidyRole, parseTeam } from "../../scripts/build-commission.mjs";

test("assistants to heads of cabinet are not senior", () => {
  assert.equal(isSeniorRole("Assistant to the Head of Cabinet and Andreja Viher-White"), false);
  assert.equal(isSeniorRole("Policy Assistant to the Deputy Head of Cabinet"), false);
  assert.equal(roleClass("Assistant to The Head of Cabinet"), "office");
});

test("heads, deputies and acting deputies are senior", () => {
  for (const r of ["Head of Cabinet", "Deputy Head of Cabinet", "Cabinet Expert / Acting Deputy Head of Cabinet", "Director of Coordination and Administration"]) {
    assert.equal(isSeniorRole(r), true, r);
    assert.equal(roleClass(r), "lead", r);
  }
});

test("tidyRole lowercases 'the'", () => {
  assert.equal(tidyRole("ASSISTANT TO THE HEAD OF CABINET"), "Assistant to the Head of Cabinet");
});

test("this morning's batch would have gone live on its own", () => {
  const v = classifyCommission([
    { type: "removed", commissioner: "dubravka-suica", name: "Nuran Saygili", role: "Member" },
    { type: "role", commissioner: "marta-kos", name: "Katarina Gavlakova", from: "Assistant to the Head of Cabinet", to: "ASSISTANT TO THE HEAD OF CABINET AND ANDREJA VIHER-WHITE" },
    { type: "role", commissioner: "marta-kos", name: "Barbara De Angelis", from: "Assistant to the Deputy Head of Cabinet", to: "ASSISTANT TO THE DEPUTY HEAD OF CABINET AND ADELE MARSULLO" },
  ]);
  assert.equal(v.auto, true, v.reasons.join("; "));
});

test("a new Head of Cabinet waits for a second reading, then applies", () => {
  const change = [{ type: "role", commissioner: "x", name: "A", from: "Member", to: "HEAD OF CABINET" }];
  const first = classifyCommission(change, undefined, { today: "2026-11-12" });
  assert.equal(first.auto, false);
  assert.equal(first.decision, false);
  assert.match(first.reasons[0], /senior role/);
  assert.equal(first.pending.length, 1);
  // the same day again: still one reading
  assert.equal(classifyCommission(change, undefined, { today: "2026-11-12", pending: first.pending }).auto, false);
  // a later day reads the same change: it applies
  const second = classifyCommission(change, undefined, { today: "2026-11-13", pending: first.pending });
  assert.equal(second.auto, true, second.reasons.join("; "));
  // a later day reads something else: the new change starts its own count
  const other = classifyCommission([{ ...change[0], name: "B" }], undefined, { today: "2026-11-13", pending: first.pending });
  assert.equal(other.auto, false);
  assert.equal(other.pending[0].firstSeen, "2026-11-13");
});

test("the President's cabinet needs the second reading even for ordinary roles", () => {
  const change = [{ type: "added", commissioner: "ursula-von-der-leyen", name: "P", role: "Member" }];
  const opts = { today: "2026-11-12", alwaysConfirm: (c) => c.commissioner === "ursula-von-der-leyen" };
  const first = classifyCommission(change, undefined, opts);
  assert.equal(first.auto, false);
  assert.equal(classifyCommission(change, undefined, { ...opts, today: "2026-11-16", pending: first.pending }).auto, true);
});

test("removing a deputy head waits for review", () => {
  assert.equal(classifyCommission([{ type: "removed", commissioner: "x", name: "B", role: "Deputy Head of Cabinet" }]).auto, false);
});

test("College changes and large batches wait for a person, however often they are read", () => {
  const college = classifyCommission([{ type: "commissioner-added", slug: "new-person" }], undefined, { today: "2026-11-13", pending: [{ key: "commissioner-added|new-person||", firstSeen: "2026-11-12" }] });
  assert.equal(college.auto, false);
  assert.equal(college.decision, true);
  const six = Array.from({ length: 6 }, (_, i) => ({ type: "added", commissioner: "x", name: "P" + i, role: "Member" }));
  assert.equal(classifyCommission(six).auto, false);
  assert.equal(classifyCommission(six.slice(0, 5)).auto, true);
});

test("one senior change holds the whole batch", () => {
  const v = classifyCommission([
    { type: "added", commissioner: "x", name: "P", role: "Member" },
    { type: "added", commissioner: "x", name: "Q", role: "Head of Cabinet" },
  ]);
  assert.equal(v.auto, false);
});

test("mixed-case roles and people with two posts are read (President's team page, 12 Nov 2026)", () => {
  const lines = [
    "Björn Seibert", "HEAD OF CABINET", "Email: bjorn.seibert[at]ec.europa.eu", "Phone number: +32 2 000 00 00", "Responsibilities", "Overall coordination",
    "Michele Piergiovanni", "SENIOR ECONOMIC ADVISER (acting)", "Email: m.p[at]ec.europa.eu", "Phone number: +32 2 000 00 01",
    "Michele Piergiovanni", "DIGITAL ADVISER", "Email: m.p[at]ec.europa.eu", "Phone number: +32 2 000 00 01", "Responsibilities", "Digital",
    "Assistants",
    "Alisa James", "ASSISTANT to the President", "Email: a.j[at]ec.europa.eu", "Phone number: +32 2 000 00 02",
    "Claire Saelens", "ASSISTANT to the Deputy Head of Cabinet and the Policy Coordinator/Member Western Balkans, East and Enlargement", "Email: c.s[at]ec.europa.eu", "Phone number: +32 2 000 00 03",
  ];
  const people = parseTeam(lines);
  assert.deepEqual(people.map((p) => p.name), ["Björn Seibert", "Michele Piergiovanni", "Alisa James", "Claire Saelens"]);
  assert.equal(people[1].role, "SENIOR ECONOMIC ADVISER (acting) · DIGITAL ADVISER");
  assert.equal(tidyRole(people[2].role), "Assistant to the President");
  assert.equal(roleClass(people[2].role), "office");
  assert.equal(roleClass(people[3].role), "office"); // an assistant stays office staff whoever they assist
  assert.deepEqual(people[0].resp, ["Overall coordination"]);
});
