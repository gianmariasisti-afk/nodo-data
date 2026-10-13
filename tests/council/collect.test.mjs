/* Tests for the browser-side Council collector's pure functions. Run: node --test tests/council/ */
import test from "node:test";
import assert from "node:assert/strict";
import { calLine, dayOf, joinItems, parseParticipants, addDays } from "../../tools/council/collect.mjs";

test("dayOf reads calendar headings", () => {
  assert.equal(dayOf("1 October 2026"), "2026-10-01");
  assert.equal(dayOf(" 15 December 2026 "), "2026-12-15");
  assert.equal(dayOf("Search by date"), null);
});

test("calLine takes dates from the URL and shortens titles", () => {
  assert.equal(calLine({ href: "/en/meetings/epsco/2026/09/30-01/", title: "Informal meeting of health ministers, 30 September - 1 October 2026", days: ["2026-10-01"] }),
    "2026-09-30>2026-10-01|epsco|Informal meeting of health ministers|/en/meetings/epsco/2026/09/30-01/");
  assert.equal(calLine({ href: "/en/meetings/european-council/2026/10/15-16/", title: "European Council, 15-16 October 2026", days: ["2026-10-15", "2026-10-16"] }),
    "2026-10-15>2026-10-16|european-council|European Council|/en/meetings/european-council/2026/10/15-16/");
  assert.equal(calLine({ href: "/en/meetings/ecofin/2026/11/10/budget/", title: "Economic and Financial Affairs Council (Budget)", days: ["2026-11-10"] }),
    "2026-11-10|ecofin|ECOFIN (Budget)|/en/meetings/ecofin/2026/11/10/budget/");
  assert.equal(calLine({ href: "/en/meetings/eycs/2026/11/19/", title: "Education, Youth, Culture and Sport Council (Education and Youth)", days: ["2026-11-19"] }),
    "2026-11-19|eycs|EYCS Council (Education and Youth)|/en/meetings/eycs/2026/11/19/");
  assert.equal(calLine({ href: "/en/meetings/x/2026/12/31-02/", title: "X", days: [] }).slice(0, 21), "2026-12-31>2027-01-02");
});

test("joinItems joins PDF pieces by the gap between them", () => {
  assert.equal(joinItems([{ x: 41, w: 10, s: "M" }, { x: 51, w: 80, s: "r David VLAJČIĆ" }, { x: 134, w: 3, s: " " }]), "Mr David VLAJČIĆ");
  assert.equal(joinItems([{ x: 41, w: 44, s: "Ms Stipe" }, { x: 87, w: 30, s: "ŽUPAN" }]), "Ms Stipe ŽUPAN");
});

test("parseParticipants groups people under country headers", () => {
  const rows = [
    { left: "LIST OF PARTICIPANTS", right: "" },
    { left: "HIGH REPRESENTATIVE", right: "" }, { left: "Ms Kaja KALLAS", right: "High Representative" },
    { left: "BELGIUM", right: "" }, { left: "Mr Jan JAMBON", right: "Deputy Prime Minister and Minister for Finance and Pensions," },
    { left: "", right: "with responsibility for the National Lottery" },
    { left: "CYPRU S", right: "" }, { left: "Mr Makis KERAVNOS", right: "Minister for Finance" },
    { left: "NETHERLANDS", right: "" }, { left: "Mr Pieter Jan KLEIWEG DE ZWAAN AUSTRIA *", right: "Permanent Representative" },
    { left: "Mr Norbert TOTSCHNIG", right: "Federal Minister" },
    { left: "LUXEMBOURG", right: "Minister" },
    { left: "COMMISSION", right: "" }, { left: "Mr Valdis DOMBROVSKIS", right: "Commissioner" },
  ];
  assert.deepEqual(parseParticipants(rows), {
    BE: [["Mr Jan JAMBON", "Deputy Prime Minister and Minister for Finance and Pensions, with responsibility for the National Lottery"]],
    CY: [["Mr Makis KERAVNOS", "Minister for Finance"]],
    NL: [["Mr Pieter Jan KLEIWEG DE ZWAAN", "Permanent Representative"]],
    AT: [["Mr Norbert TOTSCHNIG", "Federal Minister"]],
  });
});

test("addDays crosses month and year ends", () => {
  assert.equal(addDays("2026-12-25", 10), "2027-01-04");
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
});
