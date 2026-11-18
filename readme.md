<p align="center">
  <img src="favicon.svg" alt="" width="96" height="96">
</p>

<h1 align="center">Filament Stock</h1>

<p align="center">
  Know how much 3D-printer filament you have left, get warned before you run out,<br>
  and log usage by scanning a QR code or NFC sticker on the spool.
</p>

<p align="center">
  <a href="https://balexandre.github.io/filament-stock/"><b>Open the app →</b></a>
</p>

A static site (Tailwind + Alpine.js, no build step) on GitHub Pages. Login and data live in
Supabase, and the filament catalogue comes from [SpoolmanDB](https://github.com/Donkie/SpoolmanDB).
It's made for a Bambu Lab X2D with an AMS 2 Pro and an AMS HT, and for a household where an
11-year-old prints too.

## Features

- **📦 Stock at a glance:** every spool with grams left and a green / amber / red bar.
  Spools are recognised by colour first, then name and material.
- **🖨️ What's in the printer:** front-view cards for the **AMS 2 Pro** (4 slots) and the
  **AMS HT** (1 slot), drawn to the real units' proportions. A spool's ring gets thinner as
  it runs out.
- **📷 Scan to log:** each spool gets a 4-character code on a QR label or NFC sticker. Scanning it
  opens one question, "How many grams did your print use?", or you can weigh the spool instead.
  Every log has a 10-second **Undo**.
- **🛒 Shopping list:** set a minimum per filament (all its spools count together) and get a
  warning plus a "to order" list you can copy.
- **🔎 Add from SpoolmanDB:** search about 8,000 1.75 mm filaments by brand, colour or material.
  The catalogue is cached on the device, and Settings shows whether SpoolmanDB has changed since,
  with links to the repo and its recent changes.
- **💧 Desiccant tracking:**
  - **One dry box per spool** (for example a 4 L cereal box): flip *In its dry box* on the spool's
    page and it gets its own desiccant clock.
  - **The AMS units** are tracked too.
  - **Overdue boxes** show a banner. Log *New packs* or *Recharged*, with an optional hygrometer
    reading.
- **🏷️ Labels:** print sheets of 62 × 32 mm QR labels, or write **NTAG215** NFC stickers straight
  from Chrome on Android.
- **📘 Learn:** 10 materials (PLA, PETG, TPU, ABS, ASA, PLA-CF, PETG-CF, PA-CF, PC, PVA) with X2D
  starting settings: temperatures, speed, flow, walls, infill, drying and which AMS to use.
  Each prints as an **A6 card**, four per A4 sheet, ready to laminate. Learn works without logging in.
- **💧 Moisture & glue:** every material shows how sensitive it is to damp (💧 to 💧💧💧) and
  whether to put liquid glue on a Textured or Smooth PEI plate. On a spool's page, a short line
  says what to do, for example *"PETG is moisture-sensitive: keep it in its dry box."*
- **🙋 Help links:** the X2D manual, the Bambu Lab Wiki and Bambu Lab Academy, on the Learn page
  and in Settings.
- **🧪 Bambu Lab types:** every material page lists Bambu Lab's product lines, for example
  18 kinds of PLA (Basic, Matte, Silk+, Metal, Glow, Gradient, Aero…). Each shows its colours,
  what makes it different, its own temperatures (flagged when they differ from the card), and
  whether it needs a hardened nozzle. The data comes from SpoolmanDB's Bambu Lab list. A spool's
  "How do I print with this?" button jumps straight to its type.
- **🧒 Simple mode:** bigger text and plain words ("plastic left", "beads are tired"). It's always
  on for kid accounts, and adults can toggle it.
- **🌗 Theme:** one button cycles **System → Light → Dark**, remembered per device.
- **📱 Installable:** add it to your phone's home screen; it has its own icon and opens in its own
  window.

## Setup

### 1. Supabase project

1. Create a new project at <https://supabase.com/dashboard>.
2. **SQL Editor → New query** → paste [`supabase/schema.sql`](supabase/schema.sql) → **Run**.
   It is idempotent: re-run it after pulling changes. Existing data is kept.
3. **Authentication → URL Configuration**
   - Site URL: `https://balexandre.github.io/filament-stock/`
   - Redirect URLs: add `https://balexandre.github.io/filament-stock/**` and `http://localhost:8080/**`
4. **Authentication → Providers → Email**: keep *Confirm email* on.
5. **Project Settings → API Keys**: put the *Project URL* and the **publishable** key
   (`sb_publishable_…`, or the legacy `anon` key) in [`js/config.js`](js/config.js).
   That key is meant to be public, because Row Level Security protects the data.
   Never commit a `service_role` or `sb_secret_…` key.

### 2. Accounts

- The **first person to sign up without an invite code** gets their own workshop (household)
  and becomes its owner.
- Others join with the code from **Settings → Family**, which they enter when creating their
  account.
- **New members start as kids.** Kids can log usage, add rolls, move spools and log desiccant
  changes, but can't edit or delete spools or change settings. The owner can switch them to
  grown-up.
- When everyone is in, go to **Authentication → Providers → Email** and turn off
  **"Allow new users to sign up"**. The app then shows a friendly "registrations are closed"
  message.

### 3. GitHub Pages

Repository **Settings → Pages → Deploy from a branch → `master` / root**.

### Run locally

```bash
python3 -m http.server 8080
```

Open <http://localhost:8080/>. Labels always point to the live site (`siteUrl` in
`js/config.js`), so you can print them from localhost.

## Labels: QR and NFC

Each spool's label URL is `https://balexandre.github.io/filament-stock/#/s/CODE` and opens the
"how much did you use?" screen.

- **QR**: Labels page → tick spools → Print (62 × 32 mm labels, 3 per row on A4).
- **NFC (NTAG215)**: Chrome on Android writes the tag directly from the app.
  On iPhone, copy the link and write it as a *URL record* with the **NFC Tools** app.
  Any phone opens the link when it taps the sticker.

## Project layout

```
index.html              all screens (hash routes: #/, #/pick, #/s/CODE, #/edit/CODE, #/add,
                        #/labels, #/shop, #/learn, #/learn/KEY, #/cards, #/settings)
css/app.css             shared styles, AMS cards, theme, print layouts (labels, A6 cards)
js/config.js            Supabase URL + publishable key, public site URL
js/api.js               every Supabase call (+ the SpoolmanDB GitHub check)
js/catalog.js           SpoolmanDB download, IndexedDB cache, search
js/materials.js         Learn content and X2D settings per material
js/brands.js            brand product lines from SpoolmanDB source files (Learn sub-cards)
js/brand-notes.js       curated names + "how it differs" notes per brand product line
js/app.js               the Alpine component: state, routing, actions, theme
supabase/schema.sql     tables, views, RLS, triggers, RPCs (idempotent)
favicon.svg, icons/     app icon (SVG + PNGs for home screens)
manifest.webmanifest    install-to-home-screen metadata
mockup/                 the original clickable mockup (fake data)
.claude/skills/         project conventions for Claude Code
```
