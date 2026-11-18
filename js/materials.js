// Learn section: one entry per material family.
// Settings are STARTING POINTS for the Bambu Lab X2D with a 0.4 mm nozzle,
// based on Bambu Studio generic profiles. Always check the spool's own label.
// AMS 2 Pro dries up to ~65 °C, AMS HT up to ~85 °C.
const LEARN = [
  {
    key: 'PLA', emoji: '🌽', level: 1, color: '#16a34a',
    moisture: .5, glue: { textured: false, smooth: false },
    kid: 'The easy one. Made from plants — perfect for toys and models, but it goes soft in a hot car.',
    about: 'Polylactic acid. Prints easily, barely warps, comes in every colour and finish (matte, silk, glow, wood). Weak against heat (softens around 55–60 °C) and UV.',
    nozzle: '220 °C', nozzleRange: '200–230', bed: '55 °C', bedRange: '35–65',
    fan: '100 %', door: 'Open', plate: 'Textured PEI or Cool Plate SuperTack',
    speed: 'Outer 200 · Inner 300 mm/s', flow: '21 mm³/s (Silk ~12)',
    walls: '2 (3 for strong parts)', tb: '5 top / 3 bottom', infill: '15 % Grid · Gyroid for strength',
    dry: '50 °C · 8 h', feed: 'AMS 2 Pro', hardened: false,
    good: 'Models, toys, prototypes, cosplay, decorations',
    bad: 'Heat above ~55 °C, sitting in the sun, outdoor use',
    tips: ['Silk PLA: slow down (~12 mm³/s) and go 5–10 °C hotter for shine.', 'Matte PLA hides layer lines — great for figures.', 'Leave the top glass/door open if the chamber gets warm, to avoid heat creep.'],
  },
  {
    key: 'PETG', emoji: '🥤', level: 2, color: '#2563eb',
    moisture: 2, glue: { textured: false, smooth: true },
    kid: 'Like a water bottle: tougher and bendier than PLA, but a bit stringy.',
    about: 'Tougher and more heat-resistant (~70 °C) than PLA, slightly flexible, good layer adhesion. Strings more and sticks very strongly to smooth PEI.',
    nozzle: '250 °C', nozzleRange: '240–260', bed: '70 °C', bedRange: '65–80',
    fan: '30–50 %', door: 'Open', plate: 'Textured PEI (glue stick on smooth plates!)',
    speed: 'Outer 200 · Inner 300 mm/s (flow-limited)', flow: '12 mm³/s (PETG HF ~18)',
    walls: '3', tb: '5 top / 4 bottom', infill: '20 % Gyroid',
    dry: '65 °C · 8 h', feed: 'AMS 2 Pro', hardened: false,
    good: 'Functional parts, clips, outdoor brackets, containers',
    bad: 'Stringing, blobs, can tear smooth PEI without glue',
    tips: ['Dry it — wet PETG pops and strings a lot.', 'Lower the fan for stronger layers, raise it for overhangs.'],
  },
  {
    key: 'TPU', emoji: '🏀', level: 3, color: '#ea580c',
    moisture: 3, glue: { textured: true, smooth: true },
    kid: 'Rubbery and squishy — phone cases, tyres and bouncy things. Print it slowly!',
    about: 'Flexible thermoplastic polyurethane (95A is the common hardness). Very tough, abrasion- and impact-resistant. Needs slow, steady extrusion.',
    nozzle: '230 °C', nozzleRange: '220–240', bed: '35 °C', bedRange: '30–45',
    fan: '100 %', door: 'Open', plate: 'Textured PEI',
    speed: 'Outer 50 · Inner 80 mm/s', flow: '3.6 mm³/s (TPU HF ~12)',
    walls: '3', tb: '4 top / 4 bottom', infill: '15 % Gyroid (more = stiffer)',
    dry: '70 °C · 8 h (AMS HT)', feed: 'External spool for soft TPU · check AMS HT support for “TPU for AMS”', hardened: false,
    good: 'Grips, cases, gaskets, wheels, bumpers',
    bad: 'Slow, absorbs water, jams if pushed fast or through long tubes',
    tips: ['Turn off retraction or keep it very short.', 'Infill % controls how squishy it feels.'],
  },
  {
    key: 'ABS', emoji: '🧱', level: 4, color: '#dc2626',
    moisture: 1, glue: { textured: false, smooth: true },
    kid: 'The LEGO brick plastic. Strong and heat-proof, but it smells — needs the door closed.',
    about: 'Heat-resistant (~95 °C), tough, sandable and vapour-smoothable. Shrinks while cooling, so it warps without a warm enclosure.',
    nozzle: '260 °C', nozzleRange: '250–280', bed: '90 °C', bedRange: '90–100',
    fan: '10–30 %', door: 'Closed', plate: 'Textured PEI / Engineering plate',
    speed: 'Outer 200 · Inner 300 mm/s', flow: '20 mm³/s',
    walls: '3', tb: '5 top / 4 bottom', infill: '25 % Grid',
    dry: '80 °C · 8 h', feed: 'AMS HT', hardened: false,
    good: 'Car interior parts, hot places, things you will sand or paint',
    bad: 'Warping, fumes — ventilate the room after printing',
    tips: ['Let the chamber warm up 10 min before printing big parts.', 'Use a brim on tall or sharp-cornered parts.'],
  },
  {
    key: 'ASA', emoji: '☀️', level: 4, color: '#9333ea',
    moisture: 1, glue: { textured: false, smooth: true },
    kid: 'ABS’s cousin that doesn’t fade in the sun. For things that live outside.',
    about: 'Like ABS but UV-stable: keeps colour and strength outdoors. Same warping and fume care as ABS.',
    nozzle: '260 °C', nozzleRange: '250–280', bed: '95 °C', bedRange: '90–100',
    fan: '10–30 %', door: 'Closed', plate: 'Textured PEI / Engineering plate',
    speed: 'Outer 200 · Inner 300 mm/s', flow: '18 mm³/s',
    walls: '3–4', tb: '5 top / 4 bottom', infill: '25 % Grid',
    dry: '80 °C · 8 h', feed: 'AMS HT', hardened: false,
    good: 'Garden, outdoor mounts, car exterior parts',
    bad: 'Warping, fumes',
    tips: ['More walls beat more infill for outdoor strength.'],
  },
  {
    key: 'PLA-CF', emoji: '🖤', level: 3, color: '#334155',
    moisture: 1, glue: { textured: false, smooth: false },
    kid: 'PLA with tiny carbon threads — stiff and matte. Needs a special hard nozzle.',
    about: 'PLA filled with chopped carbon fibre: stiffer, lighter-looking, beautiful matte finish, hides layer lines. More brittle than plain PLA.',
    nozzle: '220 °C', nozzleRange: '210–240', bed: '55 °C', bedRange: '45–65',
    fan: '100 %', door: 'Open', plate: 'Textured PEI',
    speed: 'Outer 200 · Inner 300 mm/s', flow: '15 mm³/s',
    walls: '3', tb: '5 top / 3 bottom', infill: '20 % Gyroid',
    dry: '55 °C · 8 h', feed: 'AMS 2 Pro (hardened nozzle!)', hardened: true,
    good: 'Stiff brackets, drone frames, jigs, matte-look parts',
    bad: 'Brittle under impact, wears brass nozzles quickly',
    tips: ['Use the hardened-steel nozzle.', 'Store dry — CF filaments soak up moisture.'],
  },
  {
    key: 'PETG-CF', emoji: '🛠️', level: 3, color: '#0f766e',
    moisture: 2, glue: { textured: false, smooth: true },
    kid: 'Tough PETG with carbon threads. Strong, stiff and matte — hard nozzle only.',
    about: 'PETG with carbon fibre: stiffer and less stringy than PETG, keeps PETG’s toughness and ~70 °C heat resistance.',
    nozzle: '255 °C', nozzleRange: '240–270', bed: '70 °C', bedRange: '65–80',
    fan: '20–40 %', door: 'Open', plate: 'Textured PEI',
    speed: 'Outer 200 · Inner 300 mm/s', flow: '12 mm³/s',
    walls: '3', tb: '5 top / 4 bottom', infill: '20 % Gyroid',
    dry: '65 °C · 8 h', feed: 'AMS 2 Pro (hardened nozzle!)', hardened: true,
    good: 'Functional brackets, tool holders, outdoor stiff parts',
    bad: 'Abrasive, needs drying',
    tips: ['Dry before use for the best matte surface.'],
  },
  {
    key: 'PA-CF', emoji: '⚙️', level: 5, color: '#78350f',
    moisture: 3, glue: { textured: true, smooth: true },
    kid: 'Super-strong nylon with carbon — for real engineering parts. Grown-ups only!',
    about: 'Nylon (PA6/PA12/PAHT) with carbon fibre. Very strong, stiff and heat-resistant (>150 °C for PAHT-CF). Extremely moisture-hungry.',
    nozzle: '290 °C', nozzleRange: '260–300', bed: '100 °C', bedRange: '80–100',
    fan: '0–20 %', door: 'Closed', plate: 'Textured PEI / Engineering + glue',
    speed: 'Outer 150 · Inner 250 mm/s', flow: '8–12 mm³/s',
    walls: '4', tb: '5 top / 5 bottom', infill: '30 % Gyroid',
    dry: '80 °C · 12 h (AMS HT)', feed: 'AMS HT (hardened nozzle!)', hardened: true,
    good: 'Gears, high-load and high-heat parts, engine-bay brackets',
    bad: 'Must be bone-dry, expensive, abrasive',
    tips: ['Print straight from the AMS HT while it dries.', 'Anneal for best strength (follow the maker’s guide).'],
  },
  {
    key: 'PC', emoji: '🛡️', level: 5, color: '#475569',
    moisture: 2, glue: { textured: true, smooth: true },
    kid: 'Polycarbonate — the stuff of safety glasses. Very tough and needs lots of heat.',
    about: 'Very tough, impact- and heat-resistant (~115 °C). Warps a lot; needs a hot, closed chamber.',
    nozzle: '270 °C', nozzleRange: '260–280', bed: '100 °C', bedRange: '90–110',
    fan: '0–20 %', door: 'Closed', plate: 'Textured PEI + glue',
    speed: 'Outer 150 · Inner 250 mm/s', flow: '16 mm³/s',
    walls: '3', tb: '5 top / 4 bottom', infill: '25 % Grid',
    dry: '80 °C · 8 h', feed: 'AMS HT', hardened: false,
    good: 'Impact-resistant covers, light diffusers, hot environments',
    bad: 'Warping, delamination on tall parts',
    tips: ['Use a brim and avoid drafts.'],
  },
  {
    key: 'PVA', emoji: '💧', level: 4, color: '#0284c7',
    moisture: 3, glue: null,
    kid: 'Magic support that melts away in water!',
    about: 'Water-soluble support (PVA / BVOH). Used only for support interfaces with PLA (or PETG for BVOH). Absorbs moisture extremely fast.',
    nozzle: '220 °C', nozzleRange: '210–230', bed: '55 °C', bedRange: '45–60',
    fan: '100 %', door: 'Open', plate: 'Same as the main material',
    speed: 'Support interface only', flow: '~8 mm³/s',
    walls: '— (support)', tb: '2–3 interface layers', infill: 'Support interface only',
    dry: '75 °C · 8 h, keep sealed', feed: 'AMS HT (stays dry)', hardened: false,
    good: 'Complex overhangs, moving parts printed in place',
    bad: 'Wet PVA = clogs. Expensive.',
    tips: ['Use it only for the interface layers to save money.', 'Dissolve in warm water, change the water once.'],
  },
];

