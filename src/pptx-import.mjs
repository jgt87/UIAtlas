// PowerPoint adapter: reads a .pptx/.potx/.pptm directly (it's a zip of XML) — no other tools needed. Theme colours
// (with their slot names) and fonts, each master's colour map and text styles, and every layout's background,
// placeholders (resolved through layout -> master -> master text styles), shapes (fill, border, rounded corners,
// shadows) and pictures. Slides only add styling counts (run colours, sizes, fonts); their text is never read —
// the XML parser skips text nodes altogether. Layouts become screens; .pptx files hold no renders, so no previews.
import path from 'node:path';
import { readZip } from './zip.mjs';
import { parseXml, kid, kids, path as at, desc, descs, rels, color } from './ooxml.mjs';
import { tokenTally, prepareOut, writeAtlas, contrastReport, slug } from './atlas-util.mjs';

const EMU_PX = 9525; // 914400 EMU per inch / 96 px per inch
const SLOTS = ['dk1', 'lt1', 'dk2', 'lt2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink'];
const SLOT_NAME = { dk1: 'dark 1', lt1: 'light 1', dk2: 'dark 2', lt2: 'light 2', hlink: 'hyperlink', folHlink: 'followed hyperlink' };
const LAYOUT_NAME = { title: 'Title Slide', obj: 'Title and Content', secHead: 'Section Header', twoObj: 'Two Content', twoTxTwoObj: 'Comparison', titleOnly: 'Title Only',
  blank: 'Blank', objTx: 'Content with Caption', picTx: 'Picture with Caption', vertTx: 'Title and Vertical Text', vertTitleAndTx: 'Vertical Title and Text', cust: 'Custom' };
const TITLE_TYPES = new Set(['title', 'ctrTitle']), BODY_TYPES = new Set(['body', 'obj', 'subTitle', undefined]);
const px = v => Math.round((+v || 0) / EMU_PX);
const inches = v => Math.round(v / 96 * 1000) / 1000;
const ratio = v => String(Math.round(v * 100) / 100);
const slotName = s => SLOT_NAME[s] || s.replace(/(\d)$/, ' $1');
const slotLabel = c => c?.slot ? `${c.slot} · ${slotName(c.slot)}` : undefined;
const isPlaceholder = sp => at(sp, 'p:nvSpPr', 'p:nvPr', 'p:ph');
const isLarge = (size, bold) => size * 4 / 3 >= 24 || (bold && size * 4 / 3 >= 18.66);
const merge = (...layers) => Object.assign({}, ...layers.reverse()); // first argument wins
const num = p => +(/(\d+)\.xml$/.exec(p)?.[1] || 0);

// The open file plus everything shared while reading it: parsed themes and masters (keyed by part path), the token
// tally, contrast pairs and notes.
function openDeck(source) {
  const files = readZip(source);
  const xml = p => { const b = files.get(p); return b ? parseXml(b.toString('utf8')) : null; };
  return { files, xml, themes: new Map(), masters: new Map(), tally: tokenTally(), pairs: [], notes: [] };
}

// themes and masters
function readTheme(t) {
  const clr = {}, scheme = desc(t, 'a:clrScheme');
  for (const s of SLOTS) { const c = color(kid(scheme, `a:${s}`), {}); if (c) clr[s] = c.hex.slice(1, 7); }
  const font = k => at(desc(t, 'a:fontScheme'), k, 'a:latin')?.attrs.typeface || null;
  return { clr, major: font('a:majorFont'), minor: font('a:minorFont') };
}
function themeOf(deck, p) {
  if (!deck.themes.has(p)) deck.themes.set(p, readTheme(deck.xml(p)));
  return deck.themes.get(p);
}
function masterOf(deck, p) {
  if (deck.masters.has(p)) return deck.masters.get(p);
  const m = deck.xml(p), theme = themeOf(deck, rels(deck.files, p).byType('theme')[0] || 'ppt/theme/theme1.xml');
  const clrMap = { ...(desc(m, 'p:clrMap')?.attrs || {}) }, ctx = { theme: theme.clr, clrMap };
  const txStyle = k => at(m, 'p:sldMaster', 'p:txStyles', k);
  const styles = { title: txStyle('p:titleStyle'), body: txStyle('p:bodyStyle'), other: txStyle('p:otherStyle') };
  const rec = { tree: m, theme, ctx, styles, phs: placeholders(m), bg: background(m, ctx) };
  deck.masters.set(p, rec); return rec;
}
function placeholders(tree) {
  return descs(tree, 'p:sp').map(sp => ({ sp, ph: isPlaceholder(sp) })).filter(x => x.ph);
}
function background(tree, ctx) {
  const bg = desc(tree, 'p:bg'); if (!bg) return null;
  const pr = kid(bg, 'p:bgPr'), ref = kid(bg, 'p:bgRef');
  const solid = color(kid(pr, 'a:solidFill'), ctx) || (ref && color(ref, ctx));
  const stops = descs(kid(pr, 'a:gradFill'), 'a:gs').map(g => color(g, ctx)).filter(Boolean);
  return solid ? { type: 'solid', color: solid } : stops.length ? { type: 'gradient', stops } : kid(pr, 'a:blipFill') ? { type: 'image' } : null;
}

