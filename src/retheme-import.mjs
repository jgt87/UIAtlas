// Retheme adapter: converts a Retheme template package (folder or .zip with template.json + previews/) into an
// atlas. Each slide layout becomes a screen; theme colours, fonts and placeholder formatting become tokens;
// placeholders, static texts and layout assets become text-free elements. Positions are converted from inches to the
// pixel space of the layout previews so element boxes line up with the previews (copied only when screenshots are opted in).
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { readZip } from './zip.mjs';
import { prepareOut, writeAtlas, contrastReport } from './atlas-util.mjs';

// Same slug Retheme uses for preview file names (preview.py _slug).
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'layout';
const hex = h => (h ? '#' + String(h).replace(/^#/, '').toLowerCase() : null);
const pngWidth = b => (b && b.length > 24 && b.readUInt32BE(12) === 0x49484452 ? b.readUInt32BE(16) : null);

// Read the package's files into memory, from either a folder or a zip (which may nest everything in one top folder).
function readPackage(src) {
  let files;
  if (statSync(src).isDirectory()) {
    files = new Map();
    const walk = (dir, rel) => { for (const f of readdirSync(dir)) { const full = path.join(dir, f), r = rel ? `${rel}/${f}` : f; if (statSync(full).isDirectory()) { if (f === 'previews') walk(full, r); } else if (r === 'template.json' || r.startsWith('previews/')) files.set(r, readFileSync(full)); } };
    walk(src, '');
  } else files = readZip(src);
  const manifestKey = [...files.keys()].filter(k => k === 'template.json' || k.endsWith('/template.json')).sort((a, b) => a.length - b.length)[0];
  if (!manifestKey) throw new Error(`No template.json in ${src} — is this a Retheme template package?`);
  const prefix = manifestKey.slice(0, -'template.json'.length);
  return { manifest: JSON.parse(files.get(manifestKey).toString('utf8')), file: rel => files.get(prefix + rel) };
}

export function importRetheme({ source, outDir, screenshots = false }) {
  const { manifest: m, file } = readPackage(source);
  const geo = m.slide_geometry || {};
  const widthIn = geo.width_in || m.grid?.slide_width_in || 13.333, heightIn = geo.height_in || m.grid?.slide_height_in || 7.5;
  const previewOf = layout => file(`previews/layout-${slug(layout.name)}.png`);
  // Scale = preview pixels per inch, so element boxes match the screenshots; 96 when there are no previews.
  const firstPreview = (m.layouts || []).map(previewOf).find(Boolean);
  const ppi = (pngWidth(firstPreview) || 0) / widthIn || 96;
  const px = v => Math.round((v || 0) * ppi);
  const bbox = o => ({ x: px(o.position?.x_in), y: px(o.position?.y_in), w: px(o.size?.width_in), h: px(o.size?.height_in) });

  const tally = {}; const add = (k, v, n = 1) => { if (v == null || v === '') return; (tally[k] ||= new Map()).set(v, (tally[k].get(v) || 0) + n); };
  const top = k => [...(tally[k] || new Map())].sort((a, b) => b[1] - a[1]).map(([value, count]) => ({ value, count }));
  // what each colour is used for; Retheme's own usage names map onto text/background/border/fill
  const usage = new Map(), KIND = { text: 'text', background: 'background', bg: 'background', line: 'border', border: 'border', fill: 'fill', accent: 'fill' };
  const use = (kind, v, n = 1) => { if (!v) return; add('colors', v, n); const u = usage.get(v) || usage.set(v, {}).get(v); u[kind] = (u[kind] || 0) + n; };
  const pairs = []; // text colour on the layout's solid background, for the contrast report

  // Theme colours carry their slot and semantic role; usage counts come from Retheme's own observation.
  const labels = new Map();
  for (const c of m.colors || []) {
    const v = hex(c.hex); if (!v) continue;
    const entries = Object.entries(c.usage || {}); if (!entries.length) add('colors', v, 0);
    for (const [k, n] of entries) use(KIND[k] || 'fill', v, n);
    const label = [c.theme_slot, c.role].filter(Boolean).join(' · '); // slots can share a hex (e.g. hlink/folHlink)
    labels.set(v, labels.has(v) ? `${labels.get(v)}, ${label}` : label);
  }
  const fmtTokens = f => {
    if (!f) return;
    add('fonts', f.font); if (f.size_pt) add('fontSizes', `${f.size_pt}pt`);
    add('fontWeights', f.bold ? '700' : '400'); if (f.color) use('text', hex(f.color));
  };
  add('fonts', m.fonts?.heading, 0); add('fonts', m.fonts?.body, 0);

  const assetsById = new Map((m.assets || []).map(a => [a.asset_id, a]));
  const shotsDir = prepareOut(outDir, { screenshots });

  const screens = (m.layouts || []).map(layout => {
    const id = slug(layout.name);
    const bg = layout.background || {};
    if (bg.type === 'solid') use('background', hex(bg.hex));
    for (const s of bg.stops || []) use('background', hex(s.hex));
    const behind = bg.type === 'solid' ? hex(bg.hex) : null; // gradients and pictures: no single backdrop to rate
    const pair = f => { const fg = hex(f?.color); if (behind && fg && f.size_pt) pairs.push({ fg, bg: behind, large: f.size_pt * 4 / 3 >= 24 || (f.bold && f.size_pt * 4 / 3 >= 18.66), count: 1 }); };
    const elements = [], inventory = {}; const bump = k => inventory[k] = (inventory[k] || 0) + 1;
    for (const ph of layout.placeholders || []) {
      const levels = ph.format_levels || {}; for (const f of Object.values(levels)) fmtTokens(f);
      const l1 = levels['1'] || {}; pair(l1);
      bump(ph.type);
      elements.push({ role: ph.type, tag: 'placeholder', bbox: bbox(ph), color: hex(l1.color), bg: null,
        fontSize: l1.size_pt ? `${l1.size_pt}pt` : null, weight: l1.size_pt ? (l1.bold ? '700' : '400') : null, radius: null, font: l1.font || null, align: l1.align || null });
    }
    for (const t of layout.static_texts || []) {
      const f = t.format || {}; fmtTokens(f); pair(f);
      bump('text');
      elements.push({ role: 'text', tag: 'static text', bbox: bbox(t), color: hex(f.color), bg: null,
        fontSize: f.size_pt ? `${f.size_pt}pt` : null, weight: f.size_pt ? (f.bold ? '700' : '400') : null, radius: null, font: f.font || null, align: f.align || null });
    }
    const ids = new Set(layout.static_assets || []);
    for (const a of m.assets || []) if (a.owning_layout === 'all' || (a.owning_layouts || []).includes(layout.name)) ids.add(a.asset_id);
    for (const aid of ids) {
      const a = assetsById.get(aid); if (!a) continue;
      bump(a.type);
      elements.push({ role: a.type, tag: a.source_format || 'asset', bbox: bbox(a), color: null, bg: null, fontSize: null, weight: null, radius: null });
    }
    const png = previewOf(layout);
    if (png && screenshots) writeFileSync(path.join(shotsDir, `${id}.png`), png);
    return { id, url: `${m.source_file || 'template'} › ${layout.name}`, title: layout.name, purpose: layout.purpose || null,
      screenshot: png && screenshots ? `screens/${id}.png` : null, width: px(widthIn), height: px(heightIn), inventory, elements };
  });

  const cssVars = [];
  for (const c of m.colors || []) if (c.theme_slot && c.hex) cssVars.push({ name: `--${c.theme_slot}`, value: hex(c.hex) });
  if (m.fonts?.heading) cssVars.push({ name: '--font-heading', value: m.fonts.heading });
  if (m.fonts?.body) cssVars.push({ name: '--font-body', value: m.fonts.body });
  for (const [k, v] of Object.entries(m.grid || {})) if (k.endsWith('_in') && v != null) cssVars.push({ name: `--${k.slice(0, -3).replace(/_/g, '-')}`, value: `${v}in` });

  const colors = top('colors').map(c => ({ ...c, ...(labels.has(c.value) ? { label: labels.get(c.value) } : {}), ...(usage.has(c.value) ? { usage: usage.get(c.value) } : {}) }));
  return writeAtlas(outDir, {
    project: { name: m.template_name || path.basename(source), kind: 'pptx', source: m.source_file || path.basename(source),
      viewport: { width: px(widthIn), height: px(heightIn) }, units: { ppi: Math.round(ppi * 100) / 100, slideInches: { width: widthIn, height: heightIn } },
      previews: m.preview_mode || null, notes: m.extraction_notes || [] },
    tokens: { colors, fonts: top('fonts'), fontSizes: top('fontSizes'), fontWeights: top('fontWeights'), lineHeights: [], letterSpacings: [], spacing: [], radii: [], shadows: [], cssVars },
    contrast: contrastReport(pairs), screens,
  }, { screenshots });
}
