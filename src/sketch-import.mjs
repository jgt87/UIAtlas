// Sketch adapter: converts a .sketch file (zip of JSON: document.json, meta.json, pages/<id>.json, previews/, images/)
// into an atlas. Every artboard (and every top-level symbol master) becomes a screen with a schematic SVG drawn from
// its layer tree, since Sketch files carry no per-artboard renders. Swatches, colour assets, text styles and layer
// styles become tokens; text, symbol instances, filled shapes and bitmaps become elements.
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { readZip } from './zip.mjs';
import { slug, toHex, tokenTally, prepareOut, writeAtlas } from './atlas-util.mjs';

const SHAPES = new Set(['rectangle', 'oval', 'shapePath', 'star', 'polygon', 'triangle', 'shapeGroup']);
const GROUPS = new Set(['group', 'shapeGroup']);
const WEIGHTS = [[/hairline|thin/, 100], [/extra-?light|ultra-?light/, 200], [/light/, 300], [/medium/, 500], [/semi-?bold|demi-?bold/, 600],
  [/extra-?bold|ultra-?bold|heavy/, 800], [/black/, 900], [/bold/, 700]];
const col = c => (c && typeof c === 'object' ? toHex({ r: c.red ?? 0, g: c.green ?? 0, b: c.blue ?? 0, a: c.alpha ?? 1 }) : null);
const esc = s => String(s).replace(/[<>&"']/g, ch => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[ch]);
const r1 = v => Math.round((Number(v) || 0) * 10) / 10;
const pngSize = b => (b && b.length > 24 && b.readUInt32BE(12) === 0x49484452 ? { width: b.readUInt32BE(16), height: b.readUInt32BE(20) } : null);
const median = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
// 'Inter-SemiBold' -> { family: 'Inter', weight: 600 }; 'HelveticaNeue' -> 'Helvetica Neue', 400.
function parseFont(ps) {
  if (!ps) return { family: null, weight: null };
  const [fam, style = ''] = String(ps).split('-');
  const w = WEIGHTS.find(([re]) => re.test(style.toLowerCase()))?.[1] || 400;
  return { family: fam.replace(/([a-z])([A-Z])/g, '$1 $2'), weight: /italic|oblique/i.test(style) && w === 400 ? 400 : w };
}
const fontAttr = a => a?.MSAttributedStringFontAttribute?.attributes || {};
// Font, size and colour of a text layer: first attributed run, falling back to the layer's text style.
function textInfo(l) {
  const runs = (l.attributedString?.attributes || []).map(r => r.attributes || {});
  const enc = l.style?.textStyle?.encodedAttributes || {};
  const first = runs[0] || enc, fa = fontAttr(first).name ? fontAttr(first) : fontAttr(enc);
  return { runs: runs.length ? runs : [enc], name: fa.name || null, size: Number(fa.size) || null,
    color: col(first.MSAttributedStringColorAttribute || enc.MSAttributedStringColorAttribute) };
}
const fills = l => (l.style?.fills || []).filter(f => f.isEnabled !== false);
const fillColor = f => col(f.fillType === 1 ? f.gradient?.stops?.[0]?.color : f.color);
const firstFill = l => { for (const f of fills(l)) { const c = fillColor(f); if (c) return c; } return null; };
const border = l => (l.style?.borders || []).find(b => b.isEnabled !== false && col(b.color));
const radiusOf = l => l._class === 'rectangle' ? (Number(l.fixedRadius) || Math.max(0, ...(l.points || []).map(p => Number(p.cornerRadius) || 0)) || null) : null;
const shadowCss = (s, inset) => `${inset ? 'inset ' : ''}${r1(s.offsetX)}px ${r1(s.offsetY)}px ${r1(s.blurRadius)}px ${r1(s.spread)}px ${col(s.color) || '#000000'}`;

export async function importSketch({ source, outDir, screenshots = false }) {
  const files = readZip(source);
  const json = name => { const b = files.get(name); return b ? JSON.parse(b.toString('utf8')) : null; };
  const doc = json('document.json');
  if (!doc) throw new Error(`No document.json in ${path.basename(source)} — is this a .sketch file?`);
  const meta = json('meta.json') || {};
  const refs = (doc.pages || []).map(p => p._ref).filter(Boolean);
  const pages = (refs.length ? refs.map(r => `${r}.json`) : [...files.keys()].filter(k => /^pages\/[^/]+\.json$/.test(k))).map(json).filter(Boolean);
  const shots = prepareOut(outDir, { screenshots }), tally = tokenTally();

  // Colour names from swatches and colour assets, used as token labels.
  const names = new Map(), nameColor = (name, c) => { const v = col(c); if (v && name) (names.get(v) || names.set(v, new Set()).get(v)).add(name); return v; };
  const addColor = (v, n = 1, kind) => v && (names.has(v) ? [...names.get(v)].forEach((l, i) => kind ? tally.use(kind, v, i ? 0 : n, l) : tally.add('colors', v, i ? 0 : n, l)) : kind ? tally.use(kind, v, n) : tally.add('colors', v, n));
  for (const s of doc.sharedSwatches?.objects || []) { const v = nameColor(s.name, s.value); if (v) tally.cssVar(`--${slug(s.name)}`, v); }
  for (const a of doc.assets?.colorAssets || []) nameColor(a.name, a.color);
  for (const s of doc.sharedSwatches?.objects || []) addColor(col(s.value));
  for (const a of doc.assets?.colorAssets || []) addColor(col(a.color));
  for (const c of doc.assets?.colors || []) addColor(col(c));

  const fontTokens = (ps, size, n = 1) => {
    const { family, weight } = parseFont(ps);
    if (family) tally.add('fonts', family, n); if (size) tally.add('fontSizes', `${r1(size)}px`, n); if (ps) tally.add('fontWeights', String(weight), n);
  };
  for (const ts of doc.layerTextStyles?.objects || []) {
    const enc = ts.value?.textStyle?.encodedAttributes || {}, fa = fontAttr(enc), { family, weight } = parseFont(fa.name);
    fontTokens(fa.name, fa.size); addColor(col(enc.MSAttributedStringColorAttribute), 1, 'text');
    if (fa.size || family) tally.cssVar(`--text-${slug(ts.name)}`, [fa.size ? `${r1(fa.size)}px` : null, family, fa.name ? weight : null].filter(Boolean).join(' '));
  }

  // Symbol masters (local and foreign) by symbolID, for instance names and schematic drawing.
  const masters = new Map(), findMasters = ls => { for (const l of ls || []) { if (l._class === 'symbolMaster') masters.set(l.symbolID, l); if (l.layers) findMasters(l.layers); } };
  for (const p of pages) findMasters(p.layers);
  for (const f of doc.foreignSymbols || []) if (f.symbolMaster && !masters.has(f.symbolMaster.symbolID)) masters.set(f.symbolMaster.symbolID, f.symbolMaster);

  const used = new Set(), uid = s => { let id = slug(s), n = 2; while (used.has(id)) id = `${slug(s)}-${n++}`; used.add(id); return id; };
  const screens = [];
  const preview = files.get('previews/preview.png');
  if (preview && screenshots) {
    writeFileSync(path.join(shots, 'preview.png'), preview); used.add('preview');
    const sz = pngSize(preview) || {};
    screens.push({ id: 'preview', url: 'Document preview', title: 'Document preview', purpose: 'Sketch document preview image', screenshot: 'screens/preview.png',
      width: sz.width || null, height: sz.height || null, inventory: {}, elements: [] });
  }

  for (const page of pages) for (const board of page.layers || []) {
    if (board._class !== 'artboard' && board._class !== 'symbolMaster') continue;
    if (board.isVisible === false) continue;
    const W = Math.round(board.frame?.width || 0), H = Math.round(board.frame?.height || 0);
    const svg = [], elements = [], inventory = {};
    const bg = board.hasBackgroundColor ? col(board.backgroundColor) : null;
    if (bg) { addColor(bg, 1, 'background'); svg.push(`<rect width="${W}" height="${H}" fill="${bg}"/>`); }
    const el = (l, role, box, extra) => { inventory[role] = (inventory[role] || 0) + 1;
      elements.push({ role, tag: l._class, bbox: box, color: null, bg: null, fontSize: null, weight: null, radius: null, font: null, ...extra }); };
    // Draw (and, unless inside a symbol instance, record) a layer tree; ox/oy = absolute offset of the parent.
    const walk = (layers, ox, oy, record, depth) => {
      for (const l of layers || []) {
        if (l.isVisible === false) continue;
        const f = l.frame || {}, x = r1(ox + (f.x || 0)), y = r1(oy + (f.y || 0)), w = r1(f.width), h = r1(f.height);
        const box = { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
        const fill = firstFill(l), b = border(l), bc = b ? col(b.color) : null, op = l.style?.contextSettings?.opacity;
        if (record) {
          for (const fl of fills(l)) { if (fl.fillType === 1) (fl.gradient?.stops || []).forEach(s => addColor(col(s.color), 1, 'background')); else addColor(fillColor(fl), 1, 'background'); }
          for (const bo of l.style?.borders || []) if (bo.isEnabled !== false) addColor(col(bo.color), 1, 'border');
          for (const s of l.style?.shadows || []) if (s.isEnabled !== false) { tally.add('shadows', shadowCss(s)); addColor(col(s.color)); }
          for (const s of l.style?.innerShadows || []) if (s.isEnabled !== false) { tally.add('shadows', shadowCss(s, true)); addColor(col(s.color)); }
        }
        const stroke = bc ? ` stroke="${bc}" stroke-width="${r1(b.thickness ?? 1)}"` : '', alpha = op != null && op < 1 ? ` opacity="${r1(op)}"` : '';
        if (l._class === 'text') {
          const t = textInfo(l), str = String(l.attributedString?.string ?? '');
          const size = t.size || 12, { family, weight } = parseFont(t.name);
          if (record) {
            for (const run of t.runs) { const fa = fontAttr(run); fontTokens(fa.name, fa.size); addColor(col(run.MSAttributedStringColorAttribute), 1, 'text'); }
            el(l, 'text', box, { color: t.color, fontSize: t.size ? `${r1(t.size)}px` : null, weight: t.name ? String(weight) : null, font: family, _size: size });
          }
          const line = str.split(/\r?\n|\u2028/)[0];
          if (line) svg.push(`<text x="${x}" y="${r1(y + size)}" font-family="${esc(family ? `'${family}', sans-serif` : 'sans-serif')}" font-size="${r1(size)}"${t.name ? ` font-weight="${weight}"` : ''} fill="${t.color || '#000000'}"${alpha}>${esc(line)}</text>`);
        } else if (l._class === 'symbolInstance') {
          const m = masters.get(l.symbolID);
          if (record) el(l, 'component', box, { name: m?.name || null, bg: fill }); // the symbol's design-system name, not layer content
          if (m && depth < 8) { svg.push(`<g${alpha}>`); walk(m.layers, x, y, false, depth + 1); svg.push('</g>'); }
          else svg.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="#999999" stroke-dasharray="4 3"/>`);
        } else if (l._class === 'bitmap') {
          if (record) el(l, 'image', box);
          svg.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#cccccc" stroke="#999999"${alpha}/>`);
        } else if (SHAPES.has(l._class) && (l._class !== 'shapeGroup' || !l.layers?.length || fill)) {
          const rad = radiusOf(l);
          if (record && rad) tally.add('radii', `${r1(rad)}px`);
          if (record && fill) el(l, 'shape', box, { bg: fill, color: bc, radius: rad ? `${r1(rad)}px` : null });
          const paint = ` fill="${fill || 'none'}"${stroke}${alpha}`;
          svg.push(l._class === 'oval' ? `<ellipse cx="${r1(x + w / 2)}" cy="${r1(y + h / 2)}" rx="${r1(w / 2)}" ry="${r1(h / 2)}"${paint}/>`
            : `<rect x="${x}" y="${y}" width="${w}" height="${h}"${rad ? ` rx="${r1(Math.min(rad, w / 2, h / 2))}"` : ''}${paint}/>`);
        }
        if (GROUPS.has(l._class) && l.layers && !(l._class === 'shapeGroup' && fill)) { svg.push(`<g${alpha}>`); walk(l.layers, x, y, record, depth); svg.push('</g>'); }
      }
    };
    walk(board.layers, 0, 0, true, 0);
    const med = median(elements.filter(e => e._size).map(e => e._size));
    for (const e of elements) if (e._size) { if (med && e._size >= 1.4 * med) { e.role = 'heading'; inventory.text--; inventory.heading = (inventory.heading || 0) + 1; } delete e._size; }
    if (inventory.text === 0) delete inventory.text;

    const id = uid(board.name), master = board._class === 'symbolMaster';
    // the schematic draws the file's text, so it is only written when screenshots are opted into
    if (screenshots) writeFileSync(path.join(shots, `${id}.svg`), `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`
      + `<rect width="${W}" height="${H}" fill="${bg ? bg : '#ffffff'}"/>${svg.join('')}</svg>\n`);
    screens.push({ id, url: `${page.name} › ${board.name}`, title: board.name, purpose: master ? 'Symbol master' : 'Artboard',
      screenshot: screenshots ? `screens/${id}.svg` : null, width: W, height: H, inventory, elements });
  }

  const first = screens.find(s => s.id !== 'preview');
  const notes = [`Sketch ${meta.appVersion || 'unknown version'}: ${pages.length} page(s), ${screens.filter(s => s.purpose === 'Artboard').length} artboard(s), ${screens.filter(s => s.purpose === 'Symbol master').length} symbol master(s).`,
    ...(screenshots ? ['Screens are schematic SVGs drawn from the layer tree (boxes, ovals, first text line, grey bitmaps), not renders.'] : [])];
  return writeAtlas(outDir, {
    project: { name: path.basename(source, path.extname(source)), kind: 'sketch', source: path.basename(source),
      viewport: first ? { width: first.width, height: first.height } : null, notes },
    tokens: tally.finalize(), screens,
  }, { screenshots });
}