// text properties from a list-style level (lvl1pPr) or run properties: size, bold, colour, font, spacing, line height
const themeFont = (face, theme) => face === '+mj-lt' ? theme.major : face === '+mn-lt' ? theme.minor : face;
function textProps(pPr, rPr, ctx, theme) {
  const r = rPr || kid(pPr, 'a:defRPr'); if (!pPr && !r) return {};
  const a = r?.attrs || {}, face = kid(r, 'a:latin')?.attrs.typeface, fill = kid(r, 'a:solidFill'), ln = at(pPr, 'a:lnSpc', 'a:spcPct');
  return { ...(a.sz ? { size: +a.sz / 100 } : {}), ...(a.b != null ? { bold: a.b === '1' || a.b === 'true' } : {}),
    ...(fill ? { color: color(fill, ctx) } : {}), ...(face ? { font: themeFont(face, theme) } : {}),
    ...(a.spc != null ? { spc: +a.spc / 100 } : {}), ...(ln ? { lineHeight: +ln.attrs.val / 100000 } : {}) };
}
function styleOf(sp, ctx, theme) {
  const tx = kid(sp, 'p:txBody'), lvl1 = at(tx, 'a:lstStyle', 'a:lvl1pPr'), p = kid(tx, 'a:p');
  return merge(textProps(at(p, 'a:pPr'), at(p, 'a:r', 'a:rPr'), ctx, theme), textProps(lvl1, null, ctx, theme));
}

// tokens counted into the tally
const useColor = (tally, kind, c, n = 1) => c && tally.use(kind, c.hex, n, slotLabel(c));
function textTokens(tally, st, n = 1) {
  if (st.font) tally.add('fonts', st.font, n);
  if (st.size) { tally.add('fontSizes', `${st.size}pt`, n); tally.add('fontWeights', st.bold ? '700' : '400', n); }
  if (st.lineHeight) tally.add('lineHeights', ratio(st.lineHeight), n);
  if (st.spc != null) tally.add('letterSpacings', `${st.spc}pt`, n);
  useColor(tally, 'text', st.color, n);
}
// rounded corners: roundRect adj = radius as a share of the shorter side
function roundRadius(spPr) {
  const ext = at(spPr, 'a:xfrm', 'a:ext'), geom = kid(spPr, 'a:prstGeom');
  if (geom?.attrs.prst !== 'roundRect' || !ext) return null;
  const adj = +(desc(geom, 'a:gd')?.attrs.fmla || 'val 16667').replace(/\D/g, '') || 16667;
  return Math.round(Math.min(px(ext.attrs.cx), px(ext.attrs.cy)) * adj / 100000);
}
function outerShadow(spPr, ctx) {
  const sh = at(spPr, 'a:effectLst', 'a:outerShdw'); if (!sh) return null;
  const d = px(sh.attrs.dist), dir = (+sh.attrs.dir || 0) / 60000 * Math.PI / 180, c = color(sh, ctx);
  return `${Math.round(Math.cos(dir) * d)}px ${Math.round(Math.sin(dir) * d)}px ${px(sh.attrs.blurRad)}px 0px ${c?.hex || '#00000040'}`;
}
// shapes: fill, outline, rounded corners, outer shadow
function shapeTokens(tally, sp, ctx) {
  const spPr = kid(sp, 'p:spPr'); if (!spPr) return {};
  const fill = color(kid(spPr, 'a:solidFill'), ctx), ln = kid(spPr, 'a:ln'), border = ln && !kid(ln, 'a:noFill') ? color(kid(ln, 'a:solidFill'), ctx) : null;
  const radius = roundRadius(spPr), shadow = outerShadow(spPr, ctx);
  if (fill) useColor(tally, 'fill', fill); if (border) useColor(tally, 'border', border);
  if (radius) tally.add('radii', `${radius}px`); if (shadow) tally.add('shadows', shadow);
  return { fill, border, radius };
}
function box(sp, fallback) {
  const x = at(sp, 'p:spPr', 'a:xfrm') || at(sp, 'p:grpSpPr', 'a:xfrm') || at(sp, 'p:xfrm') || (fallback && at(fallback, 'p:spPr', 'a:xfrm'));
  const off = kid(x, 'a:off'), ext = kid(x, 'a:ext');
  return off && ext ? { x: px(off.attrs.x), y: px(off.attrs.y), w: px(ext.attrs.cx), h: px(ext.attrs.cy) } : { x: 0, y: 0, w: 0, h: 0 };
}

