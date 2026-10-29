# nodo-data

Public data files for **nodo**, an app that gives public affairs professionals fast access to EU institutions: MEPs, the Commission, the Council and the Parliament calendar and plenary agendas.

Served by GitHub Pages at `https://gianmariasisti-afk.github.io/nodo-data/`. Open that address on a phone and use Share → Add to Home Screen (iPhone) or Install app (Android).

The app reads `v1/` from its own origin. Profile, favourites and file lists live in the browser. When `config.js` is filled in (see SETUP.md) people can sign in with Apple, Google, LinkedIn or an email link and their data follows them to every device.

## Layout

```
index.html            the nodo app (PWA)
config.js             Supabase URL and public key (empty = preview mode)
vendor/               supabase-js (bundled so the app works offline)
supabase/schema.sql   table, row-level security and account deletion
SETUP.md              how to switch on accounts and sync
manifest.webmanifest  install settings (name, icons, colours)
sw.js                 service worker: offline shell, fresh data when online, saved data when the connection is slow
icons/                app icons
v1/
  manifest.json   index of every file with size, checksum and generation time
  meps.json       Members of the European Parliament
  commission.json European Commission (College and cabinets)
  council.json    Council of the EU
  calendar.json   Parliament calendar
  agenda.json     Plenary agendas
  files.json      Legislative files with linked MEPs, Commissioners, cabinet members
  reports.json    Parliament reports and opinions with rapporteur and shadows (automatic pages)
  minutes.json    Who spoke on the priority files in Parliament committee meetings, from the committees' minutes
  press.json      Latest developments: dated items on the priority files with nodo's own takeaway (preview only)
  sources.json    Source list: media by tier, institutions, analysis sources and excluded domains
```

## sources.json (source list)

The one list of outlets and institutions nodo may use. `scripts/sources.mjs` resolves a URL to its entry (a domain matches its subdomains; the longest match wins) and `scripts/validate-data.mjs` refuses anything not on it.

- `media`: tier 1 EU specialist press, tier 2 wires and national press with Brussels desks, tier 3 sector trade press. Tier 3 entries carry a `files` list and appear only on those files, in press and in citations. A press item's `source` must equal the entry's `name`.
- `institutions`: EU institutions and bodies, plus national sources. Institutional press items must match the entry's `inst`.
- `analysis`: law firms, legal publishers, consultancies, think tanks, NGOs, industry bodies, academic blogs. Allowed as `files.json` citations, never as press items.
- `excluded`: domains refused on purpose, with the reason.

To add an outlet, add it here first; the press feeds in `tools/press/config.json` must also be on the list.

`v1` is the schema version. Fields can be added inside v1. A rename or removal creates `v2` and `v1` stays online for installed apps.

## How the app moves between screens

Profiles stack: a person opened from a file sits on top of the file, and Back returns to the file. Every screen change is one browser-history entry, so the phone's back gesture steps back inside nodo. Inside an embedded frame (the Claude artifact) the browser history is left alone and Back walks the same trail in memory. The code is the "navigation" block in `index.html`.

The service worker keeps two caches: `nodo-v<n>` for the app shell and `nodo-data-v1` for `v1/`. Bump `VERSION` in `sw.js` with every change to the shell; the data cache survives app updates, so phones do not download the directory again. Data requests wait 3 seconds for the network and then answer from the saved copy.

The artifact page is this `index.html` without its first line, without `config.js` (so it runs in preview mode) and with `avatars.js` inlined.

## files.json

Seven priority legislative files (MFF 2028–2034, Digital Omnibus, Industrial Accelerator Act, Digital Networks Act, Digital Fairness Act, Chips Act 2.0 and CADA, AI Act after the Omnibus). `procedure` is the main EP procedure; `procedures` lists related ones (the MFF interim report is 2025/0571R(APP)) and each of `parts` can carry its own `procedure`; the update stream follows all of them. `proposal` keeps the Commission reference. Each file lists `meps` (id, role, committee, `basis`), `commission` (lead and associated commissioner slugs), `cabinet` (keys from `commission.json` with a reason), Council configurations, `caveats` and `sources`. `basis` is `ep-open-data` (verified from `activity/` feeds) or `press` (named in reporting, to verify in the EP procedure file). MEP ids match `meps.json`.

