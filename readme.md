# 🧵 Filament Stock

Know how much 3D-printer filament you have left, get warned before you run out,
and log usage by scanning a QR code / NFC sticker on the spool.
Includes a **Learn** section with printable X2D settings cards per material.

Static site (Tailwind + Alpine.js) on GitHub Pages, data and login in Supabase,
filament catalogue from [SpoolmanDB](https://github.com/Donkie/SpoolmanDB).

Live: https://balexandre.github.io/filament-stock/

## Setup

### 1. Supabase project

1. Create a new project at <https://supabase.com/dashboard>.
2. **SQL Editor → New query** → paste [`supabase/schema.sql`](supabase/schema.sql) → **Run**.
   It is idempotent: re-run it after pulling changes (e.g. desiccant tracking) — existing data is kept.
3. **Authentication → URL Configuration**
   - Site URL: `https://balexandre.github.io/filament-stock/`
   - Redirect URLs: add `https://balexandre.github.io/filament-stock/**` and `http://localhost:8080/**`
4. **Authentication → Providers → Email**: keep *Confirm email* on.
5. **Project Settings → API**: copy the *Project URL* and the *anon public* key into
   [`js/config.js`](js/config.js). The anon key is safe to commit; Row Level Security protects
   the data. Never commit the `service_role` key.

### 2. Accounts

- The **first person to sign up without an invite code** gets their own workshop (household)
  and becomes its owner.
- Others join from **Settings → Family → invite code**: they enter that code when creating
  their account. New members start as **kids** (can log usage, add rolls, move spools; can't
  edit/delete spools or change minimums). The owner can switch them to grown-up.
- When everyone is in: **Authentication → Providers → Email → disable "Allow new users to sign up"**.
  The app shows a friendly "registrations are closed" message.

### 3. GitHub Pages

Repository **Settings → Pages → Deploy from a branch → `master` / root**.

### Run locally

```bash
python3 -m http.server 8080
```

Open <http://localhost:8080/>. Labels always point to the live site (`siteUrl` in `js/config.js`),
so you can print them from localhost.

## Labels: QR and NFC

Each spool has a 4-character code. Its label URL is
`https://balexandre.github.io/filament-stock/#/s/CODE` and opens the "how much did you use?" screen.

- **QR**: Labels page → tick spools → Print (62 × 32 mm labels, 3 per row on A4).
- **NFC (NTAG215)**: Chrome on Android writes the tag directly from the app.
  On iPhone, copy the link and write it as a *URL record* with the **NFC Tools** app.
  Any phone opens the link when it taps the sticker.

## Project layout

```
index.html            all screens (hash routes: #/, #/s/CODE, #/add, #/labels, #/shop, #/learn, #/settings)
css/app.css           shared styles + print layouts (labels, A6 cards)
js/config.js          Supabase URL + anon key, public site URL
js/api.js             every Supabase call
js/catalog.js         SpoolmanDB download + IndexedDB cache + search
js/materials.js       Learn content and X2D settings per material
js/app.js             Alpine component (state, routing, actions)
supabase/schema.sql   tables, views, RLS, triggers, RPCs
mockup/               the original clickable mockup (fake data)
```
