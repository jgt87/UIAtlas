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

// A folder package: template.json at the top plus everything under previews/ (no other subfolder is descended into).
function walkFolder(dir, rel, files) {
  for (const f of readdirSync(dir)) {
    const full = path.join(dir, f), r = rel ? `${rel}/${f}` : f;
    if (statSync(full).isDirectory()) { if (f === 'previews') walkFolder(full, r, files); }
    else if (r === 'template.json' || r.startsWith('previews/')) files.set(r, readFileSync(full));
  }
  return files;
}

// Read the package's files into memory, from either a folder or a zip (which may nest everything in one top folder).
function readPackage(src) {
  const files = statSync(src).isDirectory() ? walkFolder(src, '', new Map()) : readZip(src);
  const manifestKey = [...files.keys()].filter(k => k === 'template.json' || k.endsWith('/template.json')).sort((a, b) => a.length - b.length)[0];
  if (!manifestKey) throw new Error(`No template.json in ${path.basename(src)} — is this a template package?`);
  const prefix = manifestKey.slice(0, -'template.json'.length);
  return { manifest: JSON.parse(files.get(manifestKey).toString('utf8')), file: rel => files.get(prefix + rel) };
}

// Token counts as the importer goes: value counts per kind, what each colour is used for, theme-colour labels and
// text-on-background pairs for the contrast report.
const newTally = () => ({ counts: {}, usage: new Map(), labels: new Map(), pairs: [] });
function add(rt, k, v, n = 1) {
  if (v == null || v === '') return;
  (rt.counts[k] ||= new Map()).set(v, (rt.counts[k].get(v) || 0) + n);
}
function use(rt, kind, v, n = 1) {
  if (!v) return;
  add(rt, 'colors', v, n);
  const u = rt.usage.get(v) || rt.usage.set(v, {}).get(v); u[kind] = (u[kind] || 0) + n;
}
const top = (rt, k) => [...(rt.counts[k] || new Map())].sort((a, b) => b[1] - a[1]).map(([value, count]) => ({ value, count }));
// Retheme's own usage names map onto text/background/border/fill
const KIND = { text: 'text', background: 'background', bg: 'background', line: 'border', border: 'border', fill: 'fill', accent: 'fill' };

// Theme colours carry their slot and semantic role; usage counts come from Retheme's own observation.
function themeColors(rt, colors) {
  for (const c of colors || []) {
    const v = hex(c.hex); if (!v) continue;
    const entries = Object.entries(c.usage || {}); if (!entries.length) add(rt, 'colors', v, 0);
    for (const [k, n] of entries) use(rt, KIND[k] || 'fill', v, n);
    const label = [c.theme_slot, c.role].filter(Boolean).join(' · '); // slots can share a hex (e.g. hlink/folHlink)
    rt.labels.set(v, rt.labels.has(v) ? `${rt.labels.get(v)}, ${label}` : label);
  }
}
function fmtTokens(rt, f) {
  if (!f) return;
  add(rt, 'fonts', f.font); if (f.size_pt) add(rt, 'fontSizes', `${f.size_pt}pt`);
  add(rt, 'fontWeights', f.bold ? '700' : '400'); if (f.color) use(rt, 'text', hex(f.color));
}
// a solid background is the one colour text on the layout can be rated against; gradients and pictures have none
function layoutBackground(rt, layout) {
  const bg = layout.background || {};
  if (bg.type === 'solid') use(rt, 'background', hex(bg.hex));
  for (const s of bg.stops || []) use(rt, 'background', hex(s.hex));
  return bg.type === 'solid' ? hex(bg.hex) : null;
}
function contrastPair(rt, behind, f) {
  const fg = hex(f?.color);
  if (behind && fg && f.size_pt) rt.pairs.push({ fg, bg: behind, large: f.size_pt * 4 / 3 >= 24 || (f.bold && f.size_pt * 4 / 3 >= 18.66), count: 1 });
}
const textElement = (role, tag, bbox, f) => ({ role, tag, bbox, color: hex(f.color), bg: null,
  fontSize: f.size_pt ? `${f.size_pt}pt` : null, weight: f.size_pt ? (f.bold ? '700' : '400') : null, radius: null, font: f.font || null, align: f.align || null });
// the layout's own static assets plus the template's assets owned by all layouts or by this one
function layoutAssets(m, layout, assetsById) {
  const ids = new Set(layout.static_assets || []);
  for (const a of m.assets || []) if (a.owning_layout === 'all' || (a.owning_layouts || []).includes(layout.name)) ids.add(a.asset_id);
  return [...ids].map(id => assetsById.get(id)).filter(Boolean);
}

