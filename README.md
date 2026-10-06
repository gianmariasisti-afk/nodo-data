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
sw.js                 service worker: offline shell, fresh data when online
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

## files.json

Seven priority legislative files (MFF 2028–2034, Digital Omnibus, Industrial Accelerator Act, Digital Networks Act, Digital Fairness Act, Chips Act 2.0 and CADA, AI Act after the Omnibus). Each file lists `meps` (id, role, committee, `basis`), `commission` (lead and associated commissioner slugs), `cabinet` (keys from `commission.json` with a reason), Council configurations, `caveats` and `sources`. `basis` is `ep-open-data` (verified from `activity/` feeds) or `press` (named in reporting, to verify in the EP procedure file). MEP ids match `meps.json`.

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

## activity/ (MEP feed)

`v1/activity/<EP id>.json` holds one feed per MEP: plenary speeches, written questions (with addressee and answer status) and committee roles (rapporteur, shadow). `v1/activity/q/<question id>.json` holds the question and answer text, which the app loads when a card is opened. `v1/activity/index.json` lists the files and is also summarised in `manifest.json`.

The GitHub Action "Update MEP activity" (`.github/workflows/activity.yml`) runs `scripts/build-activity.mjs` twice a day (03:30 and 15:30 UTC) and commits the result, together with the cache in `data-cache/`. Details are fetched newest first and capped per run (`max_details`), (8000 by default), so the first backfill takes a few days. For a faster backfill start the workflow by hand with `max_details` set to 20000. To test, start it by hand with `only` set to a few MEP ids, for example `257041,256810`. If a stage fails, the previous items of that stage stay in place and the Action opens an issue labelled `structural`.

Source: European Parliament Open Data Portal (API v2), CC BY 4.0.

## Plenary agenda automation

The GitHub Action "Update plenary agenda" (`.github/workflows/agenda.yml`, `scripts/build-agenda.mjs`) runs on weekdays at 05:17, 09:17, 13:17 and 17:17 UTC.

1. For each Strasbourg session starting within 21 days it reads `/meetings/MTG-PL-<day>/foreseen-activities` from the EP Open Data API for every sitting day. The EP website sits behind a bot check that blocks GitHub runners, the API does not.
2. Time slots, titles, procedure and document references, committees and rapporteurs come from the API. Rapporteurs carry their MEP id in the source, so they link to `meps.json` without name matching.
3. `agenda.json` is rewritten only when the content changed. `stage` is `draft` when first seen more than 4 days before the session, `final-draft` within 4 days, `agenda` on the first sitting day and `updated` after later changes.
4. A new session or a stage change appends to `data-cache/agenda-notify.json`. The weekday check reads it, sends one push notification per entry and clears it. The Action also opens an issue labelled `agenda`.
5. Rapporteur ids missing from `meps.json` go to `data-cache/agenda-unmatched.json`, a `review/agenda-<date>` branch and an issue.
6. If the API fails, the run fails and opens an issue labelled `structural`. `scripts/probe-api.mjs` (workflow input `probe_paths`) fetches any API path for diagnosis.

## Sources and reuse

Data comes from the European Parliament, European Commission and Council of the EU public websites and open data portals. Check each institution's reuse terms before reusing the data. Everything in this repository is public.

## updates/ (file update stream)

`v1/updates/updates.json` is the latest feed for the priority files (last 90 days plus upcoming Council dates). `timelines.json` holds the full history per file for the file detail screen. `push-queue.json` lists today's push candidates; the sender applies per-user follows, toggles, caps and quiet hours. Events come from the EP Open Data procedure endpoint (`/api/v2/procedures/<year>-<number>`), the `next` dates in `files.json` and stage changes. State lives in `data-cache/updates/state.json`.

The Action "Update file stream" (`.github/workflows/updates.yml`) runs `scripts/build-updates.mjs` daily at 06:41 UTC and commits the result. The first run per file seeds history without push candidates. If a procedure cannot be fetched the previous events stay, the Action exits non-zero and opens an issue labelled `structural`. Tests: `node --test tests/updates/updates.test.mjs`. To run it by hand: `node scripts/build-updates.mjs --files v1/files.json --out v1/updates --state data-cache/updates --manifest v1/manifest.json`.
