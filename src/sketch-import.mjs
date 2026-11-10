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
const encoded = style => style?.textStyle?.encodedAttributes || {}; // a layer style's or shared text style's attributes
const runAttrs = l => (l.attributedString?.attributes || []).map(r => r.attributes || {});
// Font, size and colour of a text layer: first attributed run, falling back to the layer's text style.
function textInfo(l) {
  const runs = runAttrs(l), enc = encoded(l.style);
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

const fontTokens = (tally, ps, size, n = 1) => {
  const { family, weight } = parseFont(ps);
  if (family) tally.add('fonts', family, n); if (size) tally.add('fontSizes', `${r1(size)}px`, n); if (ps) tally.add('fontWeights', String(weight), n);
};
function uniqueId(used, s) {
  let id = slug(s), n = 2; while (used.has(id)) id = `${slug(s)}-${n++}`;
  used.add(id); return id;
}

// sk: what one import shares — the token tally, colour names (from swatches and colour assets, used as token
// labels), symbol masters, and where schematics go.
function nameColor(names, name, c) {
  const v = col(c);
  if (v && name) (names.get(v) || names.set(v, new Set()).get(v)).add(name);
  return v;
}
function addColor({ tally, names }, v, n = 1, kind) {
  if (!v) return;
  const put = (label, k) => kind ? tally.use(kind, v, k, label) : tally.add('colors', v, k, label);
  if (names.has(v)) [...names.get(v)].forEach((l, i) => put(l, i ? 0 : n)); else put(undefined, n);
}
function textStyleTokens(sk, ts) {
  const enc = encoded(ts.value), fa = fontAttr(enc), { family, weight } = parseFont(fa.name);
  fontTokens(sk.tally, fa.name, fa.size); addColor(sk, col(enc.MSAttributedStringColorAttribute), 1, 'text');
  if (fa.size || family) sk.tally.cssVar(`--text-${slug(ts.name)}`, [fa.size ? `${r1(fa.size)}px` : null, family, fa.name ? weight : null].filter(Boolean).join(' '));
}
// Swatches, colour assets, colours and text styles declared in the document.
const nameSwatch = (sk, s) => { const v = nameColor(sk.names, s.name, s.value); if (v) sk.tally.cssVar(`--${slug(s.name)}`, v); };
function documentColors(sk, doc) {
  const swatches = doc.sharedSwatches?.objects || [], assets = doc.assets?.colorAssets || [];
  swatches.forEach(s => nameSwatch(sk, s)); assets.forEach(a => nameColor(sk.names, a.name, a.color));
  // all names are known before any colour is counted, so each count carries its label
  for (const c of [...swatches.map(s => s.value), ...assets.map(a => a.color), ...(doc.assets?.colors || [])]) addColor(sk, col(c));
}
function documentTokens(sk, doc) {
  documentColors(sk, doc);
  for (const ts of doc.layerTextStyles?.objects || []) textStyleTokens(sk, ts);
}
// Symbol masters (local and foreign) by symbolID, for instance names and schematic drawing.
function findMasters(layers, masters) {
  for (const l of layers || []) { if (l._class === 'symbolMaster') masters.set(l.symbolID, l); if (l.layers) findMasters(l.layers, masters); }
}
function symbolMasters(pages, doc) {
  const masters = new Map();
  for (const p of pages) findMasters(p.layers, masters);
  for (const f of doc.foreignSymbols || []) if (f.symbolMaster && !masters.has(f.symbolMaster.symbolID)) masters.set(f.symbolMaster.symbolID, f.symbolMaster);
  return masters;
}

// Drawing one board: c = { sk, d, record, depth }, d = { svg, elements, inventory }. A layer tree is drawn and,
// unless inside a symbol instance (record false), recorded; depth counts nested symbol instances; ox/oy = absolute
// offset of the parent.
function addElement(d, l, role, box, extra) {
  d.inventory[role] = (d.inventory[role] || 0) + 1;
  d.elements.push({ role, tag: l._class, bbox: box, color: null, bg: null, fontSize: null, weight: null, radius: null, font: null, ...extra });
}
function shadowTokens(sk, shadows, inset) {
  for (const s of shadows || []) if (s.isEnabled !== false) { sk.tally.add('shadows', shadowCss(s, inset)); addColor(sk, col(s.color)); }
}
// a gradient counts every stop, a plain fill its colour
const fillTokens = (sk, fl) => (fl.fillType === 1 ? (fl.gradient?.stops || []).map(s => col(s.color)) : [fillColor(fl)]).forEach(c => addColor(sk, c, 1, 'background'));
function styleTokens(sk, l) {
  for (const fl of fills(l)) fillTokens(sk, fl);
  for (const bo of l.style?.borders || []) if (bo.isEnabled !== false) addColor(sk, col(bo.color), 1, 'border');
  shadowTokens(sk, l.style?.shadows); shadowTokens(sk, l.style?.innerShadows, true);
}
// every run's font and colour is a token, not just the first run's
function runTokens(sk, runs) {
  for (const run of runs) { const fa = fontAttr(run); fontTokens(sk.tally, fa.name, fa.size); addColor(sk, col(run.MSAttributedStringColorAttribute), 1, 'text'); }
}
// the first line only: a schematic shows where text sits, not the copy
const firstLine = l => String(l.attributedString?.string ?? '').split(/\r?\n|\u2028/)[0];
function drawText({ sk, d, record }, l, g) {
  const t = textInfo(l), size = t.size || 12, { family, weight } = parseFont(t.name);
  if (record) {
    runTokens(sk, t.runs);
    addElement(d, l, 'text', g.box, { color: t.color, fontSize: t.size ? `${r1(t.size)}px` : null, weight: t.name ? String(weight) : null, font: family, _size: size });
  }
  const line = firstLine(l), face = family ? `'${family}', sans-serif` : 'sans-serif';
  if (line) d.svg.push(`<text x="${g.x}" y="${r1(g.y + size)}" font-family="${esc(face)}" font-size="${r1(size)}"${t.name ? ` font-weight="${weight}"` : ''} fill="${t.color || '#000000'}"${g.alpha}>${esc(line)}</text>`);
}
function drawSymbol(c, l, g) {
  const m = c.sk.masters.get(l.symbolID);
  if (c.record) addElement(c.d, l, 'component', g.box, { name: m?.name || null, bg: g.fill }); // the symbol's design-system name, not layer content
  // a master's layers are drawn but not recorded; the depth cap stops self-referencing symbols
  if (m && c.depth < 8) { c.d.svg.push(`<g${g.alpha}>`); walkLayers({ ...c, record: false, depth: c.depth + 1 }, m.layers, g.x, g.y); c.d.svg.push('</g>'); }
  else c.d.svg.push(`<rect x="${g.x}" y="${g.y}" width="${g.w}" height="${g.h}" fill="none" stroke="#999999" stroke-dasharray="4 3"/>`);
}
function drawBitmap({ d, record }, l, g) {
  if (record) addElement(d, l, 'image', g.box);
  d.svg.push(`<rect x="${g.x}" y="${g.y}" width="${g.w}" height="${g.h}" fill="#cccccc" stroke="#999999"${g.alpha}/>`);
}
// a shape group with layers is drawn as one shape only when it has a fill of its own
const isDrawnShape = (l, fill) => SHAPES.has(l._class) && (l._class !== 'shapeGroup' || !l.layers?.length || fill);
function drawShape({ sk, d, record }, l, g) {
  const rad = radiusOf(l), { x, y, w, h } = g;
  if (record && rad) sk.tally.add('radii', `${r1(rad)}px`);
  if (record && g.fill) addElement(d, l, 'shape', g.box, { bg: g.fill, color: g.bc, radius: rad ? `${r1(rad)}px` : null });
  const paint = ` fill="${g.fill || 'none'}"${g.stroke}${g.alpha}`;
  d.svg.push(l._class === 'oval' ? `<ellipse cx="${r1(x + w / 2)}" cy="${r1(y + h / 2)}" rx="${r1(w / 2)}" ry="${r1(h / 2)}"${paint}/>`
    : `<rect x="${x}" y="${y}" width="${w}" height="${h}"${rad ? ` rx="${r1(Math.min(rad, w / 2, h / 2))}"` : ''}${paint}/>`);
}
// a layer's absolute position and box, fill, border colour, and its stroke/opacity SVG attributes
const alphaAttr = l => { const op = l.style?.contextSettings?.opacity; return op != null && op < 1 ? ` opacity="${r1(op)}"` : ''; };
function geometry(l, ox, oy) {
  const f = l.frame || {}, x = r1(ox + (f.x || 0)), y = r1(oy + (f.y || 0)), w = r1(f.width), h = r1(f.height);
  const b = border(l), bc = b ? col(b.color) : null;
  return { x, y, w, h, box: { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) }, fill: firstFill(l), bc,
    stroke: bc ? ` stroke="${bc}" stroke-width="${r1(b.thickness ?? 1)}"` : '', alpha: alphaAttr(l) };
}
const DRAW = new Map([['text', drawText], ['symbolInstance', drawSymbol], ['bitmap', drawBitmap]]);
// a filled shape group was already drawn as one shape (isDrawnShape), so its layers are not drawn again
const drawsChildren = (l, fill) => GROUPS.has(l._class) && l.layers && !(l._class === 'shapeGroup' && fill);
function drawLayer(c, l, ox, oy) {
  const g = geometry(l, ox, oy);
  if (c.record) styleTokens(c.sk, l);
  const draw = DRAW.get(l._class) || (isDrawnShape(l, g.fill) ? drawShape : null);
  if (draw) draw(c, l, g);
  if (drawsChildren(l, g.fill)) { c.d.svg.push(`<g${g.alpha}>`); walkLayers(c, l.layers, g.x, g.y); c.d.svg.push('</g>'); }
}
function walkLayers(c, layers, ox, oy) {
  for (const l of layers || []) if (l.isVisible !== false) drawLayer(c, l, ox, oy);
}
// text at least 1.4x the board's median text size is a heading
function promoteHeadings({ elements, inventory }) {
  const sized = elements.filter(e => e._size), med = median(sized.map(e => e._size));
  for (const e of sized) {
    if (med && e._size >= 1.4 * med) { e.role = 'heading'; inventory.text--; inventory.heading = (inventory.heading || 0) + 1; }
    delete e._size;
  }
  if (inventory.text === 0) delete inventory.text;
}