// layouts: placeholders inherit from the master's matching placeholder, then the master's text style for their kind
function masterPlaceholder(master, ph) {
  const type = ph.attrs.type;
  return master.phs.find(({ ph: m }) => m.attrs.type === type || (TITLE_TYPES.has(type) && m.attrs.type === 'title')
    || (BODY_TYPES.has(type) && (m.attrs.type === 'body' || (!m.attrs.type && m.attrs.idx === ph.attrs.idx))));
}
const baseStyle = (master, type) => TITLE_TYPES.has(type) ? master.styles.title : BODY_TYPES.has(type) ? master.styles.body : master.styles.other;
function addElement(scr, el) { scr.inventory[el.role] = (scr.inventory[el.role] || 0) + 1; scr.elements.push(el); }
function addPlaceholder(deck, scr, { sp, ph }) {
  const { master } = scr, { ctx, theme } = master, type = ph.attrs.type, mph = masterPlaceholder(master, ph);
  const st = merge(styleOf(sp, ctx, theme), mph ? styleOf(mph.sp, ctx, theme) : {}, textProps(kid(baseStyle(master, type), 'a:lvl1pPr'), null, ctx, theme));
  if (!st.font) st.font = TITLE_TYPES.has(type) ? theme.major : theme.minor;
  textTokens(deck.tally, st); shapeTokens(deck.tally, sp, ctx);
  if (st.color && scr.behind && st.size) deck.pairs.push({ fg: st.color.hex.slice(0, 7), bg: scr.behind, large: isLarge(st.size, st.bold), count: 1 });
  addElement(scr, { role: type || 'obj', tag: 'placeholder', bbox: box(sp, mph?.sp), color: st.color?.hex || null, bg: null,
    fontSize: st.size ? `${st.size}pt` : null, weight: st.size ? (st.bold ? '700' : '400') : null, radius: null, font: st.font || null,
    ...(st.lineHeight ? { lineHeight: ratio(st.lineHeight) } : {}) });
}
function addShape(deck, scr, sp) {
  if (isPlaceholder(sp)) return;
  const { ctx, theme } = scr.master, s = shapeTokens(deck.tally, sp, ctx), st = styleOf(sp, ctx, theme);
  if (st.size || st.color) textTokens(deck.tally, st);
  if (!s.fill && !s.border) return;
  addElement(scr, { role: 'shape', tag: at(sp, 'p:spPr', 'a:prstGeom')?.attrs.prst || 'shape', bbox: box(sp),
    color: s.border?.hex || null, bg: s.fill?.hex || null, fontSize: null, weight: null, radius: s.radius ? `${s.radius}px` : null });
}
function uniqueId(ids, title) {
  let id = slug(title), n = 2; while (ids.has(id)) id = `${slug(title)}-${n++}`;
  ids.add(id); return id;
}
function layoutScreen(deck, part, ids, { W, H }) {
  const tree = deck.xml(part), master = masterOf(deck, rels(deck.files, part).byType('slideMaster')[0] || 'ppt/slideMasters/slideMaster1.xml');
  const lay = kid(tree, 'p:sldLayout'), title = desc(tree, 'p:cSld')?.attrs.name || `Layout ${num(part)}`;
  const bg = background(tree, master.ctx) || master.bg;
  if (bg?.type === 'solid') useColor(deck.tally, 'background', bg.color);
  for (const s of bg?.stops || []) useColor(deck.tally, 'background', s);
  // gradients and pictures: no single backdrop to rate
  const scr = { master, behind: bg?.type === 'solid' ? bg.color.hex.slice(0, 7) : null, elements: [], inventory: {} };
  for (const p of placeholders(tree)) addPlaceholder(deck, scr, p);
  for (const sp of descs(at(tree, 'p:sldLayout', 'p:cSld', 'p:spTree'), 'p:sp')) addShape(deck, scr, sp);
  for (const pic of descs(tree, 'p:pic')) addElement(scr, { role: 'image', tag: 'picture', bbox: box(pic), color: null, bg: null, fontSize: null, weight: null, radius: null });
  const id = uniqueId(ids, title);
  return { id, url: title, title, purpose: LAYOUT_NAME[lay?.attrs.type] || lay?.attrs.type || null, screenshot: null, width: W, height: H, inventory: scr.inventory, elements: scr.elements };
}
// layouts, in their own numeric order
const layoutParts = files => [...files.keys()].filter(k => /^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(k)).sort((a, b) => num(a) - num(b));