## press.json (Latest developments)

Dated items on nodo's files, each with nodo's own one- or two-sentence takeaway and a link to the source. Shown in the preview only so far.

```json
{ "generated": "…", "windowDays": 30, "maxPerFile": 3,
  "files": { "industrial-accelerator-act": [
    { "id": "3f2c…", "date": "2026-10-15", "source": "Agence Europe", "inst": "press", "kind": "press",
      "text": "More than 5,000 amendments were tabled…", "url": "https://…", "people": ["ep:97399"],
      "stage": false, "paywall": true, "added": "2026-10-28" } ] } }
```

- `inst`: `ep`, `council`, `commission`, `advisory` or `press`. `kind`: `institutional`, `press` or `analysis`.
- `text` is 40–240 characters, nodo's own words: no quotation marks, no exclamation marks. `people` are MEP keys from `meps.json`.
- `stage` marks an item that changes a file's stage (the only kind meant to trigger a push, once nodo sends any).
- Items older than `keepDays` (90) are dropped on the next merge; the app shows the last `windowDays` (30).

How it is kept up to date:

1. Every morning the Action "Collect press candidates" (`.github/workflows/press.yml`, `scripts/press-feeds.mjs`) reads the feeds in `tools/press/config.json` and keeps the entries that name a pilot file in `data-cache/press/candidates.json`; `data-cache/press/feeds.json` says which feeds answered. A feed that fails is logged, not fatal.
2. On Mondays and Thursdays the cloud scheduled task "nodo press scan" reads the candidates, runs each file's search pack (`node scripts/press-feeds.mjs --packs`: short name, aliases, procedure numbers, Council documents, rapporteurs and shadows) through web search, applies the inclusion test (an item gets in only if it moves the file: a new position, a date, a person, a compromise or a fight) and writes the takeaways.
3. `node scripts/press-merge.mjs items.json` checks every item, refuses the batch if one fails, and rewrites `press.json` and its manifest entry. `scripts/validate-data.mjs` checks the file again on every push.
4. Proposed items go to the rolling branch `review/press` with one open issue labelled `press`. Merging the branch publishes them. Facts that contradict `files.json` are listed in the issue as data checks; they never edit `files.json` (the weekly reference refresh does, and the Observatory wins over the press).

## agenda.json

Sessions are keyed by their first sitting day (`YYYY-MM-DD`).

```json
{
  "checked": "2026-10-03",
  "source": "https://www.europarl.europa.eu/plenary/en/agendas.html",
  "sessions": {
    "2026-10-05": {
      "stage": "final-draft",
      "updated": "2026-10-02",
      "days": {
        "2026-10-05": [
          { "time": "17:45–18:45", "type": "debate", "title": "…", "sub": "…",
            "rapporteur": "Estelle Ceulemans", "rapporteurs": ["256880"], "committee": "EMPL" }
        ]
      }
    }
  }
}
```

- `stage`: `none`, `draft`, `final-draft`, `agenda` or `updated`
- `type`: `debate`, `votes`, `statement` or `other`
- `rapporteurs`: MEP ids that match `id` in `meps.json`; the app turns them into profile links

## meps.json updates

The Action "Update MEP directory" (`.github/workflows/meps.yml`, `scripts/build-meps.mjs`) runs on weekdays. It reads `/meps/show-current` and each MEP's record from the EP Open Data Portal and compares them with `meps.json`.