const schematic = (W, H, bg, svg) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`
  + `<rect width="${W}" height="${H}" fill="${bg || '#ffffff'}"/>${svg.join('')}</svg>\n`;
const isBoard = l => (l._class === 'artboard' || l._class === 'symbolMaster') && l.isVisible !== false;
function boardScreen(sk, page, board, used) {
  const W = Math.round(board.frame?.width || 0), H = Math.round(board.frame?.height || 0), d = { svg: [], elements: [], inventory: {} };
  const bg = board.hasBackgroundColor ? col(board.backgroundColor) : null;
  if (bg) { addColor(sk, bg, 1, 'background'); d.svg.push(`<rect width="${W}" height="${H}" fill="${bg}"/>`); }
  walkLayers({ sk, d, record: true, depth: 0 }, board.layers, 0, 0);
  promoteHeadings(d);
  const id = uniqueId(used, board.name), master = board._class === 'symbolMaster';
  // the schematic draws the file's text, so it is only written when screenshots are opted into
  if (sk.screenshots) writeFileSync(path.join(sk.shots, `${id}.svg`), schematic(W, H, bg, d.svg));
  return { id, url: `${page.name} › ${board.name}`, title: board.name, purpose: master ? 'Symbol master' : 'Artboard',
    screenshot: sk.screenshots ? `screens/${id}.svg` : null, width: W, height: H, inventory: d.inventory, elements: d.elements };
}
function previewScreen(sk, preview, used) {
  writeFileSync(path.join(sk.shots, 'preview.png'), preview); used.add('preview');
  const sz = pngSize(preview) || {};
  return { id: 'preview', url: 'Document preview', title: 'Document preview', purpose: 'Sketch document preview image', screenshot: 'screens/preview.png',
    width: sz.width || null, height: sz.height || null, inventory: {}, elements: [] };
}

// Pages in the document's order; without refs, every pages/<id>.json in zip order. Missing pages are skipped.
function readPages(files, doc, json) {
  const refs = (doc.pages || []).map(p => p._ref).filter(Boolean);
  return (refs.length ? refs.map(r => `${r}.json`) : [...files.keys()].filter(k => /^pages\/[^/]+\.json$/.test(k))).map(json).filter(Boolean);
}
function sketchNotes(meta, pages, screens, screenshots) {
  const count = purpose => screens.filter(s => s.purpose === purpose).length;
  return [`Sketch ${meta.appVersion || 'unknown version'}: ${pages.length} page(s), ${count('Artboard')} artboard(s), ${count('Symbol master')} symbol master(s).`,
    ...(screenshots ? ['Screens are schematic SVGs drawn from the layer tree (boxes, ovals, first text line, grey bitmaps), not renders.'] : [])];
}

export async function importSketch({ source, outDir, screenshots = false }) {
  const files = readZip(source);
  const json = name => { const b = files.get(name); return b ? JSON.parse(b.toString('utf8')) : null; };
  const doc = json('document.json');
  if (!doc) throw new Error(`No document.json in ${path.basename(source)} — is this a .sketch file?`);
  const meta = json('meta.json') || {}, pages = readPages(files, doc, json);
  const sk = { tally: tokenTally(), names: new Map(), masters: null, screenshots, shots: prepareOut(outDir, { screenshots }) };

  documentTokens(sk, doc);
  sk.masters = symbolMasters(pages, doc);
  const used = new Set(), screens = [], preview = files.get('previews/preview.png');
  if (preview && screenshots) screens.push(previewScreen(sk, preview, used));
  for (const page of pages) for (const board of (page.layers || []).filter(isBoard)) screens.push(boardScreen(sk, page, board, used));

  const first = screens.find(s => s.id !== 'preview'), notes = sketchNotes(meta, pages, screens, screenshots);
  return writeAtlas(outDir, {
    project: { name: path.basename(source, path.extname(source)), kind: 'sketch', source: path.basename(source),
      viewport: first ? { width: first.width, height: first.height } : null, notes },
    tokens: sk.tally.finalize(), screens,
  }, { screenshots });
}
