import test from "node:test";
import assert from "node:assert/strict";
import { checkItem, idOf } from "../../scripts/press-merge.mjs";
import { parseFeed, matchFiles } from "../../scripts/press-feeds.mjs";

const ctx = { fileIds: new Set(["iaa"]), mepIds: new Set(["97399"]) };
const ok = { file: "iaa", date: "2026-10-15", source: "Agence Europe", inst: "press", kind: "press", url: "https://example.org/a", text: "More than 5,000 amendments were tabled to the joint draft report.", people: ["ep:97399"] };

test("a good item passes", () => assert.deepEqual(checkItem(ok, ctx), []));
test("quotes, unknown people and bad kinds are refused", () => {
  assert.ok(checkItem({ ...ok, text: 'He said "scrap it" in committee today, loudly.' }, ctx).some((p) => /quotes/.test(p)));
  assert.ok(checkItem({ ...ok, people: ["ep:1"] }, ctx).some((p) => /not an MEP/.test(p)));
  assert.ok(checkItem({ ...ok, kind: "blog" }, ctx).some((p) => /kind/.test(p)));
  assert.ok(checkItem({ ...ok, url: "http://example.org" }, ctx).some((p) => /https/.test(p)));
  assert.ok(checkItem({ ...ok, date: "2099-01-01" }, ctx).some((p) => /future/.test(p)));
});
test("ids are stable per file and url", () => assert.equal(idOf(ok), idOf({ ...ok, text: "changed" })));

test("RSS and Atom entries parse", () => {
  const rss = `<rss><channel><item><title><![CDATA[IAA: MEPs table 5,000 amendments]]></title><link>https://x.eu/a</link><pubDate>Thu, 15 Oct 2026 10:00:00 GMT</pubDate><description>&lt;p&gt;Gotink leads&lt;/p&gt;</description></item></channel></rss>`;
  const atom = `<feed><entry><title>Digital Omnibus mandate</title><link href="https://x.eu/b"/><updated>2026-10-21T09:00:00Z</updated><summary>Council</summary></entry></feed>`;
  assert.deepEqual(parseFeed(rss)[0], { title: "IAA: MEPs table 5,000 amendments", url: "https://x.eu/a", date: "2026-10-15", summary: "Gotink leads" });
  assert.equal(parseFeed(atom)[0].url, "https://x.eu/b");
});
test("matching respects case for acronyms and exclusions", () => {
  const packs = [{ id: "iaa", terms: ["IAA", "Industrial Accelerator Act"], exclude: ["IAA Mobility"], people: [{ key: "ep:97399", family: "Gotink" }] }];
  assert.deepEqual(matchFiles({ title: "IAA: Gotink tables amendments", summary: "" }, packs), [{ file: "iaa", people: ["ep:97399"] }]);
  assert.deepEqual(matchFiles({ title: "Shiaa wins", summary: "the iaa" }, packs), []);
  assert.deepEqual(matchFiles({ title: "IAA Mobility opens in Munich", summary: "" }, packs), []);
  assert.equal(matchFiles({ title: "the industrial accelerator act stalls", summary: "" }, packs).length, 1);
});
