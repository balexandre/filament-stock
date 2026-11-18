// Filament Stock — main Alpine component.
const SLOTS = ['AMS 1', 'AMS 2', 'AMS 3', 'AMS 4', 'AMS HT'];
const BOX_LOC = 'Dry box'; // the spool sits in its OWN sealed box with desiccant (one box per spool)
const SEALED = 'Unopened'; // still in its original sealed bag/box: moves to its dry box when opened
const BASE_LOCATIONS = [...SLOTS, 'Ender 3', SEALED, 'Shelf', BOX_LOC];
const PUBLIC_ROUTES = ['learn', 'cards'];

const store = {
  get(k) { try { return localStorage.getItem('fs.' + k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem('fs.' + k, v); } catch { /* ignore */ } },
};

// ---- Theme: 'system' | 'light' | 'dark', stored per device. Applied right away (this script
// runs in <head>) so the page never flashes the wrong colours.
const THEMES = ['system', 'light', 'dark'];
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
function applyTheme(theme) {
  const dark = theme === 'dark' || (theme === 'system' && darkQuery.matches);
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light'; // native inputs, scrollbars
}
applyTheme(store.get('theme') || 'system');
darkQuery.addEventListener('change', () => applyTheme(store.get('theme') || 'system'));

// Brands shown first in the guided picker (after the ones already on the shelf).
const POPULAR_BRANDS = ['Bambu Lab', 'Sunlu', 'ELEGOO', 'Polymaker', 'eSun', 'JAYO', 'Creality', 'Prusament', 'Overture', 'ANYCUBIC'];

const freshAdd = () => ({
  step: 1, mode: 'guide', q: '', results: [], custom: false,
  // guided picker: Brand › Material › Type › Colours
  g: { missing: { open: false, name: '', hex: '#888888' }, brandQ: '', allBrands: false, brand: null, items: [], mat: null, groups: [], line: null, state: 'idle' },
  picks: [], // [{ f: catalogue filament, qty }] — several colours can be added in one go
  refill: false, // came without a spool (wound onto a reusable one)
  brand: '', name: '', material: 'PLA', hex: '#888888',
  location: SEALED, initial: 1000, spoolWeight: '', min: '', qty: 1,
  created: [], saving: false,
});

document.addEventListener('alpine:init', () => {
  Alpine.data('app', () => ({
    configured: api.configured,
    booting: true,
    session: null,
    me: null,
    loadingMe: false,
    auth: { mode: 'login', email: '', password: '', name: '', invite: '', msg: '', err: '', busy: false },

    route: 'home',
    param: null,
    simplePref: store.get('simple') === '1',

    spools: [], shop: [], filter: 'All', loadingSpools: false,
    current: null, history: [], notFound: false,
    grams: '', note: '', scale: '', emptyW: '', logMode: 'used', busy: false,

    toast: '', undoFn: null, toastTimer: null,
    add: freshAdd(),
    catalog: { state: 'idle', count: 0, err: '' },
    catBrands: [],
    labelSel: [],
    nfc: { open: false, code: '', state: 'idle', msg: '' },
    slotPick: { open: false, loc: '', saving: false }, // "+" on an empty AMS / Ender slot
    pendingLoc: null, // slot to preselect when "Add a new spool" is opened from the slot picker
    edit: null,
    card: null,
    members: [], printers: [], hh: { name: '', default_min_g: 200 }, myName: '',
    catalogTs: null,

    drySpots: [], newSpot: '',
    dry: { open: false, spot: null, spool: null, title: '', action: 'replaced', humidity: '', note: '', busy: false, history: [] },
    upstream: null, upstreamErr: '',
    lines: [], linesState: 'idle', lineFocus: null,

    LEARN, SLOTS,
    // community X2D guide we link to instead of building our own "X2D basics" (it inspired Learn)
    X2D_GUIDE: { url: 'https://gwarez-bzh.github.io/x2d-quick-guide/', repo: 'https://github.com/Gwarez-BZH/x2d-quick-guide', by: 'Gwarez-BZH' },
    // official X2D help (shown on Learn and in Settings)
    HELP_LINKS: [
      { icon: '📕', label: 'X2D manual', note: 'PDF', url: 'https://csm.bblcdn.com/hub/7c58718aaa2e40edab56efb87419a96a.pdf' },
      { icon: '📚', label: 'Bambu Lab Wiki', note: 'setup, maintenance & troubleshooting', url: 'https://wiki.bambulab.com/home' },
      { icon: '🎬', label: 'Bambu Lab Academy', note: 'video tutorials', url: 'https://bambulab.com/support/academy' },
    ],

    // ---------- derived ----------
    get simple() { return !!this.me?.is_kid || this.simplePref; },
    get adult() { return !!this.me && !this.me.is_kid; },
    get isOwner() { return !!this.me && this.me.household?.owner_id === this.me.id; },
    get isPublic() { return PUBLIC_ROUTES.includes(this.route); },
    get showAuth() { return this.configured && !this.booting && !this.session && !this.isPublic; },
    get ready() { return !!(this.session && this.me); },
    get canShow() { return this.isPublic || this.ready; },
    // spool locations: printer slots + shelf + its own dry box + any shared dry boxes added in Settings
    get locations() {
      const shared = this.drySpots.filter(d => d.kind === 'box' && d.active).map(d => d.name);
      return [...BASE_LOCATIONS, ...shared.filter(n => !BASE_LOCATIONS.includes(n))];
    },
    get activeDry() { return this.drySpots.filter(d => d.active); },
    get boxedSpools() { return this.spools.filter(s => s.location === BOX_LOC); },
    // everything whose desiccant is overdue, as { name } for the banner
    get dryDue() {
      return [
        ...this.boxedSpools.filter(s => this.boxStatus(s).key === 'due').map(s => ({ name: `${s.name} ${s.material}` })),
        ...this.activeDry.filter(d => this.dryStatus(d).key === 'due'),
      ];
    },
    get catalogStale() { return !!(this.upstream && this.catalogTs && new Date(this.upstream.date).getTime() > this.catalogTs); },
    get materialsInStock() { return ['All', ...new Set(this.spools.map(s => s.material))]; },
    get filtered() { return this.spools.filter(s => this.filter === 'All' || s.material === this.filter); },
    get amsUnits() {
      const slot = (loc, n) => ({ loc, n, spool: this.spools.find(s => s.location === loc) });
      return [
        { name: 'AMS 2 Pro', ht: false, dry: this.amsDry('AMS 2 Pro'), sub: this.simple ? '4 colours' : '4 slots · dries up to 65 °C',
          slots: ['AMS 1', 'AMS 2', 'AMS 3', 'AMS 4'].map((l, i) => slot(l, i + 1)) },
        { name: 'AMS HT', ht: true, dry: this.amsDry('AMS HT'), sub: this.simple ? '1 colour · hot plastics' : '1 slot · dries up to 85 °C',
          slots: [slot('AMS HT', 'HT')] },
      ];
    },
    amsDry(name) { return this.activeDry.find(d => d.kind === 'ams' && d.name === name) || null; },
    // shared boxes added in Settings (AMS units show their desiccant on their own card)
    get boxDry() { return this.activeDry.filter(d => d.kind !== 'ams'); },
    get pickList() {
      const slot = s => { const i = SLOTS.indexOf(s.location); return i < 0 ? 99 : i; };
      return [...this.spools].sort((a, b) => slot(a) - slot(b));
    },
    get cardList() { return this.route === 'cards' ? LEARN : (this.card ? [this.card] : []); },
    get nav() {
      return this.simple
        ? [{ r: 'home', i: '🏠', t: 'Home' }, { r: 'pick', i: '🖨️', t: 'I printed' }, { r: 'learn', i: '🧪', t: 'Learn' }, { r: 'shop', i: '🛒', t: 'Almost empty' }, { r: 'settings', i: '🙂', t: 'Me' }]
        : [{ r: 'home', i: '🏠', t: 'Stock' }, { r: 'labels', i: '🏷️', t: 'Labels' }, { r: 'learn', i: '📘', t: 'Learn' }, { r: 'shop', i: '🛒', t: 'To order' }, { r: 'settings', i: '⚙️', t: 'Settings' }];
    },

    // ---------- boot / auth ----------
    init() {
      window.addEventListener('hashchange', () => this.onRoute());
      if (!this.configured) { this.booting = false; this.onRoute(); return; }
      api.sb.auth.onAuthStateChange((event, session) => {
        this.session = session;
        if (event === 'PASSWORD_RECOVERY') this.auth.mode = 'newpass';
        if (event === 'SIGNED_OUT' || !session) { this.me = null; this.spools = []; this.shop = []; }
        // never await Supabase calls inside this callback
        if (session && !this.me && !this.loadingMe) setTimeout(() => this.afterLogin());
        if (event === 'INITIAL_SESSION') { this.booting = false; if (!session) this.onRoute(); }
      });
    },
    async afterLogin() {
      this.loadingMe = true;
      try {
        this.me = await api.me(this.session.user.id);
        this.myName = this.me.display_name;
      } catch (e) { this.fail(e); } finally { this.loadingMe = false; }
      this.onRoute();
    },
    async doAuth() {
      const a = this.auth; a.err = ''; a.msg = ''; a.busy = true;
      try {
        if (a.mode === 'login') {
          await api.signIn(a.email.trim(), a.password);
        } else if (a.mode === 'signup') {
          const r = await api.signUp(a.email.trim(), a.password, a.name.trim(), a.invite.trim());
          if (!r.session) { a.mode = 'check'; a.msg = a.email; }
        } else if (a.mode === 'forgot') {
          await api.resetPassword(a.email.trim());
          a.msg = 'If that email has an account, a reset link is on its way.';
        } else if (a.mode === 'newpass') {
          await api.updatePassword(a.password);
          a.mode = 'login'; a.password = ''; this.showToast('Password updated 🔑');
          if (this.session && !this.me) this.afterLogin();
        }
      } catch (e) {
        a.err = this.friendly(e);
      } finally { a.busy = false; }
    },
    async signOut() { await api.signOut(); this.go(''); },
    theme: store.get('theme') || 'system',
    get themeLabel() { return { system: 'System', light: 'Light', dark: 'Dark' }[this.theme]; },
    get nextThemeLabel() { return { system: 'Light', light: 'Dark', dark: 'System' }[this.theme]; },
    cycleTheme() {
      this.theme = THEMES[(THEMES.indexOf(this.theme) + 1) % THEMES.length];
      store.set('theme', this.theme);
      applyTheme(this.theme);
      this.showToast({ system: '🖥️ Following your device', light: '☀️ Light mode', dark: '🌙 Dark mode' }[this.theme]);
    },
    toggleSimple() { this.simplePref = !this.simplePref; store.set('simple', this.simplePref ? '1' : '0'); },

    // ---------- routing ----------
    go(path) { location.hash = '#/' + path; },
    onRoute() {
      const h = location.hash;
      if (/^#(access_token|error|type|refresh_token)=/.test(h)) return; // Supabase auth redirect
      const [name, ...rest] = h.replace(/^#\/?/, '').split('/');
      this.route = name || 'home';
      this.param = rest.length ? decodeURIComponent(rest.join('/')) : null;
      window.scrollTo(0, 0);
      if (this.route === 'learn') {
        // #/learn/PLA or #/learn/PLA/pla-matte (a brand product line inside the material)
        const [key, line] = (this.param || '').split('/');
        this.card = key ? (LEARN.find(l => l.key === key.toUpperCase()) || null) : null;
        this.lineFocus = line || null;
        this.loadLines();
        this.focusLine();
      }
      if (this.isPublic || !this.ready) return;
      this.load();
    },
    load() {
      switch (this.route) {
        case 'home': this.loadSpools(); this.loadShop(); this.loadDry(); break;
        case 'pick': this.loadSpools(); break;
        case 's': this.openSpool(this.param); if (!this.drySpots.length) this.loadDry(); this.loadLines(); break;
        case 'edit': this.openSpool(this.param, true); break;
        case 'add': this.add = freshAdd(); if (this.pendingLoc) { this.add.location = this.pendingLoc; this.pendingLoc = null; } this.loadCatalog(); this.loadDry(); break;
        case 'labels':
          this.loadSpools().then(() => {
            this.labelSel = this.param ? this.param.split(',') : this.spools.map(s => s.code);
          });
          break;
        case 'shop': this.loadShop(); break;
        case 'settings': this.loadSettings(); break;
        default: this.route = 'home'; this.load();
      }
    },

    // ---------- data ----------
    async loadSpools() {
      this.loadingSpools = true;
      try { this.spools = await api.spools(); } catch (e) { this.fail(e); } finally { this.loadingSpools = false; }
    },
    async loadShop() { try { this.shop = await api.shoppingList(); } catch (e) { this.fail(e); } },

    async openSpool(code, forEdit = false) {
      this.notFound = false; this.grams = ''; this.note = ''; this.scale = ''; this.logMode = 'used'; this.history = [];
      this.current = this.spools.find(s => s.code === (code || '').toUpperCase()) || null;
      try {
        const s = await api.spoolByCode(code || '');
        if (!s) { this.current = null; this.notFound = true; return; }
        this.current = s;
        this.emptyW = s.spool_weight_g ?? '';
        if (forEdit) {
          this.edit = {
            id: s.id, code: s.code, name: s.name, brand: s.brand, material: s.material,
            hex: '#' + (s.color_hex || '888888').slice(0, 6), location: s.location, initial_g: +s.initial_g,
            spool_weight_g: s.spool_weight_g ?? '', notes: s.notes || '', spoolman_id: s.spoolman_id,
            min: s.spoolman_id ? (s.filament_min_g ?? '') : (s.min_g ?? ''), saving: false,
          };
        }
        if (!this.simple || forEdit) this.history = await api.history(s.id);
      } catch (e) { this.fail(e); }
    },

    applyDelta(s, g) {
      const used = +s.used_g + g;
      for (const t of [s, this.spools.find(x => x.id === s.id)]) {
        if (!t) continue;
        t.used_g = used;
        t.remaining_g = Math.max(0, +t.initial_g - used);
      }
    },

    async logUsage() {
      const s = this.current;
      let g = Math.round(+this.grams * 100) / 100;
      if (!s || !(g > 0) || this.busy) return;
      g = Math.min(g, +s.remaining_g);
      if (g <= 0) { this.showToast(this.simple ? 'This roll is already empty 🫙' : 'Spool is already empty'); return; }
      this.busy = true;
      try {
        const row = await api.logUsage({ spool_id: s.id, grams: g, kind: 'print', note: this.note.trim() || null });
        this.applyDelta(s, g);
        if (!this.simple) this.history.unshift(row);
        this.grams = ''; this.note = '';
        this.showToast(
          this.simple ? `Done! ${this.fmt(s.remaining_g)} g left 👍` : `Logged ${this.fmt(g)} g · ${this.fmt(s.remaining_g)} g left`,
          async () => {
            await api.deleteUsage(row.id);
            this.applyDelta(s, -g);
            this.history = this.history.filter(h => h.id !== row.id);
          });
      } catch (e) { this.fail(e); } finally { this.busy = false; }
    },

    async logWeigh() {
      const s = this.current;
      const empty = +this.emptyW;
      if (!s || !(+this.scale > 0) || this.emptyW === '' || this.busy) return;
      const now = Math.max(0, +this.scale - empty);
      const delta = Math.round((+s.remaining_g - now) * 100) / 100;
      this.busy = true;
      try {
        if (this.adult && s.spool_weight_g === null) {
          await api.updateSpool(s.id, { spool_weight_g: empty });
          s.spool_weight_g = empty;
        }
        if (delta === 0) { this.showToast('Already correct ✅'); return; }
        const row = await api.logUsage({ spool_id: s.id, grams: delta, kind: 'weigh', note: `scale ${this.scale} g` });
        this.applyDelta(s, delta);
        if (!this.simple) this.history.unshift(row);
        this.scale = '';
        this.showToast(`Updated: ${this.fmt(now)} g left`, async () => {
          await api.deleteUsage(row.id); this.applyDelta(s, -delta);
          this.history = this.history.filter(h => h.id !== row.id);
        });
      } catch (e) { this.fail(e); } finally { this.busy = false; }
    },

    // "In its dry box" switch on the spool page: on → Dry box, off → back to the Shelf
    toggleDryBox() { this.moveCurrent(this.current.location === BOX_LOC ? 'Shelf' : BOX_LOC); },
    async moveCurrent(loc) {
      const s = this.current;
      if (!s || loc === s.location) return;
      try {
        await api.moveSpool(s.id, loc);
        s.location = loc;
        this.showToast(`Moved to ${loc} 📍`);
        this.loadSpools();
      } catch (e) { this.fail(e); }
    },

    // ---------- add spool ----------
    async loadCatalog(force = false) {
      this.catalog.state = 'loading'; this.catalog.err = '';
      try {
        await Catalog.load(force);
        this.catalog.state = 'ready'; this.catalog.count = Catalog.count;
        this.catBrands = Catalog.brands();
        this.catalogTs = await Catalog.cachedAt();
        if (this.add.q) this.searchCatalog();
      } catch (e) { this.catalog.state = 'error'; this.catalog.err = e.message; }
    },
    searchCatalog() { this.add.results = Catalog.search(this.add.q); },
    // a search result: just that one filament
    pickFilament(f) { this.add.picks = [{ f, qty: 1 }]; this.toDetails(); },
    customFilament() { Object.assign(this.add, { picks: [], custom: true, step: 2 }); },

    // ---------- guided picker: Brand › Material › Type › Colours ----------
    guideBrands() {
      const mine = new Set(this.spools.map(s => s.brand));
      const rank = b => mine.has(b.name) ? 0 : POPULAR_BRANDS.includes(b.name) ? 1 + POPULAR_BRANDS.indexOf(b.name) : 99;
      const q = this.add.g.brandQ.trim().toLowerCase();
      return this.catBrands.filter(b => !q || b.name.toLowerCase().includes(q))
        .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
    },
    guideMaterials() {
      const m = new Map();
      for (const f of this.add.g.items) m.set(f.material, (m.get(f.material) || 0) + 1);
      return [...m].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    },
    guideBack(level) {
      const g = this.add.g;
      if (level === 'brand') Object.assign(g, { brand: null, items: [], mat: null, groups: [], line: null });
      if (level === 'material') Object.assign(g, { mat: null, groups: [], line: null });
      if (level === 'line') g.line = null;
      g.missing.open = false;
    },
    pickBrand(b) {
      Object.assign(this.add.g, { brand: b, items: Catalog.ofBrand(b.name), mat: null, groups: [], line: null });
      const mats = this.guideMaterials();
      if (mats.length === 1) this.pickMaterial(mats[0].name);
    },
    // Group the brand's colours of one material into product lines (from the brand's SpoolmanDB
    // source file). If that file can't be loaded, show every colour in one list.
    async pickMaterial(mat) {
      const g = this.add.g, brand = g.brand;
      Object.assign(g, { mat, groups: [], line: null, state: 'loading' });
      const items = g.items.filter(f => f.material === mat);
      // the same colour can come in several weights: offer the one closest to 1 kg
      const best = list => list.reduce((a, b) => Math.abs(b.weight - 1000) < Math.abs(a.weight - 1000) ? b : a);
      const byName = new Map();
      for (const f of items) byName.set(f.name, [...(byName.get(f.name) || []), f]);
      let groups = [];
      try {
        const lines = (await Brands.linesOf(brand.name, brand.prefix)).filter(l => l.material === mat);
        const used = new Set();
        groups = lines.map(l => ({
          id: l.id, label: l.label, kid: l.kid || l.blurb || '', template: l.template,
          entries: l.colors.map(c => {
            const name = l.template.replace('{color_name}', c.name).replace(/\s+/g, ' ').trim();
            const hits = byName.get(name);
            if (!hits || used.has(name)) return null;
            used.add(name);
            return { f: best(hits), colour: c.name };
          }).filter(Boolean),
        })).filter(x => x.entries.length);
        const rest = [...byName].filter(([n]) => !used.has(n)).map(([n, list]) => ({ f: best(list), colour: n }));
        const seen = {}; // two lines can end up with the same name: number them
        for (const x of groups) { seen[x.label] = (seen[x.label] || 0) + 1; if (seen[x.label] > 1) x.label += ` (${seen[x.label]})`; }
        if (rest.length) groups.push({ id: 'other', label: groups.length ? 'Other ' + mat : mat, kid: '', entries: rest });
      } catch { groups = []; }
      if (g.brand !== brand || g.mat !== mat) return; // the user already picked something else
      if (!groups.length) groups = [{ id: 'all', label: mat, kid: '', entries: [...byName].map(([n, list]) => ({ f: best(list), colour: n })) }];
      for (const x of groups) x.spec = this.specOf(x.entries.map(e => e.f));
      g.groups = groups; g.state = 'ready';
      if (groups.length === 1) g.line = groups[0];
    },
    // "1.75 mm · 1 kg" straight from the SpoolmanDB rows, so you can check it against the box
    specOf(fs) {
      const uniq = a => [...new Set(a.filter(v => v != null))];
      const kg = w => w >= 1000 ? (w / 1000).toLocaleString() + ' kg' : w + ' g';
      return [uniq(fs.map(f => f.diameter)).map(d => d + ' mm').join(' / '), uniq(fs.map(f => +f.weight)).sort((a, b) => b - a).map(kg).join(' / ')]
        .filter(Boolean).join(' · ');
    },
    // A colour SpoolmanDB doesn't list yet (e.g. a new SUNLU colour): keep brand, material, type,
    // diameter and temperatures from the type, take the colour name and swatch from the user.
    addMissingColour() {
      const g = this.add.g, line = g.line, m = g.missing;
      const colour = m.name.trim();
      if (!line || !colour) { this.showToast('Type the colour name first'); return; }
      const ref = line.entries[0].f;
      const name = line.template ? line.template.replace('{color_name}', colour).replace(/\s+/g, ' ').trim() : colour;
      const f = {
        id: 'custom:' + ref.brand + ':' + ref.material + ':' + name.toLowerCase(), custom: true,
        brand: ref.brand, name, material: ref.material, hex: m.hex.replace('#', '').toUpperCase(), hexes: null,
        weight: ref.weight, spool_weight: ref.spool_weight, diameter: ref.diameter,
        extruder_temp: ref.extruder_temp, bed_temp: ref.bed_temp,
      };
      if (!line.entries.some(e => e.f.id === f.id)) line.entries.push({ f, colour: colour + ' (not in SpoolmanDB)' });
      this.bumpPick(f, 1);
      g.missing = { open: false, name: '', hex: '#888888' };
    },
    pickQty(f) { return this.add.picks.find(p => p.f.id === f.id)?.qty || 0; },
    bumpPick(f, d = 1) {
      const picks = this.add.picks, p = picks.find(x => x.f.id === f.id);
      if (p) { p.qty = Math.max(0, Math.min(20, p.qty + d)); if (!p.qty) picks.splice(picks.indexOf(p), 1); }
      else if (d > 0) picks.push({ f, qty: 1 });
    },
    get addTotal() {
      return this.add.custom ? Math.max(1, Math.min(20, +this.add.qty || 1)) : this.add.picks.reduce((n, p) => n + p.qty, 0);
    },
    isPrinterLoc(l) { return SLOTS.includes(l) || l === 'Ender 3'; },
    // several spools can't all go in one printer slot: offer Shelf, Dry box (each its own) and shared boxes
    get addLocations() {
      return this.addTotal > 1 ? this.locations.filter(l => !SLOTS.includes(l) && l !== 'Ender 3') : this.locations;
    },
    toDetails() {
      const a = this.add, f = a.picks[0]?.f;
      if (!f) return;
      Object.assign(a, { custom: false, step: 2, initial: f.weight || 1000, spoolWeight: a.refill ? '' : (f.spool_weight ?? '') });
      if (!this.addLocations.includes(a.location)) a.location = SEALED;
    },
    setRefill(on) {
      this.add.refill = on;
      this.add.spoolWeight = on ? '' : (this.add.picks[0]?.f.spool_weight ?? '');
    },
    async saveAdd() {
      const a = this.add;
      if (a.saving) return;
      if (a.custom && (!a.name.trim() || !a.material.trim())) { this.showToast('Give it a name and material first'); return; }
      if (!a.custom && !a.picks.length) { a.step = 1; return; }
      if (!this.addLocations.includes(a.location)) a.location = SEALED;
      a.saving = true;
      try {
        const common = {
          initial_g: +a.initial || 1000,
          spool_weight_g: a.spoolWeight === '' ? null : +a.spoolWeight,
          notes: a.refill ? 'Refill (came without a spool)' : null,
          // printer slots go through move_spool (it empties the slot first)
          location: this.isPrinterLoc(a.location) ? 'Shelf' : a.location,
        };
        const rows = [];
        if (a.custom) {
          const base = {
            ...common, spoolman_id: null, brand: a.brand.trim(), name: a.name.trim(),
            material: a.material.trim().toUpperCase(), color_hex: a.hex.replace('#', '').toUpperCase(),
          };
          if (this.adult && a.min !== '') base.min_g = +a.min;
          for (let i = 0; i < this.addTotal; i++) rows.push({ ...base });
        } else {
          for (const { f, qty } of a.picks) {
            const base = {
              ...common, spoolman_id: f.custom ? null : f.id, brand: f.brand, name: f.name, material: f.material,
              color_hex: f.hex, color_hexes: f.hexes, diameter: f.diameter,
              extruder_temp: f.extruder_temp, bed_temp: f.bed_temp,
            };
            if (f.custom && this.adult && a.min !== '') base.min_g = +a.min;
            for (let i = 0; i < qty; i++) rows.push({ ...base });
          }
        }
        const created = await api.addSpools(rows);
        if (this.isPrinterLoc(a.location)) for (const c of created) await api.moveSpool(c.id, a.location);
        if (!a.custom && this.adult && a.min !== '') {
          for (const id of new Set(a.picks.filter(p => !p.f.custom).map(p => p.f.id))) await api.setFilamentMin(this.me.household_id, id, +a.min);
        }
        a.created = created.map(c => c.code);
        a.step = 3;
        this.loadSpools();
      } catch (e) { this.fail(e); } finally { a.saving = false; }
    },

    // ---------- edit spool (adults) ----------
    async saveEdit() {
      const e = this.edit, s = this.current;
      if (!e || e.saving) return;
      e.saving = true;
      try {
        const patch = {
          name: e.name.trim(), brand: e.brand.trim(), material: e.material.trim().toUpperCase(),
          color_hex: e.hex.replace('#', '').toUpperCase(), initial_g: +e.initial_g,
          spool_weight_g: e.spool_weight_g === '' ? null : +e.spool_weight_g, notes: e.notes.trim() || null,
        };
        if (!e.spoolman_id) patch.min_g = e.min === '' ? null : +e.min;
        await api.updateSpool(e.id, patch);
        if (e.spoolman_id) await api.setFilamentMin(this.me.household_id, e.spoolman_id, e.min === '' ? null : +e.min);
        if (e.location !== s.location) await api.moveSpool(e.id, e.location);
        this.showToast('Saved ✅');
        this.go('s/' + e.code);
      } catch (err) { this.fail(err); } finally { e.saving = false; }
    },
    async archive(reorder) {
      const s = this.current;
      try {
        await api.updateSpool(s.id, { archived_at: new Date().toISOString(), reorder });
        this.showToast(reorder ? 'Finished — added to the shopping list 🛒' : 'Finished and archived');
        this.go('');
      } catch (e) { this.fail(e); }
    },
    async removeSpool() {
      const s = this.current;
      if (!confirm(`Delete spool ${s.code} (${s.name}) and all its history? This cannot be undone.`)) return;
      try { await api.deleteSpool(s.id); this.showToast('Spool deleted'); this.go(''); } catch (e) { this.fail(e); }
    },

    // ---------- labels / NFC ----------
    labelUrl(code) { return (window.CONFIG.siteUrl || location.origin + location.pathname) + '#/s/' + code; },
    learnUrl(key) { return (window.CONFIG.siteUrl || location.origin + location.pathname) + '#/learn/' + key; },
    printLabels(codes) { this.go('labels/' + codes.join(',')); },
    get nfcSupported() { return 'NDEFReader' in window; },
    // ---------- load a spool you already have into an empty slot ----------
    openSlot(loc) { this.slotPick = { open: true, loc, saving: false }; },
    // spools not in a printer right now: shelf first, then dry boxes; same material together
    get slotCandidates() {
      const away = s => SLOTS.includes(s.location) || s.location === 'Ender 3';
      const where = s => s.location === 'Shelf' ? 0 : s.location === SEALED ? 2 : 1; // opened rolls first
      return this.spools.filter(s => !away(s))
        .sort((a, b) => a.material.localeCompare(b.material) || where(a) - where(b) || a.name.localeCompare(b.name));
    },
    async loadIntoSlot(s) {
      const p = this.slotPick;
      if (p.saving) return;
      p.saving = true;
      try {
        await api.moveSpool(s.id, p.loc);
        s.location = p.loc;
        p.open = false;
        this.showToast(`${s.name} is in ${p.loc} now 🖨️`);
        this.loadSpools();
      } catch (e) { this.fail(e); } finally { p.saving = false; }
    },
    addForSlot() { this.pendingLoc = this.slotPick.loc; this.slotPick.open = false; location.hash = '#/add'; },

    openNfc(code) { this.nfc = { open: true, code, state: 'idle', msg: '' }; },
    async writeNfc() {
      const n = this.nfc;
      n.state = 'writing'; n.msg = '';
      try {
        const ndef = new NDEFReader();
        await ndef.write({ records: [{ recordType: 'url', data: this.labelUrl(n.code) }] });
        n.state = 'done';
      } catch (e) { n.state = 'error'; n.msg = e.message; }
    },
    async copy(text, what = 'Copied') {
      try { await navigator.clipboard.writeText(text); this.showToast(what + ' 📋'); }
      catch { prompt('Copy this:', text); }
    },
    shopText() {
      return this.shop.map(f => `- ${f.brand} ${f.name} (${f.material}) — ${this.fmt(f.total_remaining_g)} g left, min ${f.min_g} g`).join('\n');
    },

    // ---------- desiccant ----------
    async loadDry() { try { this.drySpots = await api.drySpots(); } catch (e) { this.fail(e); } },
    dryStatus(d) {
      if (!d.last_changed_at) return { key: 'unknown', pct: 0, bar: 'bg-slate-400', cls: 'text-slate-600 dark:text-slate-300',
        label: this.simple ? '❓ Not logged yet' : '❓ Not logged yet' };
      const days = Math.floor((Date.now() - new Date(d.last_changed_at)) / 86400000);
      const left = d.interval_days - days, pct = Math.min(100, Math.round((days / d.interval_days) * 100));
      const plural = n => n + ' day' + (n === 1 ? '' : 's');
      if (left <= 0) return { key: 'due', pct: 100, left, bar: 'bg-red-600', cls: 'text-red-700 dark:text-red-300',
        label: this.simple ? '🔴 Time to refresh the beads!' : '🔴 Change now' + (left < 0 ? ` · ${plural(-left)} late` : '') };
      if (pct >= 80) return { key: 'soon', pct, left, bar: 'bg-amber-500', cls: 'text-amber-700 dark:text-amber-300',
        label: this.simple ? '🟡 Beads getting tired' : `🟡 Due in ${plural(left)}` };
      return { key: 'ok', pct, left, bar: 'bg-emerald-500', cls: 'text-emerald-700 dark:text-emerald-300',
        label: this.simple ? '🟢 Beads are fresh' : `🟢 Fresh · ${plural(left)} left` };
    },
    // small round gauge in an AMS card's corner: the ring shrinks as the desiccant gets used up
    dryGauge(d) {
      const st = this.dryStatus(d);
      const colour = { ok: '#10b981', soon: '#f59e0b', due: '#dc2626', unknown: '#94a3b8' }[st.key];
      const fresh = st.key === 'unknown' ? 0 : st.key === 'due' ? 100 : 100 - st.pct; // due: full red ring
      const text = st.key === 'unknown' ? (this.simple ? '?' : 'Log')
        : st.key === 'due' ? (this.simple ? 'Now!' : 'Change') : st.left + ' d';
      const short = st.key === 'unknown' ? '?' : st.key === 'due' ? '!' : st.left + 'd';
      return { ...st, text, short, ring: `background:conic-gradient(${colour} ${fresh}%, rgba(148,163,184,.3) 0)` };
    },
    // the "desiccant due" banner jumps to the AMS cards or to the dry boxes
    scrollToDue() {
      const el = this.dryDue[0]?.kind === 'ams' ? this.$refs.ams : this.$refs.dry;
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
    boxStatus(s) {
      return this.dryStatus({ last_changed_at: s.desiccant_changed_at,
        interval_days: s.desiccant_interval_days || this.me?.household?.box_desiccant_days || 30 });
    },
    spoolsIn(d) {
      const locs = d.kind === 'ams' ? (d.name === 'AMS HT' ? ['AMS HT'] : d.name === 'AMS 2 Pro' ? ['AMS 1', 'AMS 2', 'AMS 3', 'AMS 4'] : []) : [d.name];
      return this.spools.filter(s => locs.includes(s.location)).length;
    },
    // target is a dry spot (AMS unit / shared box) or, with isSpool, a spool in its own dry box
    async openDry(target, isSpool = false) {
      this.dry = { open: true, spot: isSpool ? null : target, spool: isSpool ? target : null,
        title: isSpool ? `${target.name} ${target.material}` : target.name,
        action: 'replaced', humidity: '', note: '', busy: false, history: [] };
      if (!this.simple) {
        try { this.dry.history = await api.desiccantHistory(isSpool ? { spool_id: target.id } : { spot_id: target.id }); }
        catch (e) { this.fail(e); }
      }
    },
    async refreshDry(spool) {
      await Promise.all([this.loadDry(), spool ? this.loadSpools() : null]);
      if (spool && this.current && this.current.id === spool.id) {
        const fresh = await api.spoolByCode(this.current.code);
        if (fresh) Object.assign(this.current, fresh);
      }
    },
    async saveDry() {
      const x = this.dry;
      if (x.busy) return;
      if (x.humidity !== '' && !(+x.humidity >= 0 && +x.humidity <= 100)) { this.showToast('Humidity must be 0–100 %'); return; }
      x.busy = true;
      try {
        const row = await api.logDesiccant({ ...(x.spool ? { spool_id: x.spool.id } : { spot_id: x.spot.id }),
          action: x.action, humidity_pct: x.humidity === '' ? null : +x.humidity, note: x.note.trim() || null });
        x.open = false;
        await this.refreshDry(x.spool);
        this.showToast(this.simple ? `Fresh beads for the ${x.title}! 🎉` : `${x.title}: desiccant logged`, async () => {
          await api.deleteDesiccant(row.id); await this.refreshDry(x.spool);
        });
      } catch (e) { this.fail(e); } finally { x.busy = false; }
    },
    async saveDrySpot(d) {
      const days = Math.round(+d.interval_days);
      if (!d.name.trim() || !(days >= 1 && days <= 365)) { this.showToast('Give it a name and 1–365 days'); return; }
      try { await api.updateDrySpot(d.id, { name: d.name.trim(), interval_days: days, active: !!d.active }); this.showToast('Saved ✅'); this.loadDry(); }
      catch (e) { this.fail(e); }
    },
    async addDrySpot() {
      const name = this.newSpot.trim();
      if (!name) return;
      try {
        await api.addDrySpot({ name, kind: 'box', interval_days: 30, sort: Math.max(0, ...this.drySpots.map(d => d.sort)) + 1 });
        this.newSpot = ''; this.showToast(`${name} added 📦`); this.loadDry();
      } catch (e) { this.fail(e); }
    },

    // ---------- brand product lines (Learn sub-cards) ----------
    async loadLines() {
      if (this.linesState === 'ready' || this.linesState === 'loading') return;
      this.linesState = 'loading';
      try { this.lines = await Brands.load(); this.linesState = 'ready'; this.focusLine(); }
      catch (e) { console.error(e); this.linesState = 'error'; }
    },
    linesFor(key) { return key ? this.lines.filter(l => l.family === key) : []; },
    colourCount(key) { return this.linesFor(key).reduce((n, l) => n + l.colors.length, 0); },
    focusLine() {
      if (!this.lineFocus || this.linesState !== 'ready') return;
      // instant jump when arriving from a link; wait a frame so the x-for has rendered the cards
      this.$nextTick(() => requestAnimationFrame(() =>
        document.getElementById('line-' + this.lineFocus)?.scrollIntoView({ block: 'center' })));
    },
    // the product line a spool belongs to (SpoolmanDB names are the line's template filled with the colour)
    lineFor(s) {
      if (!s) return null;
      return this.lines.find(l => l.brand === s.brand && l.material === s.material &&
        l.colors.some(c => l.template.replace('{color_name}', c.name) === s.name)) || null;
    },
    learnLink(s) { const l = this.lineFor(s); return '#/learn/' + (l ? l.family + '/' + l.id : learnFor(s.material).key); },
    learnLabel(s) { const l = this.lineFor(s); return l ? l.label : learnFor(s.material).key; },
    // difference between a line's SpoolmanDB temperature and the family card baseline
    tempDiff(l, which) {
      const base = parseInt((LEARN.find(c => c.key === l.family) || {})[which], 10);
      const v = l[which];
      return v == null || isNaN(base) ? 0 : v - base;
    },
    lineSwatch(c) {
      return c.hexes && c.hexes.length > 1
        ? `background:linear-gradient(135deg, ${c.hexes.map(h => '#' + h.slice(0, 6)).join(', ')})`
        : `background:#${c.hex}`;
    },
    async refreshCatalogs() {
      await this.loadCatalog(true);
      try { this.lines = await Brands.load(true); this.linesState = 'ready'; } catch { /* keep cached */ }
      this.showToast('Catalogue updated ✅');
    },

    // ---------- SpoolmanDB upstream ----------
    async loadUpstream() {
      this.upstreamErr = '';
      try {
        const cached = JSON.parse(sessionStorage.getItem('fs.upstream') || 'null');
        if (cached && Date.now() - cached.at < 30 * 60 * 1000) { this.upstream = cached.data; return; }
      } catch { /* ignore */ }
      try {
        this.upstream = await api.spoolmanUpstream();
        try { sessionStorage.setItem('fs.upstream', JSON.stringify({ at: Date.now(), data: this.upstream })); } catch { /* ignore */ }
      } catch (e) { this.upstreamErr = 'couldn’t reach GitHub'; }
    },

    // ---------- settings ----------
    async loadSettings() {
      this.hh = { name: this.me.household.name, default_min_g: this.me.household.default_min_g,
                  box_desiccant_days: this.me.household.box_desiccant_days ?? 30 };
      this.catalogTs = await Catalog.cachedAt();
      this.loadUpstream();
      this.loadDry();
      try { [this.members, this.printers] = await Promise.all([api.members(), api.printers()]); } catch (e) { this.fail(e); }
    },
    async saveName() {
      try { await api.updateProfile(this.me.id, { display_name: this.myName.trim() }); this.me.display_name = this.myName.trim(); this.showToast('Saved ✅'); }
      catch (e) { this.fail(e); }
    },
    async saveHousehold() {
      try {
        const days = Math.round(+this.hh.box_desiccant_days);
        if (!(days >= 1 && days <= 365)) { this.showToast('Dry box days must be 1–365'); return; }
        const patch = { name: this.hh.name.trim(), default_min_g: +this.hh.default_min_g || 0, box_desiccant_days: days };
        await api.updateHousehold(this.me.household_id, patch);
        Object.assign(this.me.household, patch);
        this.loadSpools();
        this.showToast('Saved ✅');
      } catch (e) { this.fail(e); }
    },
    async toggleKid(m) {
      try { await api.setMemberKid(m.id, !m.is_kid); m.is_kid = !m.is_kid; } catch (e) { this.fail(e); }
    },
    async rotateInvite() {
      if (!confirm('Make a new invite code? The old one stops working.')) return;
      try { this.me.household.invite_code = await api.rotateInvite(); } catch (e) { this.fail(e); }
    },

    // ---------- helpers ----------
    fmt(g) { return Math.round(+g || 0).toLocaleString(); },
    pct(s) { return Math.max(0, Math.min(100, Math.round((+s.remaining_g / +s.initial_g) * 100))); },
    swatch(s) {
      const hexes = s.color_hexes || s.hexes;
      if (hexes && hexes.length > 1) return `background:linear-gradient(135deg, ${hexes.map(h => '#' + h).join(', ')})`;
      const hex = s.color_hex || s.hex;
      return hex ? `background:#${hex}` : 'background:repeating-linear-gradient(45deg,#cbd5e1 0 6px,#f1f5f9 6px 12px)';
    },
    // Spool seen from the side: the coloured ring gets thinner as filament runs out.
    spoolFill(s) {
      const hub = Math.round(30 + (100 - this.pct(s)) * 0.6); // 30 % full … 90 % empty
      const hexes = s.color_hexes && s.color_hexes.length > 1 ? s.color_hexes : null;
      const colour = hexes
        ? `conic-gradient(${hexes.map(h => '#' + h).join(', ')}, #${hexes[0]})`
        : `linear-gradient(#${s.color_hex || '888888'}, #${s.color_hex || '888888'})`;
      return `background: radial-gradient(circle closest-side, #9ca3af 0 14%, #26282c 14% ${hub}%, transparent ${hub}%), ${colour}`;
    },
    status(s) {
      const r = +s.remaining_g, m = +s.effective_min_g;
      if (r <= 0) return { key: 'empty', label: this.simple ? '🫙 Empty' : '⚫ Empty', bar: 'bg-slate-500', cls: 'text-slate-600 dark:text-slate-300' };
      if (r <= m) return { key: 'low', label: this.simple ? '🔴 Almost empty' : '🔴 Order now', bar: 'bg-red-600', cls: 'text-red-700 dark:text-red-300' };
      if (r <= 2 * m) return { key: 'mid', label: this.simple ? '🟡 Getting low' : '🟡 Low', bar: 'bg-amber-500', cls: 'text-amber-700 dark:text-amber-300' };
      return { key: 'ok', label: '🟢 OK', bar: 'bg-emerald-500', cls: 'text-emerald-700 dark:text-emerald-300' };
    },
    learnFor(material) { return learnFor(material); },
    moistureWord(level) { return moistureWord(level); },
    moistureAdvice(s) { return moistureAdvice(s.material, s.location === BOX_LOC, s.location === SEALED); },
    // 3 drops: 'full' | 'half' | 'empty' for drop i (0–2)
    drop(level, i) { return level >= i + 1 ? 'full' : level >= i + 0.5 ? 'half' : 'empty'; },
    glueText(g) {
      if (!g) return this.simple ? 'Same as the main plastic' : 'Same as the main material';
      const yn = v => (v ? 'yes' : 'no');
      return `Textured PEI: ${yn(g.textured)} · Smooth PEI: ${yn(g.smooth)}`;
    },
    openLearnFor(material) { this.go('learn/' + learnFor(material).key); },
    qr(text, cell = 3) {
      try {
        const q = qrcode(0, 'M'); q.addData(text); q.make();
        return q.createSvgTag({ cellSize: cell, margin: 0, scalable: true });
      } catch { return ''; }
    },
    ago(ts) {
      const s = (Date.now() - new Date(ts)) / 1000;
      if (s < 60) return 'just now';
      if (s < 3600) return Math.floor(s / 60) + ' min ago';
      if (s < 86400) return Math.floor(s / 3600) + ' h ago';
      const d = Math.floor(s / 86400);
      return d === 1 ? 'yesterday' : d + ' days ago';
    },
    fmtDate(ts) { return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); },
    when(ts) {
      const d = new Date(ts), diff = (Date.now() - d) / 1000;
      if (diff < 60) return 'just now';
      if (diff < 3600) return Math.floor(diff / 60) + ' min ago';
      if (diff < 86400) return Math.floor(diff / 3600) + ' h ago';
      return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
    },
    showToast(msg, undo = null) {
      this.toast = msg; this.undoFn = undo;
      clearTimeout(this.toastTimer);
      this.toastTimer = setTimeout(() => { this.toast = ''; this.undoFn = null; }, undo ? 10000 : 4000);
    },
    async runUndo() {
      const fn = this.undoFn; this.undoFn = null; this.toast = '';
      try { await fn(); this.showToast('Undone ↩️'); } catch (e) { this.fail(e); }
    },
    friendly(e) {
      const m = (e && (e.message || e.error_description)) || String(e);
      if (/invalid login credentials/i.test(m)) return 'Wrong email or password.';
      if (/email not confirmed/i.test(m)) return 'Please confirm your email first — check your inbox.';
      if (/signups? not allowed|signup.*disabled/i.test(m)) return 'New registrations are closed. Ask the owner for an account.';
      if (/database error saving new user/i.test(m)) return 'That invite code didn’t work. Check it and try again.';
      if (/password should be at least/i.test(m)) return 'Password needs at least 6 characters.';
      if (/rate limit/i.test(m)) return 'Too many tries — wait a minute and try again.';
      if (/row-level security|permission denied/i.test(m)) return 'You’re not allowed to do that.';
      if (/spools_one_per_slot/i.test(m)) return 'That printer slot already has a spool.';
      if (/dry_spots_household_id_name_key/i.test(m)) return 'There is already a dry spot with that name.';
      return m;
    },
    fail(e) { console.error(e); this.showToast('⚠️ ' + this.friendly(e)); },
  }));
});
