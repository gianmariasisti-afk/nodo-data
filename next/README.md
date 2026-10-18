# nodo preview (`next/`)

A private copy of the app for testing features before they reach everyone.

- Address: https://gianmariasisti-afk.github.io/nodo-data/next/
- Who gets in: the Supabase accounts listed in `PREVIEW_ACCOUNTS` in `tools/preview/build.mjs`. Anyone else who signs in sees "This preview is private" and a link back to the main app. Nothing is synced or logged for them.
- Data: the same `v1/` files and the same Supabase project as the live app. Saved people, lists and follows are shared with the main app, so a change in one shows in the other.
- Usage events from the preview carry a `session_id` starting `next-`, so they can be filtered out of the usage dashboard.
- Search engines are told not to index it (`noindex`). The address is public. The gate keeps other accounts out of unreleased features, but it is not a security boundary: row-level security in Supabase is what protects each person's data, as in the live app.

## How it is built

`node tools/preview/build.mjs` generates `index.html`, `sw.js` and `manifest.webmanifest` here from the live files at the repository root, and applies a short list of patches: paths one level up, the preview name and icon label, its own service worker cache, the account gate and the PREVIEW marker. It then injects the preview's features from `features.js` and `features.css`. Each patch must match exactly once, or the build stops and names it.

`index.html` here is generated. Edit `features.js` and `features.css`, never the generated page.

`node tools/preview/build-reports.mjs` writes `data/reports.json`, the index behind automatic pages: every Parliament report and opinion in nodo's MEP activity data (`v1/activity`) with its rapporteur and shadows. Re-run it to bring the index up to date with the activity data.

Workflow:

1. Rebuild from the live app: `node tools/preview/build-reports.mjs && node tools/preview/build.mjs`.
2. Change a feature in `features.js` / `features.css`, rebuild, test on the phone.
3. When approved, move the feature into the root `index.html`, then rebuild the preview from it.

## Features in testing

1. Forgiving search: misspelt names and words find the closest match, with a "Showing results for" line.
2. Request a full page: a search with no curated file offers a request, logged as a `request` usage event.
3. Automatic pages: Parliament reports and opinions with rapporteur, shadows, related committees and the document.
4. MEP activity: report and opinion cards open their automatic page.
5. Curated files: a line under the title with the checked date, the sources and the Observatory link.
6. Files view: Your files, what moved in the last 7 days, and Monday email and alert switches (saved on the profile as `notify`; nothing is sent).
7. "Which files do you track?": asked once after sign-in, and from the Files view.
8. Your week: the Monday email's content, shown in the app.
9. Country pages: a photo of a national monument in five columns above the country name (the large code disc is hidden on these pages). Photos in `monuments/` (Unsplash, credited on the page); name, place, year and crop per country in `NX_MON` in `features.js`. Years only where a source gives one completion or opening date.
10. Country pages: a full-width band in the national flag's colours under the photo columns (`NX_FLAG` in `features.js`). Colour sources:
    - Specified by the country (law, decree, standard or government guide): AT (Ministry of Defence regulation 2018), DE (federal corporate design 1999), DK (DS 359:2005), EE (Parliament and Government Office), ES (Royal Decree 441/1981, sRGB conversion), FI (Government Decision 827/1993, sRGB approximation), FR (government colour table), HU (MSZ 1361:2009), IE (Department of the Taoiseach), IT (Gazzetta Ufficiale 174/2006 Pantone, hex from FOTW), LT (flag law Pantone, suggested hex), LV (2018 amendment, Pantone 201 C), MT (Graphical Specifications 2008), NL (NEN 1958), PL (Coat of Arms Act 1980, sRGB conversion), RO (Law 75/1994 as revised 2023), SE (NCS), SI (Official Gazette table).
    - Official Pantone, hex from Wikipedia or FOTW: BE (Belgian protocol guide), BG (textile Pantone), CY (2006 Pantone), HR (Parliament site), LU (Grand-Ducal Regulation 1993).
    - No official shade: CZ (Wikipedia via FOTW), EL (2010 Ministry of Culture emblem guide), PT (Presidency recommendation via Wikipedia), SK (Album des Pavillons 2023).
    - Simplified on purpose: Nordic crosses and Greece's canton keep their layout; coats of arms (HR, PT, SI, SK) and Cyprus's map and branches become small marks.

Rules for preview features:

- Never change the shape of what is saved in `user_state` in a way the live app cannot read. Add new fields; leave existing ones as they are.
- Keep the patches in `build.mjs` small. Feature code belongs in `next/features.js`, not in the build script.

## One-time Supabase setting

Add `https://gianmariasisti-afk.github.io/nodo-data/next/` under Authentication → URL Configuration → Redirect URLs. Without it, Google sign-in from the preview returns to the main app instead.

## On the phone

Open the address in Safari, sign in, then Share → Add to Home Screen. It installs as a separate app named "nodo next", next to the main nodo. A Home Screen app on iPhone keeps its own sign-in, so sign in once inside it.
