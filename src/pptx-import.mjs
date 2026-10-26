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

export async function importPptx({ source, outDir }) {
  const files = readZip(source), name = path.basename(source);
  const xml = p => { const b = files.get(p); return b ? parseXml(b.toString('utf8')) : null; };
  const pres = xml('ppt/presentation.xml');
  if (!pres) throw new Error(`${name} has no ppt/presentation.xml — is it a PowerPoint file?`);
  const sz = desc(pres, 'p:sldSz'), W = px(sz?.attrs.cx || 12192000), H = px(sz?.attrs.cy || 6858000);
  const tally = tokenTally(), pairs = [], notes = [];

  // themes and masters, keyed by part path
  const themes = new Map(), themeOf = p => { if (!themes.has(p)) { const t = xml(p), clr = {}, scheme = desc(t, 'a:clrScheme');
    for (const s of SLOTS) { const c = color(kid(scheme, `a:${s}`), {}); if (c) clr[s] = c.hex.slice(1, 7); }
    const font = k => at(desc(t, 'a:fontScheme'), k, 'a:latin')?.attrs.typeface || null;
    themes.set(p, { clr, major: font('a:majorFont'), minor: font('a:minorFont') }); } return themes.get(p); };
  const masters = new Map(), masterOf = p => { if (masters.has(p)) return masters.get(p);
    const m = xml(p), theme = themeOf(rels(files, p).byType('theme')[0] || 'ppt/theme/theme1.xml');
    const clrMap = { ...(desc(m, 'p:clrMap')?.attrs || {}) }, ctx = { theme: theme.clr, clrMap };
    const styles = { title: at(m, 'p:sldMaster', 'p:txStyles', 'p:titleStyle'), body: at(m, 'p:sldMaster', 'p:txStyles', 'p:bodyStyle'), other: at(m, 'p:sldMaster', 'p:txStyles', 'p:otherStyle') };
    const rec = { tree: m, theme, ctx, styles, phs: placeholders(m), bg: background(m, ctx) };
    masters.set(p, rec); return rec; };

  // text properties from a list-style level (lvl1pPr) or run properties: size, bold, colour, font, spacing, line height
  const textProps = (pPr, rPr, ctx, theme) => { const r = rPr || kid(pPr, 'a:defRPr'); if (!pPr && !r) return {};
    const face = kid(r, 'a:latin')?.attrs.typeface, fill = kid(r, 'a:solidFill'), ln = at(pPr, 'a:lnSpc', 'a:spcPct');
    return { ...(r?.attrs.sz ? { size: +r.attrs.sz / 100 } : {}), ...(r?.attrs.b != null ? { bold: r.attrs.b === '1' || r.attrs.b === 'true' } : {}),
      ...(fill ? { color: color(fill, ctx) } : {}), ...(face ? { font: face === '+mj-lt' ? theme.major : face === '+mn-lt' ? theme.minor : face } : {}),
      ...(r?.attrs.spc != null ? { spc: +r.attrs.spc / 100 } : {}), ...(ln ? { lineHeight: +ln.attrs.val / 100000 } : {}) }; };
  const merge = (...layers) => Object.assign({}, ...layers.reverse()); // first argument wins
  const styleOf = (sp, ctx, theme) => { const tx = kid(sp, 'p:txBody'), lvl1 = at(tx, 'a:lstStyle', 'a:lvl1pPr'), p = kid(tx, 'a:p');
    return merge(textProps(at(p, 'a:pPr'), at(p, 'a:r', 'a:rPr'), ctx, theme), textProps(lvl1, null, ctx, theme)); };
  function placeholders(tree) {
    return descs(tree, 'p:sp').map(sp => ({ sp, ph: at(sp, 'p:nvSpPr', 'p:nvPr', 'p:ph') })).filter(x => x.ph);
  }
  function background(tree, ctx) {
    const bg = desc(tree, 'p:bg'); if (!bg) return null;
    const pr = kid(bg, 'p:bgPr'), ref = kid(bg, 'p:bgRef');
    const solid = color(kid(pr, 'a:solidFill'), ctx) || (ref && color(ref, ctx));
    const stops = descs(kid(pr, 'a:gradFill'), 'a:gs').map(g => color(g, ctx)).filter(Boolean);
    return solid ? { type: 'solid', color: solid } : stops.length ? { type: 'gradient', stops } : kid(pr, 'a:blipFill') ? { type: 'image' } : null;
  }
  const label = c => c?.slot ? `${c.slot} · ${SLOT_NAME[c.slot] || c.slot.replace(/(\d)$/, ' $1')}` : undefined;
  const useColor = (kind, c, n = 1) => c && tally.use(kind, c.hex, n, label(c));
  const textTokens = (st, n = 1) => { if (st.font) tally.add('fonts', st.font, n); if (st.size) tally.add('fontSizes', `${st.size}pt`, n);
    if (st.size) tally.add('fontWeights', st.bold ? '700' : '400', n); if (st.lineHeight) tally.add('lineHeights', String(Math.round(st.lineHeight * 100) / 100), n);
    if (st.spc != null) tally.add('letterSpacings', `${st.spc}pt`, n); useColor('text', st.color, n); };
  // shapes: fill, outline, rounded corners (roundRect adj = radius as a share of the shorter side), outer shadow
  const shapeTokens = (sp, ctx) => { const spPr = kid(sp, 'p:spPr'); if (!spPr) return {};
    const fill = color(kid(spPr, 'a:solidFill'), ctx), ln = kid(spPr, 'a:ln'), border = ln && !kid(ln, 'a:noFill') ? color(kid(ln, 'a:solidFill'), ctx) : null;
    const ext = at(spPr, 'a:xfrm', 'a:ext'), geom = kid(spPr, 'a:prstGeom'); let radius = null;
    if (geom?.attrs.prst === 'roundRect' && ext) { const adj = +(desc(geom, 'a:gd')?.attrs.fmla || 'val 16667').replace(/\D/g, '') || 16667; radius = Math.round(Math.min(px(ext.attrs.cx), px(ext.attrs.cy)) * adj / 100000); }
    const sh = at(spPr, 'a:effectLst', 'a:outerShdw'); let shadow = null;
    if (sh) { const d = px(sh.attrs.dist), dir = (+sh.attrs.dir || 0) / 60000 * Math.PI / 180, c = color(sh, ctx);
      shadow = `${Math.round(Math.cos(dir) * d)}px ${Math.round(Math.sin(dir) * d)}px ${px(sh.attrs.blurRad)}px 0px ${c?.hex || '#00000040'}`; }
    if (fill) useColor('fill', fill); if (border) useColor('border', border); if (radius) tally.add('radii', `${radius}px`); if (shadow) tally.add('shadows', shadow);
    return { fill, border, radius }; };
  const box = (sp, fallback) => { const x = at(sp, 'p:spPr', 'a:xfrm') || at(sp, 'p:grpSpPr', 'a:xfrm') || at(sp, 'p:xfrm') || (fallback && at(fallback, 'p:spPr', 'a:xfrm')), off = kid(x, 'a:off'), ext = kid(x, 'a:ext');
    return off && ext ? { x: px(off.attrs.x), y: px(off.attrs.y), w: px(ext.attrs.cx), h: px(ext.attrs.cy) } : null; };

  // layouts, in their own numeric order
  const num = p => +(/(\d+)\.xml$/.exec(p)?.[1] || 0);
  const layoutParts = [...files.keys()].filter(k => /^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(k)).sort((a, b) => num(a) - num(b));
  const ids = new Set();
  const screens = layoutParts.map(part => {
    const tree = xml(part), master = masterOf(rels(files, part).byType('slideMaster')[0] || 'ppt/slideMasters/slideMaster1.xml'), { ctx, theme } = master;
    const lay = kid(tree, 'p:sldLayout'), title = desc(tree, 'p:cSld')?.attrs.name || `Layout ${num(part)}`;
    const bg = background(tree, ctx) || master.bg;
    if (bg?.type === 'solid') useColor('background', bg.color); for (const s of bg?.stops || []) useColor('background', s);
    const behind = bg?.type === 'solid' ? bg.color.hex.slice(0, 7) : null; // gradients and pictures: no single backdrop to rate
    const elements = [], inventory = {}, bump = k => inventory[k] = (inventory[k] || 0) + 1;
    for (const { sp, ph } of placeholders(tree)) {
      const type = ph.attrs.type, mph = master.phs.find(m => m.ph.attrs.type === type || (TITLE_TYPES.has(type) && m.ph.attrs.type === 'title') || (BODY_TYPES.has(type) && (m.ph.attrs.type === 'body' || (!m.ph.attrs.type && m.ph.attrs.idx === ph.attrs.idx))));
      const base = TITLE_TYPES.has(type) ? master.styles.title : BODY_TYPES.has(type) ? master.styles.body : master.styles.other;
      const st = merge(styleOf(sp, ctx, theme), mph ? styleOf(mph.sp, ctx, theme) : {}, textProps(kid(base, 'a:lvl1pPr'), null, ctx, theme));
      if (!st.font) st.font = TITLE_TYPES.has(type) ? theme.major : theme.minor;
      textTokens(st); shapeTokens(sp, ctx);
      const role = type || 'obj'; bump(role);
      if (st.color && behind && st.size) pairs.push({ fg: st.color.hex.slice(0, 7), bg: behind, large: st.size * 4 / 3 >= 24 || (st.bold && st.size * 4 / 3 >= 18.66), count: 1 });
      elements.push({ role, tag: 'placeholder', bbox: box(sp, mph?.sp) || { x: 0, y: 0, w: 0, h: 0 }, color: st.color?.hex || null, bg: null,
        fontSize: st.size ? `${st.size}pt` : null, weight: st.size ? (st.bold ? '700' : '400') : null, radius: null, font: st.font || null,
        ...(st.lineHeight ? { lineHeight: String(Math.round(st.lineHeight * 100) / 100) } : {}) });
    }
    for (const sp of descs(at(tree, 'p:sldLayout', 'p:cSld', 'p:spTree'), 'p:sp')) {
      if (at(sp, 'p:nvSpPr', 'p:nvPr', 'p:ph')) continue;
      const s = shapeTokens(sp, ctx), st = styleOf(sp, ctx, theme); if (st.size || st.color) textTokens(st);
      if (s.fill || s.border) { bump('shape'); elements.push({ role: 'shape', tag: at(sp, 'p:spPr', 'a:prstGeom')?.attrs.prst || 'shape', bbox: box(sp) || { x: 0, y: 0, w: 0, h: 0 },
        color: s.border?.hex || null, bg: s.fill?.hex || null, fontSize: null, weight: null, radius: s.radius ? `${s.radius}px` : null }); }
    }
    for (const pic of descs(tree, 'p:pic')) { bump('image'); elements.push({ role: 'image', tag: 'picture', bbox: box(pic) || { x: 0, y: 0, w: 0, h: 0 }, color: null, bg: null, fontSize: null, weight: null, radius: null }); }
    let id = slug(title), n = 2; while (ids.has(id)) id = `${slug(title)}-${n++}`; ids.add(id);
    return { id, url: title, title, purpose: LAYOUT_NAME[lay?.attrs.type] || lay?.attrs.type || null, screenshot: null, width: W, height: H, inventory, elements };
  });

  // masters' own decoration and text styles count too
  for (const [, m] of masters) { for (const sp of descs(at(m.tree, 'p:sldMaster', 'p:cSld', 'p:spTree'), 'p:sp')) if (!at(sp, 'p:nvSpPr', 'p:nvPr', 'p:ph')) shapeTokens(sp, m.ctx);
    for (const k of ['title', 'body', 'other']) for (const lvl of (m.styles[k]?.children || []).slice(0, 3)) { const st = textProps(lvl, null, m.ctx, m.theme); if (!st.font && st.size) st.font = k === 'title' ? m.theme.major : m.theme.minor; textTokens(st); } }

  // slides: only the styling they apply (no text, no slide list — slides are content)
  const slideParts = [...files.keys()].filter(k => /^ppt\/slides\/slide\d+\.xml$/.test(k));
  for (const part of slideParts) {
    const layout = rels(files, part).byType('slideLayout')[0], masterPart = layout && rels(files, layout).byType('slideMaster')[0];
    const m = masterPart ? masterOf(masterPart) : [...masters.values()][0]; if (!m) continue;
    const tree = xml(part), sbg = background(tree, m.ctx); if (sbg?.type === 'solid') useColor('background', sbg.color);
    for (const sp of descs(tree, 'p:sp')) { shapeTokens(sp, m.ctx);
      for (const r of [...descs(sp, 'a:rPr'), ...descs(sp, 'a:endParaRPr')]) { const st = textProps(null, r, m.ctx, m.theme); if (st.size || st.color || st.font) textTokens(st); } }
  }
  if (slideParts.length) notes.push(`Styling from ${slideParts.length} slide(s) is included in the counts; slide text is never read.`);
  notes.push('PowerPoint files contain no rendered previews: layouts are listed by name with their placeholders and shapes.');
  if (masters.size > 1) notes.push(`${masters.size} slide masters (each with its own theme mapping).`);

  // declared theme: slot colours, fonts, slide size
  const first = [...masters.values()][0]?.theme || themeOf('ppt/theme/theme1.xml');
  for (const s of SLOTS) if (first.clr[s]) { tally.cssVar(`--${s}`, `#${first.clr[s]}`); tally.add('colors', `#${first.clr[s]}`, 0, `${s} · ${SLOT_NAME[s] || s.replace(/(\d)$/, ' $1')}`); } // every slot listed, used or not
  if (first.major) { tally.cssVar('--font-heading', first.major); tally.add('fonts', first.major, 0); }
  if (first.minor) { tally.cssVar('--font-body', first.minor); tally.add('fonts', first.minor, 0); }
  tally.cssVar('--slide-width', `${Math.round(W / 96 * 1000) / 1000}in`); tally.cssVar('--slide-height', `${Math.round(H / 96 * 1000) / 1000}in`);

  prepareOut(outDir);
  return writeAtlas(outDir, { project: { name: path.basename(name, path.extname(name)), kind: 'pptx', source: name, viewport: { width: W, height: H },
    units: { ppi: 96, slideInches: { width: Math.round(W / 96 * 1000) / 1000, height: Math.round(H / 96 * 1000) / 1000 } }, notes },
    tokens: tally.finalize(), contrast: contrastReport(pairs), screens });
}
