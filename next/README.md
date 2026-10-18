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

Workflow:

1. Rebuild from the live app: `node tools/preview/build.mjs`.
2. Change a feature in `features.js` / `features.css`, rebuild, test on the phone.
3. When approved, move the feature into the root `index.html`, then rebuild the preview from it.

## Features in testing

None right now.

Promoted to the live app on 18 Oct 2026:

- Country-page monument photos and flag band, and source links on next steps.
- Forgiving search, Request a full page, automatic pages for Parliament reports and opinions, report cards in MEP activity, the provenance line on curated files, the Files view (Your files, moved in the last 7 days, Monday email and alert switches), "Which files do you track?" after sign-in, and Your week. The email and alert switches are saved on the profile as `notify`. Nothing is sent yet.

Rules for preview features:

- Never change the shape of what is saved in `user_state` in a way the live app cannot read. Add new fields; leave existing ones as they are.
- Keep the patches in `build.mjs` small. Feature code belongs in `next/features.js`, not in the build script.

## One-time Supabase setting

Add `https://gianmariasisti-afk.github.io/nodo-data/next/` under Authentication → URL Configuration → Redirect URLs. Without it, Google sign-in from the preview returns to the main app instead.

## On the phone

Open the address in Safari, sign in, then Share → Add to Home Screen. It installs as a separate app named "nodo next", next to the main nodo. A Home Screen app on iPhone keeps its own sign-in, so sign in once inside it.