// ---- Moisture & glue helpers ----
// moisture: 0–3, how much damp filament hurts print quality (0.5 = barely, 3 = always dry it first).
function moistureWord(level) { return level >= 3 ? 'Very high' : level >= 2 ? 'High' : level >= 1 ? 'Medium' : 'Low'; }

// One short, kid-friendly sentence for the spool page. `name` is the spool's material as written
// on it (e.g. "PETG", "TPU 95A"); `inBox` = the spool sits in its own dry box.
function moistureAdvice(material, inBox) {
  const m = learnFor(material).moisture ?? 1;
  const name = material || 'This filament';
  if (m >= 2) return inBox
    ? { level: m, tone: 'ok', text: `✅ ${name} is moisture-sensitive — good thing it’s in its dry box.` }
    : { level: m, tone: 'warn', text: `💧 ${name} is moisture-sensitive: keep it in its dry box.` };
  if (m >= 1) return { level: m, tone: 'info', text: inBox
    ? `✅ ${name} is happy in its dry box.`
    : `${name} can sit out for a while, but a dry box keeps it at its best.` };
  return { level: m, tone: 'info', text: inBox ? `✅ ${name} is happy in its dry box.` : `👍 ${name} is fine on the shelf.` };
}

// Map any SpoolmanDB material string (PLA+, PA6-CF, PCTG, HTPLA+, …) to a Learn entry.
function learnFor(material) {
  const m = (material || '').toUpperCase();
  const byKey = k => LEARN.find(l => l.key === k);
  if (byKey(m)) return byKey(m);
  const fibre = /CF|GF/.test(m);
  if (/^(PVA|BVOH)/.test(m)) return byKey('PVA');
  if (/^(TPU|TPE|PEBA)/.test(m)) return byKey('TPU');
  if (/^(PA|PPA|PPS|NYLON)/.test(m)) return byKey('PA-CF'); // nylon + high-temp engineering
  if (/^(PETG|PET|PCTG|CPE|HTPET)/.test(m)) return byKey(fibre ? 'PETG-CF' : 'PETG');
  if (/^ASA|EASYASA/.test(m)) return byKey('ASA');
  if (/^(ABS|HIPS)/.test(m)) return byKey('ABS');
  if (/^PC/.test(m)) return byKey('PC');
  if (/PLA|PHA|PEARL|BIOFUSION|GREENTEC|FLAX/.test(m)) return byKey(fibre ? 'PLA-CF' : 'PLA');
  return byKey('PLA');
}
