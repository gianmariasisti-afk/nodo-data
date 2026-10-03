# nodo-data

Public data files for **nodo**, an app that gives public affairs professionals fast access to EU institutions: MEPs, the Commission, the Council and the Parliament calendar and plenary agendas.

Served by GitHub Pages at `https://gianmariasisti-afk.github.io/nodo-data/`. Open that address on a phone and use Share → Add to Home Screen (iPhone) or Install app (Android).

The app reads `v1/` from its own origin. Profile and favourites live in the browser on each device.

## Layout

```
index.html            the nodo app (PWA)
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
```

`v1` is the schema version. Fields can be added inside v1. A rename or removal creates `v2` and `v1` stays online for installed apps.

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

## Weekly routine

1. The Parliament publishes the final draft agenda on the Thursday before a Strasbourg session.
2. The agenda PDF is converted to `agenda.json` and rapporteurs are matched to MEP ids.
3. `manifest.json` is regenerated and the files are committed to `main`.
4. GitHub Pages republishes within about a minute.

## Sources and reuse

Data comes from the European Parliament, European Commission and Council of the EU public websites and open data portals. Check each institution's reuse terms before reusing the data. Everything in this repository is public.
