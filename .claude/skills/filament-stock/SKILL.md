---
name: filament-stock
description: Conventions, data model and UX rules for the Filament Stock web app (Tailwind + Alpine.js + Supabase, hosted on GitHub Pages). Use whenever building, changing or reviewing anything in this repo — pages, SQL, labels/QR/NFC, the Learn cards, or SpoolmanDB import.
---

# Filament Stock

A household 3D-printing filament inventory. Always know how much filament is left,
get warned before running out, log usage by scanning a QR code / NFC sticker on the
spool, and learn how to print each material. Used by an adult **and an 11-year-old**.

## Hard constraints

- **Static site only.** One `index.html` (plus small `js/*.js`, `css/*.css` if it grows)
  served by GitHub Pages at `https://balexandre.github.io/filament-stock/`. No build step,
  no bundler, no Node server.
- **Tailwind** via the Play CDN, **Alpine.js** via CDN, **supabase-js v2** via CDN.
  Pin exact versions in every `<script src>`.
- **Hash routing** (`#/spool/<code>`, `#/learn/pla`) — GitHub Pages has no SPA fallback.
- **Supabase** for auth + data. Only the *anon* key and project URL live in the page;
  every table is protected by Row Level Security. Never put the service-role key in the repo.
- **SpoolmanDB** (`https://donkie.github.io/SpoolmanDB/filaments.json` + `materials.json`)
  is the only catalogue of brands/filaments/materials. Don't invent a catalogue table.

## Domain words

| Word | Meaning |
|---|---|
| **Filament** | A catalogue product from SpoolmanDB (e.g. *Bambu Lab PLA Basic – Jade White*). Read-only, identified by SpoolmanDB `id`. |
| **Spool** | A physical roll you own. Has a short `code` (e.g. `K7Q2`) printed on its QR/NFC label. |
| **Remaining** | Grams of filament left on a spool. The number the whole app revolves around. |
| **Usage** | A log entry: "this print used 38 g". Remaining = initial − sum(usage). |
| **Minimum** | A low-stock threshold, set **per filament** (summed over all its spools) with an optional per-spool override. Below it → warning + "to order" list. |
| **Location** | Where a spool is: `AMS 2 Pro slot 1–4`, `AMS HT`, `Ender 3`, `Shelf`, `Dry box`. |
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
  with desiccant. Toggled by the "In its dry box" switch on the spool page; swap interval is `households.box_desiccant_days`.
  If several spools ever share one box, that needs a new model (a shared `dry_spots` box), not this location.
- `dry_spots (household_id, name, kind 'box'|'ams', interval_days, active, sort)` — seeded with AMS 2 Pro and AMS HT (60 d);
  `kind='box'` rows are optional *shared* boxes and become extra spool locations.
- `desiccant_log (spot_id XOR spool_id, action 'replaced'|'recharged', humidity_pct, note, created_by)` — kids can log and
  undo their own for 15 min; adults configure. `dry_spot_status` = spot + latest change; `spool_stock` carries the spool's
  own-box `desiccant_changed_at` / `desiccant_interval_days`. Due/overdue is computed client-side.
- View `spool_stock` → spool + `remaining_g` + `is_low`. View `shopping_list` → filaments below minimum.

RLS rule of thumb: a row is visible/writable when its `household_id` equals `my_household()`.
Kids can insert spools and `usage_log` rows, undo their own log entries for 15 min, and move
spools via the `move_spool` RPC; only adults (`is_adult()`) update/delete spools or minimums.
Owner-only RPCs: `set_member_kid`, `rotate_invite_code`.

Auth: email + password with email confirmation (Supabase default). Registration will
later be disabled in the Supabase dashboard (*Auth → Providers → Email → disable signups*);
the UI must cope with the signup endpoint returning an error.

## SpoolmanDB usage

- `filaments.json` (~6 MB, ~9.7k rows): load **only** in the "Add spool" flow, cache it in
  IndexedDB with a timestamp, refresh weekly. Search by manufacturer + name + material,
  show the colour swatch from `color_hex` / `color_hexes`.
- Only 1.75 mm filaments are offered. `color_hex` may be `RRGGBB` or `RRGGBBAA`.
- Use `weight` as default `initial_g` and `spool_weight` for the "weigh it" feature:
  `remaining = scale_reading − spool_weight`.

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
5. **Simple mode** (auto-on for `is_kid` profiles, toggle for adults): bigger text, plain words
   ("plastic left" instead of "remaining filament"), hides delete/edit/minimums/prices.
6. **Accessibility:** WCAG AA contrast, 44 px minimum tap targets, visible focus rings,
   every icon button has `aria-label`, works with keyboard, respects `prefers-reduced-motion`
   and has a System → Light → Dark theme button (rightmost in the header, stored per device).
7. **Sanity checks, friendly tone:** logging more than what's left → "That's more than the
   spool has left (212 g). Use 212 g and mark it empty?"
8. **Mobile first** — it's mostly used by the printer, on a phone, after scanning a label.

## Learn section

- One page per material family (PLA, PETG, TPU, ABS, ASA, PA/PA-CF, PC, PLA-CF/PETG-CF, PVA/BVOH).
- Each page: what it's good for, what it's bad at, kid-friendly "In one sentence", and an
  **X2D settings card**: nozzle temp, bed temp, plate type, chamber/door, cooling, max speed /
  volumetric flow, walls, top/bottom layers, infill pattern + %, drying temp/time, which AMS
  (AMS 2 Pro vs AMS HT vs external spool), hardened nozzle required?
- Values are **starting points** based on Bambu Studio generic profiles; label them as such.
- `@media print` stylesheet renders cards at A6 (two per A5 / four per A4), high contrast,
  no backgrounds that waste ink, QR on the card linking back to the Learn page.

## Code style

- Alpine components as plain functions in `<script>` (`Alpine.data('spoolList', () => ({...}))`).
- Keep Supabase calls in one `api` object; components never build queries inline.
- No frameworks beyond Tailwind/Alpine/supabase-js/qrcode. No TypeScript, no build.
- SQL lives in `supabase/schema.sql`, idempotent (`create … if not exists`, `drop policy if exists`).
