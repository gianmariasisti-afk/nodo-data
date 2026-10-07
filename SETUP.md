# Switching on accounts and sync

nodo runs in preview mode until `config.js` holds a Supabase URL and key. In preview mode everything is saved in the browser and the sign-in screens are simulated. These steps turn on real sign-in and cloud sync.

## 1. Create the Supabase project

1. Create a project at supabase.com. Choose an EU region (Frankfurt). Stakeholder lists can reveal client work, so keep the data in the EU.
2. Open **SQL Editor**, paste `supabase/schema.sql` and run it. It creates the `user_state` table, row-level security (each person can read and write only their own row) and the `delete_my_account()` function that the in-app "Delete my account" button calls.
3. Open **Project settings → API** and copy the project URL and the `anon` public key.
4. Put both in `config.js`:

```js
window.NODO_CONFIG = { supabaseUrl: "https://xxxx.supabase.co", supabaseAnonKey: "eyJ..." };
```

The anon key is public by design. Never put the `service_role` key anywhere in this repository.

## 2. Email (magic link and code)

1. **Authentication → Providers → Email**: keep it on. Turn **Confirm email** on.
2. **Authentication → Email Templates**: edit both **Confirm signup** and **Magic Link**. Add the code so the six-digit box in the app works as well as the link:

```html
<h2>Your nodo sign-in</h2>
<p><a href="{{ .ConfirmationURL }}">Sign in to nodo</a></p>
<p>Or type this code in the app: <b>{{ .Token }}</b></p>
```

3. **Authentication → URL Configuration**: set **Site URL** to `https://gianmariasisti-afk.github.io/nodo-data/` and add the same address under **Redirect URLs**. Add `http://localhost:8765/` while testing.
4. Set up custom SMTP (**Project settings → Authentication → SMTP**) with a service such as Resend, using an address on a domain you control. The built-in sender is limited to a few emails an hour, and on the Free plan Supabase only lets you edit email templates once custom SMTP is on. Until then the email carries the link only, and the six-digit code box in the app has nothing to receive.

## 3. Social sign-in

Each provider needs a developer app. The sign-in screen shows a provider button only when its name is listed in `providers` in `config.js` (for example `providers: ["google"]`). Add the name after you enable the provider in Supabase. Use this redirect (callback) URL in all of them: `https://xxxx.supabase.co/auth/v1/callback`.

| Provider | Where | Notes |
|---|---|---|
| Google | Google Cloud Console → OAuth client (Web) | Enable the provider in Supabase and paste the client ID and secret. |
| LinkedIn | LinkedIn developer portal → app with **Sign In with LinkedIn using OpenID Connect** | In Supabase enable **LinkedIn (OIDC)**. |
| Apple | Apple Developer → Services ID with **Sign in with Apple** | Apple requires this option in any app that offers Google or LinkedIn. The Apple client secret expires every six months and needs renewing. |

## 4. App Store

The App Store listing needs a native shell around the web app. The usual route is Capacitor.

- Apple Developer Program account (€99 a year) and a Mac with Xcode for the build.
- In the native app, magic links and social sign-in return through a deep link. Register a URL scheme or universal link, add it under **Redirect URLs**, and the six-digit code remains the fallback.
- App Review needs: a privacy policy URL, in-app account deletion (built), Sign in with Apple next to the other social options (built), and the privacy "nutrition label" (name, email, and the lists a user creates, linked to the user, used for app functionality).
- Parliament data is CC BY 4.0. Keep the source line visible in the app. Check the Commission and Council reuse terms for use inside a commercial app.

## 5. Before public launch

- The sign-in screens and the profile link to "What nodo stores", a plain-language notice built into the app (`dataNoticeHtml` in `index.html`). It describes what the code does. Keep it in step when the stored data, the sign-in providers or the third parties change, for example if analytics are added.
- Still to publish: a formal privacy notice that names the data controller and a contact address, and terms of use. The app does not claim that people accept terms, because none exist yet. Add the links next to "What nodo stores" once they do.
- Decide who the data controller is and have legal review it. The app stores names, emails and the lists a person builds.
- Test the full path on a phone: sign up by email, sign in with each social option, edit a list, sign in on a second device, delete the account.

## How sync works

- One row per person in `user_state`: profile, saved people, and file list edits.
- List edits are stored as additions and removals on top of the shared data in `v1/files.json`, so a data refresh never overwrites a person's edits.
- The first time a device meets an account, its local data and the cloud data are merged. After that the newer copy wins.
- Without a connection the app keeps working and shows "Syncs when you are back", then pushes the change.