// one layout -> one screen; placeholders, static texts and assets become elements (formatting only, never text)
function textElements(rt, layout, behind, bbox, push) {
  for (const ph of layout.placeholders || []) {
    const levels = ph.format_levels || {}; for (const f of Object.values(levels)) fmtTokens(rt, f);
    const l1 = levels['1'] || {}; contrastPair(rt, behind, l1);
    push(textElement(ph.type, 'placeholder', bbox(ph), l1));
  }
  for (const t of layout.static_texts || []) {
    const f = t.format || {}; fmtTokens(rt, f); contrastPair(rt, behind, f);
    push(textElement('text', 'static text', bbox(t), f));
  }
}
function layoutScreen(rt, m, layout, env) {
  const { bbox, px } = env, id = slug(layout.name), behind = layoutBackground(rt, layout);
  const elements = [], inventory = {}, push = el => { inventory[el.role] = (inventory[el.role] || 0) + 1; elements.push(el); };
  textElements(rt, layout, behind, bbox, push);
  for (const a of layoutAssets(m, layout, env.assetsById)) push({ role: a.type, tag: a.source_format || 'asset', bbox: bbox(a), color: null, bg: null, fontSize: null, weight: null, radius: null });
  const png = env.previewOf(layout), shot = png && env.screenshots;
  if (shot) writeFileSync(path.join(env.shotsDir, `${id}.png`), png);
  return { id, url: `${m.source_file || 'template'} › ${layout.name}`, title: layout.name, purpose: layout.purpose || null,
    screenshot: shot ? `screens/${id}.png` : null, width: px(env.widthIn), height: px(env.heightIn), inventory, elements };
}

// the template's declared variables: theme slots, heading/body fonts, grid measures in inches
const themeVars = colors => (colors || []).filter(c => c.theme_slot && c.hex).map(c => ({ name: `--${c.theme_slot}`, value: hex(c.hex) }));
const fontVars = fonts => ['heading', 'body'].filter(k => fonts?.[k]).map(k => ({ name: `--font-${k}`, value: fonts[k] }));
// only measures (`*_in`) are variables; counts like `columns` are not
const gridVars = grid => Object.entries(grid || {}).filter(([k, v]) => k.endsWith('_in') && v != null)
  .map(([k, v]) => ({ name: `--${k.slice(0, -3).replace(/_/g, '-')}`, value: `${v}in` }));
const declaredVars = m => [...themeVars(m.colors), ...fontVars(m.fonts), ...gridVars(m.grid)];
const colorTokens = rt => top(rt, 'colors').map(c => ({ ...c, ...(rt.labels.has(c.value) ? { label: rt.labels.get(c.value) } : {}), ...(rt.usage.has(c.value) ? { usage: rt.usage.get(c.value) } : {}) }));

// Slide size in inches, and the inches -> pixels conversion: preview pixels per inch, so element boxes match the
// screenshots; 96 when there are no previews.
// declared geometry first, then the grid, then a 16:9 PowerPoint default
const slideInches = (geo, grid) => ({ widthIn: geo.width_in || grid.slide_width_in || 13.333, heightIn: geo.height_in || grid.slide_height_in || 7.5 });
function slideGeometry(m, file) {
  const { widthIn, heightIn } = slideInches(m.slide_geometry || {}, m.grid || {});
  const previewOf = layout => file(`previews/layout-${slug(layout.name)}.png`);
  const firstPreview = (m.layouts || []).map(previewOf).find(Boolean);
  const ppi = (pngWidth(firstPreview) || 0) / widthIn || 96;
  const px = v => Math.round((v || 0) * ppi);
  const bbox = o => ({ x: px(o.position?.x_in), y: px(o.position?.y_in), w: px(o.size?.width_in), h: px(o.size?.height_in) });
  return { widthIn, heightIn, previewOf, ppi, px, bbox };
}

export function importRetheme({ source, outDir, screenshots = false }) {
  const { manifest: m, file } = readPackage(source);
  const { widthIn, heightIn, previewOf, ppi, px, bbox } = slideGeometry(m, file);
  const rt = newTally();
  themeColors(rt, m.colors);
  add(rt, 'fonts', m.fonts?.heading, 0); add(rt, 'fonts', m.fonts?.body, 0);
  const env = { px, bbox, previewOf, widthIn, heightIn, screenshots, assetsById: new Map((m.assets || []).map(a => [a.asset_id, a])), shotsDir: prepareOut(outDir, { screenshots }) };
  const screens = (m.layouts || []).map(layout => layoutScreen(rt, m, layout, env));

  return writeAtlas(outDir, {
    project: { name: m.template_name || path.basename(source), kind: 'pptx', source: m.source_file || path.basename(source),
      viewport: { width: px(widthIn), height: px(heightIn) }, units: { ppi: Math.round(ppi * 100) / 100, slideInches: { width: widthIn, height: heightIn } },
      previews: m.preview_mode || null, notes: m.extraction_notes || [] },
    tokens: { colors: colorTokens(rt), fonts: top(rt, 'fonts'), fontSizes: top(rt, 'fontSizes'), fontWeights: top(rt, 'fontWeights'), lineHeights: [], letterSpacings: [], spacing: [], radii: [], shadows: [], cssVars: declaredVars(m) },
    contrast: contrastReport(rt.pairs), screens,
  }, { screenshots });
}
