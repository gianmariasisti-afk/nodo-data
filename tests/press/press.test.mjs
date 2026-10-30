import test from "node:test";
import assert from "node:assert/strict";
import { checkItem, idOf } from "../../scripts/press-merge.mjs";
import { parseFeed, matchFiles } from "../../scripts/press-feeds.mjs";
import { resolve, checkPressSource, checkCitation, checkRegistry } from "../../scripts/sources.mjs";

const ctx = { fileIds: new Set(["iaa"]), mepIds: new Set(["97399"]) };
const ok = { file: "iaa", date: "2026-10-15", source: "Agence Europe", inst: "press", kind: "press", url: "https://agenceurope.eu/en/bulletin/article/13961/6/x", text: "More than 5,000 amendments were tabled to the joint draft report.", people: ["ep:97399"] };

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

const reg = {
  media: [
    { id: "ae", name: "Agence Europe", tier: 1, domains: ["agenceurope.eu"], paywall: true },
    { id: "ml", name: "MediaLaws", tier: 3, domains: ["medialaws.eu"], paywall: false, files: ["dna"] }
  ],
  institutions: [{ id: "council", name: "Council of the EU", inst: "council", domains: ["consilium.europa.eu"] }, { id: "eu", name: "EU bodies", inst: null, domains: ["europa.eu"] }],
  analysis: [{ id: "mat", name: "Matheson", type: "law-firm", domains: ["matheson.com"] }],
  excluded: [{ domain: "ppc.land", why: "ad-tech site" }]
};
test("the source list resolves subdomains, longest match first", () => {
  assert.equal(resolve("https://www.agenceurope.eu/a", reg).entry.id, "ae");
  assert.equal(resolve("https://data.consilium.europa.eu/doc", reg).entry.id, "council");
  assert.equal(resolve("https://ppc.land/x", reg).excluded, "ad-tech site");
  assert.equal(resolve("https://notagenceurope.eu/a", reg), null);
});
test("press items must come from the source list", () => {
  const item = { ...ok, file: "iaa" };
  assert.deepEqual(checkPressSource(item, "iaa", reg), []);
  assert.ok(checkPressSource({ ...item, url: "https://ppc.land/a", source: "PPC Land" }, "iaa", reg).some((p) => /excluded/.test(p)));
  assert.ok(checkPressSource({ ...item, url: "https://example.org/a" }, "iaa", reg).some((p) => /not on nodo's source list/.test(p)));
  assert.ok(checkPressSource({ ...item, url: "https://matheson.com/a", source: "Matheson" }, "iaa", reg).some((p) => /not media/.test(p)));
  assert.ok(checkPressSource({ ...item, source: "AgenceEurope" }, "iaa", reg).some((p) => /should be "Agence Europe"/.test(p)));
  assert.ok(checkPressSource({ ...item, url: "https://medialaws.eu/a", source: "MediaLaws" }, "iaa", reg).some((p) => /tier 3/.test(p)));
  assert.deepEqual(checkPressSource({ ...item, url: "https://medialaws.eu/a", source: "MediaLaws" }, "dna", reg), []);
  assert.ok(checkPressSource({ ...item, kind: "institutional", inst: "ep", url: "https://www.consilium.europa.eu/x", source: "Council press release" }, "iaa", reg).some((p) => /inst should be "council"/.test(p)));
});
test("citations may be analysis but not excluded or unmapped tier 3", () => {
  assert.deepEqual(checkCitation("https://www.matheson.com/x", "iaa", reg), []);
  assert.equal(checkCitation("https://xyz.pl/a", "iaa", reg).length, 1);
  assert.equal(checkCitation("https://medialaws.eu/a", "iaa", reg).length, 1);
  assert.deepEqual(checkRegistry(reg, new Set(["dna", "iaa"])), []);
  assert.ok(checkRegistry(reg, new Set(["iaa"])).some((p) => /unknown file dna/.test(p)));
});
