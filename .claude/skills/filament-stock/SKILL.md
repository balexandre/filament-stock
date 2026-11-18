---
name: filament-stock
description: Conventions, data model and UX rules for the Filament Stock web app (Tailwind + Alpine.js + Supabase, hosted on GitHub Pages). Use whenever building, changing or reviewing anything in this repo — pages, SQL, labels/QR/NFC, the Learn cards, or SpoolmanDB import.
---

# Filament Stock

A household 3D-printing filament inventory. Always know how much filament is left,
get warned before running out, log usage by scanning a QR code / NFC sticker on the
spool, and learn how to print each material. Used by an adult **and an 11-year-old**.

## Hard constraints

- **Static site only.** `index.html` + `css/app.css` + `js/*.js`, served by GitHub Pages at
  `https://balexandre.github.io/filament-stock/` from `master` / root. No build step, no bundler,
  no Node server.
- **Tailwind** Play CDN (`darkMode: 'class'`), **Alpine.js**, **supabase-js v2** and
  **qrcode-generator**, all from CDN with exact pinned versions in every `<script src>`.
- **Hash routing** — GitHub Pages has no SPA fallback. Routes: `#/`, `#/pick`, `#/s/<code>`,
  `#/edit/<code>`, `#/add`, `#/labels[/<codes>]`, `#/shop`, `#/learn[/<KEY>]`, `#/cards`,
  `#/settings`. `learn` and `cards` are public (no login); everything else needs a session.
- **Supabase** for auth + data. Only the project URL and the **publishable/anon** key live in
  `js/config.js` (public by design); every table has Row Level Security. Never commit a
  `service_role` / `sb_secret_…` key.
- **License: MIT** (`LICENSE`, © Bruno Alexandre). Only add libraries/data under compatible
  licenses (MIT, BSD, Apache-2.0, ISC); never vendor third-party files we can't redistribute.
- **SpoolmanDB** is the only catalogue of brands/filaments. Don't invent a catalogue table.
  The compiled `filaments.json` feeds "Add spool"; the per-brand **source** files
  (`raw.githubusercontent.com/Donkie/SpoolmanDB/main/filaments/<brand>.json`) feed Learn and the
  "Type" step of the guided Add spool picker.

## Domain words

| Word | Meaning |
|---|---|
| **Filament** | A catalogue product from SpoolmanDB (e.g. *Bambu Lab PLA Basic – Jade White*). Read-only, identified by SpoolmanDB `id`. |
| **Spool** | A physical roll you own. Has a short `code` (e.g. `K7Q2`) printed on its QR/NFC label. |
| **Remaining** | Grams of filament left on a spool. The number the whole app revolves around. |
| **Usage** | A log entry: "this print used 38 g". Remaining = initial − sum(usage). |
| **Minimum** | A low-stock threshold, set **per filament** (summed over all its spools) with an optional per-spool override. Below it → warning + "to order" list. |
| **Location** | Where a spool is: `AMS 1`–`AMS 4` (AMS 2 Pro), `AMS HT`, `Ender 3`, `Unopened` (still in its original sealed bag/box: the default for new spools, `SEALED` in `js/app.js`), `Shelf`, `Dry box` (its own box), plus any shared boxes added in Settings. One active spool per printer slot. |
| **Dry box** | The spool's **own** sealed box with desiccant (one per spool, e.g. a 4 L cereal box). PLA usually stays on the Shelf. |
| **Desiccant change** | A log entry: refilled with new beads (`replaced`, shown as "🫙 Refilled"; we pour beads from desiccant refills, no bags) or dried (`recharged`, "🔥 Dried"), optional hygrometer %. Per dry box, AMS unit or shared box. |
| **Card** | A printable, laminate-friendly A6 sheet with print settings for a material on the X2D. |

## Printers

- **Bambu Lab X2D** — default printer for every setting, card and suggestion.
  Fed by **AMS 2 Pro** (4 slots, drying) and **AMS HT** (1 slot, high-temp drying).
- **Creality Ender 3** — kept as a secondary printer profile; hidden from defaults.

## Data model (Supabase / Postgres)

All rows are owned by a `household` so adult and kid accounts see the same stock.

- `households (… owner_id, invite_code, default_min_g)` — first signup creates one; others join with `invite_code` in signup metadata and start as kids.
- `profiles (id = auth.users.id, household_id, display_name, is_kid bool)` — users may only update `display_name`.
- `printers (id, household_id, name, model, nozzle_mm, is_default)`
- `spools (id, household_id, code unique, spoolman_id text, brand, name, material, color_hex,
   color_hexes, diameter, initial_g, spool_weight_g, min_g null, extruder_temp, bed_temp, location,
   notes, reorder, archived_at)` — one active spool per printer slot (unique index).
  — denormalise brand/name/material/colour from SpoolmanDB at creation so the app
  works without downloading the 6 MB catalogue.
