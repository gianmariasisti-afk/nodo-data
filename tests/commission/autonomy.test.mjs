import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyCommission, isSeniorRole } from "../../scripts/autonomy.mjs";
import { roleClass, tidyRole } from "../../scripts/build-commission.mjs";

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

test("a new Head of Cabinet waits for review", () => {
  const v = classifyCommission([{ type: "role", commissioner: "x", name: "A", from: "Member", to: "HEAD OF CABINET" }]);
  assert.equal(v.auto, false);
  assert.match(v.reasons[0], /senior role/);
});

test("removing a deputy head waits for review", () => {
  assert.equal(classifyCommission([{ type: "removed", commissioner: "x", name: "B", role: "Deputy Head of Cabinet" }]).auto, false);
});

test("College changes and large batches wait for review", () => {
  assert.equal(classifyCommission([{ type: "commissioner-added", slug: "new-person" }]).auto, false);
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
