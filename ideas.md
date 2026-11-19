# Ideas

Things worth building later. Each one needs a proper talk before work starts: what it should
do, what it changes, and whether it's worth it. Add new ideas at the bottom.

---

## Set up your own printer and units

**Why:** every new account gets our setup copied in (a Bambu Lab X2D with an AMS and an AMS HT,
plus an Ender 3), and the slot names are fixed in the code and the database. Someone with a
different printer has to live with ours.

**The idea**

- In **Settings → Printers & units**, pick your printer (Bambu Lab models, Creality, Prusa, or
  "Other"), then add the units that feed or store filament:
  - an automatic material system: Bambu AMS / AMS lite / AMS HT, Creality CFS, Prusa MMU…
  - a standalone dryer (Sunlu, Eibos…)
  - a plain spool holder on the printer, like the Ender 3 today
- For each unit: a name, how many spools it holds, which printer it feeds, how hot it dries
  (if it does), and whether to show it on the home page.
- The home page shows one card per unit. The 4-slot and 1-slot designs already exist; other
  counts use the same card with more or fewer slots. Cards wrap onto new rows.
- New accounts start empty and get a "set up your printer" prompt on the home page.

**How it could work**

- Extend the existing `dry_spots` table (it already holds the AMS units and their desiccant
  reminders) instead of adding a new one: add a type (`ams` / `dryer` / `box` / `holder`), a
  spool count, a printer, a max drying temperature and a "show on home" switch.
- Slot names: `<unit> 1…n` for units with several spools, the unit's own name for one spool.
  With the 4-slot unit called "AMS", today's locations (`AMS 1`–`AMS 4`, `AMS HT`, `Ender 3`)
  already follow this, so existing spools don't move.
- Replace the fixed slot lists (`SLOTS` in `js/app.js`, the check constraint and `move_spool`
  in `supabase/schema.sql`) with the saved units.
- One SQL update turns our current setup into units (run once in the Supabase SQL editor).

**Open questions**

- Several printers on the home page, or only the default one?
- Should the material cards and Learn pages follow the chosen printer? Today they're written
  for the X2D, and making them printer-specific is a much bigger job.
- A list of known units with their slot count and drying temperature, or always typed by hand?