- `usage_log (id, spool_id, grams numeric > 0, kind 'print'|'weigh'|'adjust', note, created_by, created_at)`
- `filament_minimums (household_id, spoolman_id, min_g)` — threshold per catalogue filament.
- **Dry boxes are one per spool**: a spool with location `Dry box` sits in its OWN sealed box (e.g. a 4 L cereal box)
  with desiccant. Toggled by the "In its dry box" switch on the spool page; refill interval is `households.box_desiccant_days`.
  If several spools ever share one box, that needs a new model (a shared `dry_spots` box), not this location.
- `dry_spots (household_id, name, kind 'box'|'ams', interval_days, active, sort)` — seeded with AMS 2 Pro and AMS HT (60 d);
  `kind='box'` rows are optional *shared* boxes and become extra spool locations.
- `desiccant_log (spot_id XOR spool_id, action 'replaced'|'recharged', humidity_pct, note, created_by)` — kids can log and
  undo their own for 15 min; adults configure. `dry_spot_status` = spot + latest change; `spool_stock` carries the spool's
  own-box `desiccant_changed_at` / `desiccant_interval_days`. Due/overdue is computed client-side.
- View `spool_stock` → spool + `used_g`, `remaining_g`, `effective_min_g` (spool → filament → household default),
  `filament_min_g`, `last_used_at` and the own-box desiccant fields. View `shopping_list` → one row per filament
  whose total remaining ≤ minimum (archived spools with `reorder` stay in the group at 0 g).
- All views use `security_invoker = true` so the caller's RLS applies.

RLS rule of thumb: a row is visible/writable when its `household_id` equals `my_household()`.
Kids can insert spools and `usage_log` rows, undo their own log entries for 15 min, and move
spools via the `move_spool` RPC; only adults (`is_adult()`) update/delete spools or minimums.
Owner-only RPCs: `set_member_kid`, `rotate_invite_code`. Owners may update only
`households (name, default_min_g, box_desiccant_days)`; users only their own `profiles.display_name`
(column-level grants).

Schema changes must stay **idempotent and upgrade-safe**: the owner re-runs the whole file on a
live database. Add columns with `alter table … add column if not exists`, recreate views with
`drop view if exists` first, and migrate old data in place (see the shared "Dry box" cleanup).

Auth: email + password with email confirmation (Supabase default). Registration will
later be disabled in the Supabase dashboard (*Auth → Providers → Email → disable signups*);
the UI must cope with the signup endpoint returning an error.

## SpoolmanDB usage

- `filaments.json` (~6 MB, ~9.7k rows, ~7.9k at 1.75 mm): load **only** in the "Add spool" flow,
  cache it in IndexedDB with a timestamp, refresh weekly (`js/catalog.js`). Search by manufacturer + name + material,
  show the colour swatch from `color_hex` / `color_hexes`.
- Only rows SpoolmanDB marks as **1.75 mm** are offered (no fallback for a missing diameter). Show
  the diameter/weight from the data (`specOf()` → "1.75 mm · 1 kg"), never a hard-coded "1.75".
  `color_hex` may be `RRGGBB` or `RRGGBBAA`.
- Settings shows the date of the last upstream change (GitHub API, `commits?path=filaments`,
  cached 30 min in `sessionStorage`; 60 unauthenticated requests/hour) against the local cache
  date, plus links to the repo and its recent changes.
- Use `weight` as default `initial_g` and `spool_weight` for the "weigh it" feature:
  `remaining = scale_reading − spool_weight`.