// masters' own decoration and text styles count too
function masterTokens(deck) {
  for (const [, m] of deck.masters) {
    for (const sp of descs(at(m.tree, 'p:sldMaster', 'p:cSld', 'p:spTree'), 'p:sp')) if (!isPlaceholder(sp)) shapeTokens(deck.tally, sp, m.ctx);
    for (const k of ['title', 'body', 'other']) for (const lvl of (m.styles[k]?.children || []).slice(0, 3)) masterLevelTokens(deck.tally, m, k, lvl);
  }
}
function masterLevelTokens(tally, m, k, lvl) {
  const st = textProps(lvl, null, m.ctx, m.theme);
  if (!st.font && st.size) st.font = k === 'title' ? m.theme.major : m.theme.minor;
  textTokens(tally, st);
}

// slides: only the styling they apply (no text, no slide list — slides are content). Returns the slide count.
function slideMaster(deck, part) {
  const layout = rels(deck.files, part).byType('slideLayout')[0], masterPart = layout && rels(deck.files, layout).byType('slideMaster')[0];
  return masterPart ? masterOf(deck, masterPart) : [...deck.masters.values()][0];
}
function slideTokens(deck) {
  const slideParts = [...deck.files.keys()].filter(k => /^ppt\/slides\/slide\d+\.xml$/.test(k));
  for (const part of slideParts) {
    const m = slideMaster(deck, part); if (!m) continue;
    const tree = deck.xml(part), sbg = background(tree, m.ctx);
    if (sbg?.type === 'solid') useColor(deck.tally, 'background', sbg.color);
    for (const sp of descs(tree, 'p:sp')) { shapeTokens(deck.tally, sp, m.ctx); runTokens(deck.tally, sp, m); }
  }
  return slideParts.length;
}
function runTokens(tally, sp, m) {
  for (const r of [...descs(sp, 'a:rPr'), ...descs(sp, 'a:endParaRPr')]) {
    const st = textProps(null, r, m.ctx, m.theme);
    if (st.size || st.color || st.font) textTokens(tally, st);
  }
}

// declared theme: slot colours (every slot listed, used or not), fonts, slide size
function declaredTokens(deck, W, H) {
  const { tally } = deck, first = [...deck.masters.values()][0]?.theme || themeOf(deck, 'ppt/theme/theme1.xml');
  for (const s of SLOTS) if (first.clr[s]) { tally.cssVar(`--${s}`, `#${first.clr[s]}`); tally.add('colors', `#${first.clr[s]}`, 0, `${s} · ${slotName(s)}`); }
  if (first.major) { tally.cssVar('--font-heading', first.major); tally.add('fonts', first.major, 0); }
  if (first.minor) { tally.cssVar('--font-body', first.minor); tally.add('fonts', first.minor, 0); }
  tally.cssVar('--slide-width', `${inches(W)}in`); tally.cssVar('--slide-height', `${inches(H)}in`);
}

export async function importPptx({ source, outDir }) {
  const deck = openDeck(source), name = path.basename(source);
  const pres = deck.xml('ppt/presentation.xml');
  if (!pres) throw new Error(`${name} has no ppt/presentation.xml — is it a PowerPoint file?`);
  const sz = desc(pres, 'p:sldSz'), W = px(sz?.attrs.cx || 12192000), H = px(sz?.attrs.cy || 6858000);

  const ids = new Set(), screens = layoutParts(deck.files).map(part => layoutScreen(deck, part, ids, { W, H }));
  masterTokens(deck);
  const slides = slideTokens(deck), { notes } = deck;
  if (slides) notes.push(`Styling from ${slides} slide(s) is included in the counts; slide text is never read.`);
  notes.push('PowerPoint files contain no rendered previews: layouts are listed by name with their placeholders and shapes.');
  if (deck.masters.size > 1) notes.push(`${deck.masters.size} slide masters (each with its own theme mapping).`);
  declaredTokens(deck, W, H);

  prepareOut(outDir);
  return writeAtlas(outDir, { project: { name: path.basename(name, path.extname(name)), kind: 'pptx', source: name, viewport: { width: W, height: H },
    units: { ppi: 96, slideInches: { width: inches(W), height: inches(H) } }, notes },
    tokens: deck.tally.finalize(), contrast: contrastReport(deck.pairs), screens });
}