- Committee and delegation seats and roles, national party, email, homepage and names go straight to main.
- An MEP arriving or leaving, a change of political group, a member losing every committee seat at once, or more than 150 changed records in one run (a reshuffle) wait for review on the rolling branch `review/meps`, with one open issue labelled `meps`. Merging the branch accepts them; the branch and issue are rebuilt on every run and closed when nothing waits.
- Photos, `hi` and socials of existing MEPs are never touched. A new MEP arrives without a photo, because the EP photo server blocks GitHub runners; a session with a browser adds it.
- `NOT_IN_API` in the script keeps records the API does not list by decision (Antoni Comín i Oliveres).
- `data-cache/meps-report.json` records each check. Tests: `node --test tests/meps/meps.test.mjs`.

## council.json updates

The Council website (www.consilium.europa.eu) sits behind a Cloudflare bot check that answers 403 to GitHub runners and to cloud sessions (tested 19 Oct 2026 with the domain allowed), so `council.json` has no Action and no cloud task. data.consilium.europa.eu (the document register) is reachable from the cloud; participant lists, the meeting calendar and Coreper dates are not. A scheduled Claude task on Gianmaria's Mac refreshes it on Mondays and Thursdays at 07:30 Brussels time (the Thursday run catches a Monday the Mac was asleep), through the Claude desktop app's built-in browser. It needs the Mac awake with the app open; the weekday check flags Council data older than 9 days.

The task's auto mode refuses to run code fetched from the web, so the browser part is a short snippet that travels inside the task's prompt (`tools/browser/council.js`). They load no code and only fetch pages; all parsing runs in the repository's Python. After editing a snippet, print the new prompt with `python3 tools/browser/routine-prompt.py` and update the task.