- **Add spool has two modes.** *Step by step* (default) is Brand › Material › Type › Colours;
  *Search* is free text. Both put rows in `add.picks` (`[{ f, qty }]`), so one save can create
  spools of several colours (a 4-colour multi-pack). Multi-spool saves only offer non-printer
  locations (Shelf, Dry box, shared boxes); every created spool is moved there.
  - Brand = `manufacturer`; the id prefix (`sunlu` in `sunlu_petg_…`) names the brand's source
    file. A few files are cased differently, so `Brands.linesOf()` matches against the folder
    listing (GitHub API, cached a week) and falls back to `<prefix>.json`.
  - Type = a source-file entry for that material. Colours are matched to compiled rows by
    `name === template.replace('{color_name}', colour)`. Unmatched rows go in an "Other" group.
    If the source file fails, all colours show in one list. One type → skip straight to colours.
    The same colour in several weights → offer the one closest to 1 kg.
  - **Colour not in SpoolmanDB** (new colours lag behind, e.g. SUNLU PETG 2.0 "Skin"): added
    inside the chosen type as a pick with `custom: true`, `id: 'custom:…'`. It copies brand,
    material, diameter, weight and temperatures from the type, and its name is built from the type
    template ("2.0 Skin"). Saved with `spoolman_id = null`, so its minimum goes in `spools.min_g`,
    not `filament_minimums`.
  - New spools default to **Unopened**. Non-printer locations are inserted directly; printer
    slots go through `move_spool` (which empties the slot). Unopened spools get the "🔒 still
    in its original bag" moisture line, and the dry-box switch is how you mark them opened.
  - **Refill (no spool)** sets `notes = 'Refill (came without a spool)'` and clears the spool
    weight (the user enters the reusable spool's weight). Show the hint that each refill in use
    needs a reusable spool.

## Labels: QR + NFC

- Label URL: `https://balexandre.github.io/filament-stock/#/s/<code>` — keep it short.
- QR: generate client-side (e.g. `qrcode` lib from CDN). Printable sheet of small labels
  (code, colour swatch, material, brand) sized for spool sides.
- NFC (NTAG215, 504 bytes): write one NDEF **URL** record with the same link.
  Use Web NFC (`NDEFReader`) on Android Chrome; elsewhere show the link + "copy" and tell the
  user to write it with the *NFC Tools* app. iPhones open NDEF URLs natively when tapped.
- Opening a label URL lands on the **Quick Log** screen for that spool (log in first if needed,
  then return to the same spool).

## UX rules (adult + 11-year-old)

1. **One big question per screen.** Quick Log asks only "How many grams did you use?"
   with large preset chips (5 / 10 / 25 / 50 / 100 g), a big number field and one big button.
2. **Undo, not "are you sure?".** After logging, show a toast with *Undo* for 10 s.
3. **Colour first.** Spools are recognised by a big colour swatch + friendly name, then material.
4. **Traffic-light stock bars:** green > 2× minimum, amber ≤ 2× minimum, red ≤ minimum.
   Always pair colour with text/icon ("Low", "Order now") — never colour alone.
5. **Simple mode** (always on for `is_kid` profiles, toggle for adults): root font 18 px, plain
   words ("plastic left", "beads are tired"), hides delete/edit/minimums/history.
6. **Accessibility:** WCAG AA contrast, 44 px minimum tap targets, visible focus rings,
   every icon button has `aria-label`, works with keyboard, respects `prefers-reduced-motion`.
7. **Theme:** one button, rightmost in the header (and on the login screen), cycles
   System → Light → Dark, stored per device in `localStorage` (`fs.theme`). `applyTheme()` in
   `js/app.js` runs in `<head>` and sets `html.dark` + `color-scheme`, so there's no flash.
   Custom CSS targets `html.dark …`, never `@media (prefers-color-scheme)`.
8. **No blank screens:** every list (home, pick, labels, shop, dry boxes…) needs a loading line and an
   empty state that says why it's empty and links to the next step (usually `#/add`).
9. **Sanity checks, friendly tone:** logging more than what's left → "That's more than the
   spool has left (212 g). Use 212 g and mark it empty?"
10. **Mobile first** — it's mostly used by the printer, on a phone, after scanning a label.
11. **Look:** the AMS cards copy the X2D wood-cabinet model (dark `#34363b` body, smoked lid,
    slot LEDs) at real proportions (AMS 2 Pro 372 mm, AMS HT 200 mm). An empty slot's "+" opens the
    **slot picker** (spools not in a printer: Shelf, Dry box, shared boxes; tap = `move_spool`),
    with "Add a new spool for this slot" (preselects the slot via `pendingLoc`). Never send an
    empty slot straight to Add spool. AMS desiccant lives **on the AMS card**: a 💧 gauge pill in the
    top-right (`dryGauge()`: conic ring = freshness, days left, red "Change" when due; on phones
    the narrow AMS HT shows "50d" / "!" / "?"). The Desiccant section lists only per-spool dry
    boxes and shared boxes (`boxDry`). The due banner scrolls to whichever one is due first
    (`scrollToDue()`). The stock list is 1 / 2 / 4 per row (phone / `sm` / `lg`). Under each slot: grams, the
    **full spool name** (wraps, `line-clamp-3`, coloured by status) and the material, in every
    mode. The slot LED bar under each spool is the stock status (green / amber / red). The app icon is
    `favicon.svg` (indigo `#4f46e5` tile, white spool + strand), also used as the in-app logo;
    PNGs in `icons/` and `manifest.webmanifest` for home screens.

## Learn section

- One page per material family (PLA, PETG, TPU, ABS, ASA, PA/PA-CF, PC, PLA-CF/PETG-CF, PVA/BVOH).
- Each page: what it's good for, what it's bad at, kid-friendly "In one sentence", and an
  **X2D settings card**: nozzle temp, bed temp, plate type, chamber/door, cooling, max speed /
  volumetric flow, walls, top/bottom layers, infill pattern + %, drying temp/time, which AMS
  (AMS 2 Pro vs AMS HT vs external spool), hardened nozzle required?
- Values are **starting points** based on Bambu Studio generic profiles; label them as such.
- Each `LEARN` entry also has `moisture` (0–3 in 0.5 steps: how much damp filament hurts quality,
  shown as 3 💧 with `drop()` full/half/empty, words via `moistureWord()`) and `glue`
  (`{ textured, smooth }` = liquid glue needed on that PEI plate; `null` = follows the main material,
  used for support). Keep the card to these two extras: no storage tips, fume/HDT/strength tables.
- `moistureAdvice(material, inBox)` (js/materials.js) returns the one kid-friendly sentence for the
  spool page, e.g. "PETG is moisture-sensitive: keep it in its dry box." (≥ 2 warns when not boxed).
- `HELP_LINKS` in js/app.js (X2D manual PDF, Bambu Lab Wiki, Bambu Lab Academy) show on Learn and in
  Settings, for kids too.
- Inspiration from other people's guides: take the *idea*, write our own wording and values, never
  copy text, layout or images, and don't commit their files. Credit the source: the Learn header and the
  readme's Credits section link the [X2D Quick Guide](https://github.com/Gwarez-BZH/x2d-quick-guide)
  by Gwarez-BZH, which inspired the moisture/glue rows.
- **Don't build an "X2D basics" area** (plates, nozzle sizes, feed paths, prime tower, drying,
  troubleshooting). Learn links to the X2D Quick Guide for that instead ("Learn more about the X2D"
  card on Learn, plus an entry in Settings → help; URLs in `X2D_GUIDE` in js/app.js). Our Learn stays
  focused on materials, Bambu types, moisture and glue.
