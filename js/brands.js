// Brand product lines for the Learn section, from SpoolmanDB's per-brand SOURCE files.
// Those files keep one entry per product line (PLA Matte, PLA Silk+, …) with its colours,
// which the compiled filaments.json flattens away. Small (~60 KB), so they load on Learn.
// To add a brand later: add it to SOURCES and (optionally) notes in js/brand-notes.js.
const Brands = (() => {
  const SOURCES = [
    { key: 'bambulab', name: 'Bambu Lab', url: 'https://raw.githubusercontent.com/Donkie/SpoolmanDB/main/filaments/bambulab.json' },
  ];
  const MAX_AGE = 7 * 24 * 3600 * 1000;
  let lines = null, loading = null;

  const slug = s => s.toLowerCase().replace(/\+/g, '-plus').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

  // "Matte {color_name}" → "PLA Matte"; "{color_name}" + pattern marble → "PLA Marble"
  function deriveLabel(e) {
    const mat = e.material.replace(/-(\d+A)$/, ' $1');
    const t = e.name.replace('{color_name}', '').replace(/\s+/g, ' ').trim();
    if (t) return t.toUpperCase().startsWith(e.material.toUpperCase()) ? t : `${mat} ${t}`;
    if (e.pattern) return `${mat} ${cap(e.pattern)}`;
    if (e.translucent) return `${mat} Translucent`;
    return mat;
  }

  function build(src, data) {
    // BRAND_NOTES is a top-level const (not a window property), so reference it directly
    const notes = (typeof BRAND_NOTES !== 'undefined' ? BRAND_NOTES : {})[src.key] || [];
    const used = new Set();
    return (data.filaments || []).map(e => {
      let note = {};
      try { note = notes.find(n => n.match(e)) || {}; } catch { /* a bad matcher shouldn't break Learn */ }
      const label = note.label || deriveLabel(e);
      let id = slug(label);
      while (used.has(id)) id += '-2';
      used.add(id);
      const fibre = /CF|GF/.test(e.material);
      const tags = [];
      if (e.finish === 'matte') tags.push('Matte');
      if (e.finish === 'glossy') tags.push('Glossy');
      if (e.pattern) tags.push(cap(e.pattern));
      if (e.translucent) tags.push('Translucent');
      if (e.glow) tags.push('Glows');
      if (e.colors && e.colors.some(c => c.hexes)) tags.push('Multi-colour');
      return {
        id, brand: src.name, label, material: e.material, template: e.name,
        family: note.family || learnFor(e.material).key,
        colors: (e.colors || []).map(c => ({ name: c.name, hex: (c.hex || (c.hexes && c.hexes[0]) || '888888').slice(0, 6), hexes: c.hexes || null })),
        nozzle: e.extruder_temp ?? null, bed: e.bed_temp ?? null,
        hardened: fibre || !!note.hardened, tags,
        blurb: note.blurb || null, kid: note.kid || null, curated: !!note.label,
      };
    });
  }

  async function load(force = false) {
    if (lines && !force) return lines;
    if (loading) return loading;
    loading = (async () => {
      const out = [];
      for (const src of SOURCES) {
        const key = 'brand-' + src.key + '-v1';
        const cached = await Catalog.kvGet(key);
        let data = !force && cached && Date.now() - cached.ts < MAX_AGE ? cached.data : null;
        if (!data) {
          try {
            const r = await fetch(src.url, { cache: 'no-cache' });
            if (!r.ok) throw new Error('SpoolmanDB HTTP ' + r.status);
            data = await r.json();
            await Catalog.kvSet(key, { ts: Date.now(), data });
          } catch (err) {
            if (cached) data = cached.data; else throw err;
          }
        }
        out.push(...build(src, data));
      }
      lines = out;
      return lines;
    })();
    try { return await loading; } finally { loading = null; }
  }

  return { load, SOURCES, get lines() { return lines || []; } };
})();