1. `tools/browser/council.js`, in a tab on consilium.europa.eu, reads the meeting calendar (from the first of the month to the end of the year, at least 6 months ahead), the Coreper I and II dates (next 9 months) and, for every formal Council meeting of the last 60 days that `data-cache/council-raw.json` does not hold yet, the official list of participants (PDF, passed as base64).
2. The device bridge cuts tool answers above about 260,000 characters and a participant list is about 230,000 characters in base64, so the collection comes in slices of 180,000 characters: `await window.__nodoNext()` answers one slice at a time, padded so the agent harness saves it to a file.
3. `tools/council/from_browser.py SLICES... --out FILE` joins the slices, checks the SHA-256 of the whole collection, reads the PDFs with pdfplumber and builds the collection. PDF text arrives in pieces ("M" + "r David VLAJČIĆ", "CYPRU S"); letters closer than 1.5pt join into one word and country headers are recognised with or without spaces. A header sharing a line with a name ("KLEIWEG DE ZWAAN AUSTRIA *") is split.
4. `tools/council/pull.py --body FILE` checks the collection (shape, dates, known countries, consilium meeting pages only), merges it into `data-cache/council-raw.json` (a readable list replaces an unreadable one; lists older than 400 days go, except the newest of each configuration) and rebuilds `v1/council.json` and its manifest entry with `tools/build-council.py`. It refuses a result that loses ambassadors, deputies or a configuration's representatives, or has fewer than 5 meetings or Coreper dates. `data-cache/council-applied.json` records the collection applied.
5. The task commits those four files to main. A run with nothing new changes nothing.
6. `tools/council/permreps-extra.json` holds ambassadors and deputies the lists do not name, from official sources (Permanent Representations' websites, Council documents), with the URL as third field. A newer participant list replaces them.

Tests: `python3 -m unittest discover -s tests/council -p 'test_*.py'` (two real participant lists are fixtures).

## MEP lists of the priority files

`v1/files.json` lists rapporteurs, shadows and rapporteurs for opinion with a `basis`: `ep-procedure-file` (the Parliament's Legislative Observatory procedure file, each name linked to the MEP id), `ep-open-data` (committee documents in the Parliament's open data) or `press`. The app marks the first two Verified. Shadows of a joint committee carry the joint label (`ITRE-LIBE`) because the Observatory lists them together. Entries of a package carry `part` (the part's id), shown next to the committee.

The Observatory blocks GitHub runners but answers cloud sessions. The Weekly nodo reference refresh runs `tools/files/oeil_diff.py` (a Python port of `tools/browser/oeil.js`, kept for runs from the Mac): it compares every priority file with a procedure against the procedure file and lists new, gone or moved names. The task then applies them with `tools/files/apply_mep_diff.py` (new names with basis `ep-procedure-file`, names that left removed, committee moves updated; MEPs not yet in meps.json skipped; more than 25 differences refused) and pushes through the validator and `scripts/refresh-guard.mjs --scope meps`.

## activity/ (MEP feed)

`v1/activity/<EP id>.json` holds one feed per MEP: plenary speeches, written questions (with addressee and answer status) and committee roles (rapporteur, shadow). `v1/activity/q/<question id>.json` holds the question and answer text, which the app loads when a card is opened. `v1/activity/index.json` lists the files and is also summarised in `manifest.json`.

The GitHub Action "Update MEP activity" (`.github/workflows/activity.yml`) runs `scripts/build-activity.mjs` twice a day (03:30 and 15:30 UTC) and commits the result, together with the cache in `data-cache/`. Details are fetched newest first and capped per run (`max_details`, 8000 by default), so the first backfill takes a few days. The job owns `data-cache/questions.json` (question metadata), `data-cache/qtext/` (the text extracted from each question's PDFs, one file per question, written once so the twice-daily commits stay small), `docs.json`, `pdf-diag.json` and `pdf-probe.json` and commits only those: the other jobs write to `data-cache/` while it runs. For a faster backfill start the workflow by hand with `max_details` set to 20000. To test, start it by hand with `only` set to a few MEP ids, for example `257041,256810`. If a stage fails, the previous items of that stage stay in place and the Action opens an issue labelled `structural`.

After the activity files are put back, the same job runs `scripts/build-reports.mjs`, which writes `v1/reports.json`: every report and opinion found in the feeds, with its rapporteur and shadows. The app uses it for automatic pages (a file with no curated page still shows who works on it) and for search. Nothing extra is fetched.

Source: European Parliament Open Data Portal (API v2), CC BY 4.0.

## Plenary agenda automation

The GitHub Action "Update plenary agenda" (`.github/workflows/agenda.yml`, `scripts/build-agenda.mjs`) runs on weekdays at 05:17, 09:17, 13:17 and 17:17 UTC.

1. For each plenary session starting within 21 days, Strasbourg and the Brussels mini-sessions, it reads `/meetings/MTG-PL-<day>/foreseen-activities` from the EP Open Data API for every sitting day. The EP website sits behind a bot check that blocks GitHub runners, the API does not.
2. Time slots, titles, procedure and document references, committees and rapporteurs come from the API. Rapporteurs carry their MEP id in the source, so they link to `meps.json` without name matching.
3. `agenda.json` is rewritten only when the content changed. If one sitting day of a session cannot be read, that session keeps its published entry, so a failure never shortens a live agenda. `stage` is `draft` when first seen more than 4 days before the session, `final-draft` within 4 days, `agenda` on the first sitting day and `updated` after later changes.
4. A new session or a stage change goes into `data-cache/agenda-notify.json`: `latest` holds what this run found, `log` the last 60 days. The Action opens one issue labelled `agenda` for `latest` and closes the older open "Agenda found" issues, so one current announcement stays open. The weekday check reports it.
5. Rapporteur ids missing from `meps.json` go to `data-cache/agenda-unmatched.json`, a `review/agenda-<date>` branch and an issue.
6. If the API fails, the run fails and opens an issue labelled `structural`. `scripts/probe-api.mjs` (workflow input `probe_paths`) fetches any API path for diagnosis.

## Autonomy: what goes live without review

Changes are sorted into three tiers. The policy lives in `scripts/autonomy.mjs`; its tests in `tests/commission/autonomy.test.mjs`.

- **Tier 1, applied automatically.** Commission cabinet changes when a run finds at most 5 of them and none touches a Head of Cabinet, Deputy Head of Cabinet (including acting) or Director of Coordination. Additions, removals and role changes all qualify. Each application is appended to `data-cache/autonomy-log.json` and listed under `autonomy` in `status.json` for 7 days. Phone, responsibility and contact updates were already automatic.
- **Tier 3, waits for a merge.** Senior cabinet roles, commissioners joining or leaving the College, and any batch over the limit. The rule is all-or-nothing per run: one change that needs review holds the whole batch on `review/commission`, and the issue says why.
- **Failure issues close themselves.** The Commission, MEP directory, file stream and agenda workflows close their own "build needs attention" issue on the next successful run.

The gate is `scripts/validate-data.mjs`. It checks counts, required fields, role classes, duplicate keys, ISO dates, https sources, and that every MEP id, cabinet key and commissioner slug in `files.json` resolves. With `--base <ref>` it also refuses a sudden drop in MEPs or cabinet members. The Commission and MEP workflows run it before every push and push nothing if it fails. `validate.yml` runs it on every pull request and every change to `v1/` on main, and opens an issue if main fails.

## Health status (status.json)

The Action "Publish health status" (`.github/workflows/status.yml`) writes `status.json` to the `status` branch after every data workflow finishes (and on weekdays at 06:20 UTC as a backstop). It holds the latest run of each workflow, open issues, review branches, file counts, the build date of every data file (`freshness`), the dates still ahead for each priority file (`files`) and manifest entries that no longer match their file (`manifestProblems`, from `scripts/status-data.mjs`). The weekday Claude check reads it from `https://raw.githubusercontent.com/gianmariasisti-afk/nodo-data/status/status.json`.

GitHub starts scheduled runs on this repo 6–7 hours late and skips some (observed 5–12 October 2026): the morning jobs land around midday UTC and the agenda job runs about twice a day out of four slots. Times in this README are the scheduled ones.

The daily "Update file stream" run also recomputes the `files` entry of `v1/manifest.json` from `v1/files.json`, which is edited by hand, and removes anything in the files map that is not an entry.

## Sources and reuse

Data comes from the European Parliament, European Commission and Council of the EU public websites and open data portals. Check each institution's reuse terms before reusing the data. Everything in this repository is public.

## updates/ (file update stream)

`v1/updates/updates.json` is the latest feed for the priority files (last 90 days plus upcoming Council dates). `timelines.json` holds the full history per file for the file detail screen. `push-queue.json` lists today's push candidates; the sender applies per-user follows, toggles, caps and quiet hours. Events come from the EP Open Data procedure endpoint (`/api/v2/procedures/<year>-<number>`) for every procedure a file follows (committee referral, draft report, amendments, opinions, committee and plenary votes, trilogues, signature, publication), the `next` dates in `files.json` and stage changes. A procedure added to a file later seeds its history without push candidates. State lives in `data-cache/updates/state.json`.

The Action "Update file stream" (`.github/workflows/updates.yml`) runs `scripts/build-updates.mjs` daily at 06:41 UTC and commits the result. The first run per file seeds history without push candidates. If a procedure cannot be fetched the previous events stay, the Action exits non-zero and opens an issue labelled `structural`. Tests: `node --test tests/updates/updates.test.mjs`. To run it by hand: `node scripts/build-updates.mjs --files v1/files.json --out v1/updates --state data-cache/updates --manifest v1/manifest.json`.

Commission and cabinet changes that need a decision follow the same pattern as the MEP directory: one rolling branch `review/commission` and one open issue, rebuilt on every run.

## Country pages: monument photos and flag band

Each country page shows a national monument photo cut into five columns, a band in the flag's colours, and the monument's name in the top bar. Photos live in `monuments/` (from Unsplash, 900 px wide, photographer credited on the page). Name, place, year, crop and flag layout per country are in `MONUMENTS` and `FLAGS` in `index.html`. Years appear only where a source gives one completion or opening date.

Flag colour sources:
- Specified by the country (law, decree, standard or government guide): AT (Ministry of Defence regulation 2018), DE (federal corporate design 1999), DK (DS 359:2005), EE (Parliament and Government Office), ES (Royal Decree 441/1981, sRGB conversion), FI (Government Decision 827/1993, sRGB approximation), FR (government colour table), HU (MSZ 1361:2009), IE (Department of the Taoiseach), IT (Gazzetta Ufficiale 174/2006 Pantone, hex from FOTW), LT (flag law Pantone, suggested hex), LV (2018 amendment, Pantone 201 C), MT (Graphical Specifications 2008), NL (NEN 1958), PL (Coat of Arms Act 1980, sRGB conversion), RO (Law 75/1994 as revised 2023), SE (NCS), SI (Official Gazette table).
- Official Pantone, hex from Wikipedia or FOTW: BE (Belgian protocol guide), BG (textile Pantone), CY (2006 Pantone), HR (Parliament site), LU (Grand-Ducal Regulation 1993).
- No official shade: CZ (Wikipedia via FOTW), EL (2010 Ministry of Culture emblem guide), PT (Presidency recommendation via Wikipedia; sphere yellow approximated), SK (Album des Pavillons 2023).
- Simplified on purpose: Nordic crosses and Greece's canton keep their layout; coats of arms (HR, PT, SI, SK) and Cyprus's map and branches become small marks.

## Next steps link to their sources

Every dated step under a file's "What happens next" names the source that gives its date (`src` in `v1/files.json`, an id from the file's `sources`). The app shows the step as a link to that page. `scripts/validate-data.mjs` fails a dated step without a source.

### Scheduled checks

Data with a feed is refreshed by GitHub Actions (above). Everything editorial or behind a site that blocks GitHub is checked by scheduled Claude tasks. Each one pushes only through `scripts/validate-data.mjs` and, where it edits data by hand, `scripts/refresh-guard.mjs`.

| Task | When | Covers |
|---|---|---|
| nodo Council refresh (Mon and Thu) | Mon and Thu 07:30, on Gianmaria's Mac (built-in browser) | council.json meetings, Coreper, participant lists (the Council site's bot check blocks the cloud) |
| Weekly nodo reference refresh | Mon 08:07, cloud | files.json status and next steps (scope `files`); MEP lists against the Observatory (`tools/files/oeil_diff.py` then `apply_mep_diff.py`, scope `meps`); Parliament calendar (`calendar`); Presidency handover (`presidency`); hand-added permanent representatives (`permreps`) |
| nodo weekly requests and backend | Mon 08:52, cloud | file requests and empty searches from Supabase events; Supabase security and performance advisors, auth and API errors; one email |
| Weekday nodo data check | Mon–Fri 07:30, cloud | reads status.json: workflows, freshness, files `checkedDays`, `reference` (calendar age, days to the Presidency handover and whether the next profile exists, oldest hand-added perm rep check), open issues |

- `checked` (per file) is the day status and next steps were last confirmed against sources. The file screen shows it as "Status checked". The validator refuses a `checked` date in the future and any `next` date earlier than `checked`.
- `scripts/refresh-guard.mjs --scope <list> [--sync-manifest]` refuses any change outside the named scopes: `files` (per file status, stage, next, sources, caveats, checked, council.note; top-level asOf and generated), `meps` (the meps lists), `calendar` (v1/calendar.json), `presidency` (presidency.current and presidency.next in council.json), `permreps` (tools/council/permreps-extra.json). `--sync-manifest` updates bytes and sha256 of changed v1 files. Adding or removing a priority file, or changing commissioners, cabinet, DGs or working parties, always stops the push.
- Presidency: the app shows motto, priorities and links from whichever of `presidency.current` or `presidency.next` matches the Presidency in office by date, and nothing when neither does. The reference task adds `next` once the incoming Presidency publishes its programme, and from the handover moves it to `current`.
- `tools/council/permreps-extra.json` holds ambassadors and deputies not named in Council participant lists, as [name, date checked, https source]. The reference task rechecks each entry against its source once a month and updates the date. The Council refresh merges the file into council.json.
- `calendar.json` carries `checked`, set by the reference task after comparing plenary sessions and the published calendar with the Parliament's official calendar pages.
- The Commission updater reads the President's cabinet like the others; its people changes always wait for review on `review/commission`.

## Search, automatic pages and your files

- Search forgives typos: a name or a word close to one in the data is matched, with a "Showing results for" line.
- A search with no curated file offers "Request a full page", logged as a `request` usage event.
- Automatic pages: each report or opinion in `v1/reports.json` opens a page with its rapporteur, shadows, other committees on the same file and the PDF. Report and opinion cards in an MEP's activity open it.
- A curated file shows the date its data was checked, its sources and its Legislative Observatory link under the title.
- The Files view starts with Your files and what moved in the last 7 days. "Which files do you track?" is asked once after sign-in. Your week shows what the Monday email will hold.
- The Monday email and alert switches are saved on the profile as `notify`. Nothing is sent yet.

## minutes.json

Built by the Mon and Thu refresh on the Mac (task "nodo Council refresh (Mon and Thu)", step 7 onwards), because the Parliament's minutes pages sit behind a bot check that GitHub and cloud sessions cannot pass.

1. `tools/browser/minutes.js` runs in a www.europarl.europa.eu tab. It lists the minutes (PV) on the `/committees/en/<code>/meetings/minutes` page of every committee named in `files.json` (lead and opinion committees, joint committees come with them), keeps those from the last 75 days that `data-cache/minutes-raw.json` does not hold yet (25 per run at most), and reads each PDF as text with pdf.js. pdf.js 4.4.168 is kept in `vendor/pdfjs/` and imported from nodo's own site; the app does not load it. Only text leaves the tab: some minutes carry scanned annexes of 15 MB.
2. `tools/minutes/from_browser.py` joins the slices (same protocol and checks as the Council refresh) and parses each set of minutes: committees, date, who presided, agenda items with procedure numbers, stage lines and speakers (with the tag the minutes give them, e.g. "(DG GROW)"), and the Commission officials in the attendance list.
3. `tools/minutes/pull.py` merges them into `data-cache/minutes-raw.json` (kept 400 days) and rebuilds `v1/minutes.json` and its manifest entry. An agenda item belongs to a file when it carries one of the file's procedure numbers (main, related or a part's) or names the file in its title. Speakers are matched to `meps.json` by name; whoever presided that meeting is left out; Commission officials are recognised by their tag or the attendance list. Names that match no MEP are listed in `data-cache/minutes-report.json`.

```json
{
  "through": "2026-10-15", "minutes": 61,
  "files": {
    "industrial-accelerator-act": {
      "meetings": [{ "pv": "CJ80-PV-2026-09-28-1", "date": "2026-09-28", "code": "CJ80", "item": 3, "title": "…", "stage": ["Consideration of draft report"], "spoke": 24 }],
      "speakers": [{ "id": "256843", "n": 2, "dates": ["2026-09-02", "2026-09-28"], "pvs": ["…"] }],
      "officials": [{ "name": "Joan Canton", "dg": "GROW", "spoke": ["2026-09-28"], "present": ["2026-09-02"] }]
    }
  }
}
```

`speakers` holds everyone who spoke, roles included: the app compares them with the file's own lists and shows only the MEPs with no role. Minutes name who spoke, not what they said, and come out a few weeks after each meeting. `scripts/validate-data.mjs` checks that every speaker is in `meps.json` and every file id exists.
