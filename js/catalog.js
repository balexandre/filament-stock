// SpoolmanDB catalogue (https://github.com/Donkie/SpoolmanDB).
// ~6 MB, so it is only downloaded when needed and cached in IndexedDB for a week.
const Catalog = (() => {
  const URL_FILAMENTS = 'https://donkie.github.io/SpoolmanDB/filaments.json';
  const DB = 'filament-stock', STORE = 'kv', KEY = 'spoolmandb-filaments-v1';
  const MAX_AGE = 7 * 24 * 3600 * 1000;
  let items = null, loading = null;

  const idb = () => new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  async function idbGet(k) {
    try {
      const db = await idb();
      return await new Promise((res, rej) => {
        const t = db.transaction(STORE).objectStore(STORE).get(k);
        t.onsuccess = () => res(t.result); t.onerror = () => rej(t.error);
      });
    } catch { return null; }
  }
  async function idbSet(k, v) {
    try {
      const db = await idb();
      await new Promise((res, rej) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(v, k);
        tx.oncomplete = res; tx.onerror = () => rej(tx.error);
      });
    } catch { /* private mode etc. — just don't cache */ }
  }

  function normalize(raw) {
    return raw
      .filter(f => f.diameter && Math.abs(f.diameter - 1.75) < 0.01) // both printers are 1.75 mm: only rows SpoolmanDB says are 1.75
      .map(f => ({
        id: f.id,
        brand: f.manufacturer,
        name: f.name,
        material: f.material,
        hex: f.color_hex || (f.color_hexes && f.color_hexes[0]) || null,
        hexes: f.color_hexes && f.color_hexes.length > 1 ? f.color_hexes : null,
        weight: f.weight || 1000,
        spool_weight: f.spool_weight ?? null,
        diameter: f.diameter,
        extruder_temp: f.extruder_temp ?? null,
        bed_temp: f.bed_temp ?? null,
        finish: f.finish || null,
        translucent: !!f.translucent,
        glow: !!f.glow,
        s: `${f.manufacturer} ${f.name} ${f.material} ${f.finish || ''} ${f.pattern || ''} ${f.glow ? 'glow' : ''}`.toLowerCase(),
      }));
  }

  async function load(force = false) {
    if (items && !force) return items;
    if (loading) return loading;
    loading = (async () => {
      const cached = await idbGet(KEY);
      if (!force && cached && Date.now() - cached.ts < MAX_AGE) { items = cached.items; return items; }
      try {
        const r = await fetch(URL_FILAMENTS, { cache: 'no-cache' });
        if (!r.ok) throw new Error('SpoolmanDB download failed (HTTP ' + r.status + ')');
        items = normalize(await r.json());
        await idbSet(KEY, { ts: Date.now(), items });
      } catch (e) {
        if (cached) items = cached.items; else throw e;
      }
      return items;
    })();
    try { return await loading; } finally { loading = null; }
  }

  function search(query, limit = 40) {
    if (!items) return [];
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    const out = [];
    for (const f of items) {
      if (words.every(w => f.s.includes(w))) { out.push(f); if (out.length >= limit) break; }
    }
    return out;
  }

  // Brands with their 1.75 mm filament count, for the guided picker.
  function brands() {
    const m = new Map();
    for (const f of items || []) {
      // the id prefix ("sunlu" in "sunlu_petg_…") is the brand's source file name
      const b = m.get(f.brand) || { name: f.brand, prefix: f.id.split('_')[0], count: 0 };
      b.count++; m.set(f.brand, b);
    }
    return [...m.values()];
  }
  const ofBrand = brand => (items || []).filter(f => f.brand === brand);

  return {
    load, search, brands, ofBrand,
    kvGet: idbGet, kvSet: idbSet, // shared IndexedDB cache (js/brands.js uses it too)
    get count() { return items ? items.length : 0; },
    async cachedAt() { const c = await idbGet(KEY); return c ? c.ts : null; },
  };
})();
