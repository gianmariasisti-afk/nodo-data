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
```

`v1` is the schema version. Fields can be added inside v1. A rename or removal creates `v2` and `v1` stays online for installed apps.

## How the app moves between screens

Profiles stack: a person opened from a file sits on top of the file, and Back returns to the file. Every screen change is one browser-history entry, so the phone's back gesture steps back inside nodo. Inside an embedded frame (the Claude artifact) the browser history is left alone and Back walks the same trail in memory. The code is the "navigation" block in `index.html`.

The service worker keeps two caches: `nodo-v<n>` for the app shell and `nodo-data-v1` for `v1/`. Bump `VERSION` in `sw.js` with every change to the shell; the data cache survives app updates, so phones do not download the directory again. Data requests wait 3 seconds for the network and then answer from the saved copy.

The artifact page is this `index.html` without its first line, without `config.js` (so it runs in preview mode) and with `avatars.js` inlined.

## files.json

Seven priority legislative files (MFF 2028–2034, Digital Omnibus, Industrial Accelerator Act, Digital Networks Act, Digital Fairness Act, Chips Act 2.0 and CADA, AI Act after the Omnibus). `procedure` is the main EP procedure; `procedures` lists related ones (the MFF interim report is 2025/0571R(APP)) and each of `parts` can carry its own `procedure`; the update stream follows all of them. `proposal` keeps the Commission reference. Each file lists `meps` (id, role, committee, `basis`), `commission` (lead and associated commissioner slugs), `cabinet` (keys from `commission.json` with a reason), Council configurations, `caveats` and `sources`. `basis` is `ep-open-data` (verified from `activity/` feeds) or `press` (named in reporting, to verify in the EP procedure file). MEP ids match `meps.json`.

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

The Council website (consilium.europa.eu) answers 403 to GitHub runners, so `council.json` has no Action. A Claude session refreshes it through the desktop app's browser:

1. In the browser, on consilium.europa.eu: read the meeting calendar (`category=meeting`, rest of the year), the Coreper dates (`category=mpo`) and, for every formal Council meeting of the year, the official list of participants (PDF, read with pdf.js). Country headers can arrive split ("CYPRU S"); the parser joins them.
2. Return the collection as one JSON string from the browser together with its SHA-256; check the hash in the workspace.
3. `python3 tools/build-council.py RAW.json tools/council/permreps-extra.json` rebuilds `v1/council.json` and its manifest entry. It keeps the presidency, population and configuration metadata, and rebuilds meetings, Coreper dates, each configuration's last meeting and representatives, and the ambassadors and deputies named in the lists.
4. `tools/council/permreps-extra.json` holds ambassadors and deputies the lists do not name, from official sources (Permanent Representations' websites, Council documents), with the URL as third field. A newer participant list replaces them.

The weekday check reports the file's age on Mondays and asks for a refresh after 30 days.

## activity/ (MEP feed)

`v1/activity/<EP id>.json` holds one feed per MEP: plenary speeches, written questions (with addressee and answer status) and committee roles (rapporteur, shadow). `v1/activity/q/<question id>.json` holds the question and answer text, which the app loads when a card is opened. `v1/activity/index.json` lists the files and is also summarised in `manifest.json`.

The GitHub Action "Update MEP activity" (`.github/workflows/activity.yml`) runs `scripts/build-activity.mjs` twice a day (03:30 and 15:30 UTC) and commits the result, together with the cache in `data-cache/`. Details are fetched newest first and capped per run (`max_details`, 8000 by default), so the first backfill takes a few days. The job owns `data-cache/questions.json`, `docs.json`, `pdf-diag.json` and `pdf-probe.json` and commits only those: the other jobs write to `data-cache/` while it runs. For a faster backfill start the workflow by hand with `max_details` set to 20000. To test, start it by hand with `only` set to a few MEP ids, for example `257041,256810`. If a stage fails, the previous items of that stage stay in place and the Action opens an issue labelled `structural`.

Source: European Parliament Open Data Portal (API v2), CC BY 4.0.

## Plenary agenda automation

The GitHub Action "Update plenary agenda" (`.github/workflows/agenda.yml`, `scripts/build-agenda.mjs`) runs on weekdays at 05:17, 09:17, 13:17 and 17:17 UTC.

1. For each plenary session starting within 21 days, Strasbourg and the Brussels mini-sessions, it reads `/meetings/MTG-PL-<day>/foreseen-activities` from the EP Open Data API for every sitting day. The EP website sits behind a bot check that blocks GitHub runners, the API does not.
2. Time slots, titles, procedure and document references, committees and rapporteurs come from the API. Rapporteurs carry their MEP id in the source, so they link to `meps.json` without name matching.
3. `agenda.json` is rewritten only when the content changed. If one sitting day of a session cannot be read, that session keeps its published entry, so a failure never shortens a live agenda. `stage` is `draft` when first seen more than 4 days before the session, `final-draft` within 4 days, `agenda` on the first sitting day and `updated` after later changes.
4. A new session or a stage change goes into `data-cache/agenda-notify.json`: `latest` holds what this run found, `log` the last 60 days. The Action opens one issue labelled `agenda` for `latest` and closes the older open "Agenda found" issues, so one current announcement stays open. The weekday check reports it.
5. Rapporteur ids missing from `meps.json` go to `data-cache/agenda-unmatched.json`, a `review/agenda-<date>` branch and an issue.
6. If the API fails, the run fails and opens an issue labelled `structural`. `scripts/probe-api.mjs` (workflow input `probe_paths`) fetches any API path for diagnosis.

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