- **Brand types (sub-cards)**, Bambu Lab only for now: `js/brands.js` loads SpoolmanDB's per-brand
  *source* file (one entry per product line, colours inside, ~60 KB, cached a week in IndexedDB) and
  groups lines under a Learn card via `learnFor(material)` or a note's `family`.
  `js/brand-notes.js` adds curated names and short "how it differs" text, matched with
  `match(entry)`. Every note must match exactly one entry, and unmatched entries still show with
  a derived name, so new upstream lines never disappear. Only write notes you're sure of.
  To add a brand: add it to `SOURCES` and, optionally, a `BRAND_NOTES.<key>` list.
- A spool maps to its line when `line.template` with a colour name equals `spool.name` (same brand
  and material); `#/learn/<FAMILY>/<line-id>` scrolls to and highlights that line. All 302 Bambu
  1.75 mm catalogue entries map.
- Gotcha: top-level `const` in a classic script is **not** a `window` property, so reference
  `BRAND_NOTES` directly (`typeof BRAND_NOTES !== 'undefined'`), never `window.BRAND_NOTES`.
- `@media print` stylesheet renders cards at A6 (four per A4, `#/cards` prints them all),
  high contrast, QR on the card linking back to the Learn page. `learnFor(material)` maps any
  SpoolmanDB material string (PLA+, PA6-CF, PCTG…) to a Learn entry.

## Code style

- One Alpine component, `Alpine.data('app', …)` in `js/app.js`; markup in `index.html` uses
  `x-show` sections per route.
- Keep Supabase calls in the `api` object (`js/api.js`); the component never builds queries inline.
- **Alpine gotcha:** an expression that evaluates to a *function* gets called. Store callbacks
  (like the toast's undo) but test them with `x-show="!!undoFn"`, never `x-show="undoFn"`.
- **Alpine gotcha:** a `<select x-model>` whose options come from `x-for` shows the *first*
  option, because the model is applied before the options exist. Always add
  `:selected="l === model"` to each `<option>` (see the Edit spool location).
- Tailwind's Play CDN only sees literal class names; arbitrary values need `minmax(0,…)` grid
  tracks so cards can shrink on phones.
- No frameworks beyond Tailwind/Alpine/supabase-js/qrcode. No TypeScript, no build.
- SQL lives in `supabase/schema.sql`, idempotent (`create … if not exists`, `drop policy if exists`).
