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

- Home, "the Monday edition" (since 18 Oct 2026): masthead with the date, a headline that names the week, search and a week card; Your files with a five-step track from idea to law; Who ties them together; Coming up; Saved people and Recently viewed. Removed from Home: the calendar hero, news block, Files tile, the four institution tiles, cabinet of the day, country desk and seats by group. With no followed file, it uses all files and says so.
- Coming up as a week carousel (since 19 Oct 2026): one card per week for the four weeks after this one, swiped sideways with the next card peeking in. Each card shows the week type, a count of items and files, and up to three items; a meeting on consecutive days shows once as a range. Dots under the cards follow the one in view. Replaces the vertical timeline.
- On these files (since 20 Oct 2026), under Coming up: the rapporteurs, lead commissioner and first two cabinet members on the files of the week card in view, saved people first, five shown with "Show all". It changes as you swipe. A note when a file has no rapporteur yet, the Council working party with the Presidency that chairs it, and "Everyone on …" links to each file page for shadows and opinion rapporteurs. It names roles on the files, not who attends the meetings.
- The map of your files: files in bands by stage, lines between files that share people, tap a file to see whom it shares. Opens from Map on Home and from the Files view.
- Burger menu (since 19 Oct 2026), replacing the floating tab bar: a top bar on every view with the wordmark (back to Today), your profile and a Menu button; deep blue on Today, light elsewhere. Menu opens a drawer from the right with Today, People (Parliament, Commission, Council), Calendar and Files, then News on the files, Saved people and your profile. Escape or the scrim closes it; focus returns to Menu. The PREVIEW marker now sits bottom left.
- People landing page: three photo blocks (Parliament, Commission, Council) cut into columns like the country pages; each opens its section, which keeps a "People" back button. Parliament and Commission photos hotlinked from Unsplash (Paolo Margari, Carl Campbell), credited on each block; the Council block uses a photo of the Europa building from Wikimedia Commons (CC BY-SA 4.0, cropped), stored in monuments/council-europa.jpg.

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
