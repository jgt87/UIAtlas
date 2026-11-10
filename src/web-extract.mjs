// Web extractor: drives a headless browser over a site's pages and produces a normalized atlas —
// design tokens aggregated from COMPUTED styles plus text-free per-page style samples (screenshots only when opted in)
// (the real colors/type/spacing the browser applied, not just declared CSS). JS is run by the page as
// normal browsing; nothing is injected into the site beyond read-only measurement in page.evaluate.
// Also measures local HTML/SVG files (file:// URLs) and, via capturePage, Storybook stories.
import path from 'node:path';
import { launchBrowser, sha8, prepareOut, writeAtlas, contrastReport } from './atlas-util.mjs';
import { createGate, userAgentSuffix } from './polite.mjs';

// Runs inside the page. Returns {tokens, contrast, inventory, elements, links} measured from computed styles;
// rootSel limits measurement to the first matching element's subtree (e.g. a Storybook story root).
// Typography, text colours and contrast come from elements that carry text of their own; whether an element has
// text is checked, the text itself is never read out.
// It is serialized into the page, so every helper lives inside it (nothing from module scope, no Node APIs).
function collect(rootSel) {
  const shown = (r, s) => r.width > 1 && r.height > 1 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05;
  const vis = el => shown(el.getBoundingClientRect(), getComputedStyle(el));
  // computed colours may be rgb(), or oklch()/lab()/color(...) on modern sites: anything else is converted by painting one
  // pixel and reading it back as sRGB (cached per value)
  const px = new OffscreenCanvas(1, 1).getContext('2d', { willReadFrequently: true }), seenColor = new Map(); // offscreen: works in bare SVG documents too
  const noColor = c => !c || c === 'none' || c === 'transparent' || c.startsWith('url(');
  const rgbFn = c => { const m = /^rgba?\(([^)]+)\)$/.exec(c); if (!m) return null; const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p[3] ?? 1]; };
  const paint = c => { px.clearRect(0, 0, 1, 1); px.fillStyle = '#000'; px.fillStyle = c; px.fillRect(0, 0, 1, 1); const d = px.getImageData(0, 0, 1, 1).data;
    return d[3] ? [d[0], d[1], d[2], Math.round(d[3] / 255 * 1000) / 1000] : null; };
  const rgba = c => { if (noColor(c)) return null; const v = rgbFn(c); if (v) return v; if (!seenColor.has(c)) seenColor.set(c, paint(c)); return seenColor.get(c); };
  const hex = (r, g, b) => '#' + [r, g, b].map(x => Math.round(x).toString(16).padStart(2, '0')).join('');
  const norm = c => { const v = rgba(c); return v && v[3] > 0 ? hex(v[0], v[1], v[2]) : null; }; // rgb/rgba -> #hex (drop fully transparent)
  // all four corners: one value when equal ('8px', '50%'), else the shorthand ('8px 8px 0px 0px'); null when square
  const radius = s => { const c = ['TopLeft', 'TopRight', 'BottomRight', 'BottomLeft'].map(k => { const v = s[`border${k}Radius`].split(' ')[0]; return v.endsWith('%') ? v : (Math.round(parseFloat(v)) || 0) + 'px'; });
    return c.every(v => parseFloat(v) === 0) ? null : c.every(v => v === c[0]) ? c[0] : c.join(' '); };
  const lineHeight = s => { const lh = parseFloat(s.lineHeight), fs = parseFloat(s.fontSize); return s.lineHeight === 'normal' ? 'normal' : lh && fs ? String(Math.round(lh / fs * 100) / 100) : null; }; // as a ratio of the font size
  const letterSpacing = s => s.letterSpacing === 'normal' ? '0px' : `${Math.round(parseFloat(s.letterSpacing) * 100) / 100 || 0}px`;
  const typeface = s => s.fontFamily.split(',')[0].replace(/["']/g, '').trim();
  const tally = {}; const add = (k, v) => { if (v == null || v === '') return; (tally[k] ||= new Map()).set(v, (tally[k]?.get(v) || 0) + 1); };
  const usage = new Map(); const use = (kind, v) => { if (!v) return; add('colors', v); const u = usage.get(v) || usage.set(v, {}).get(v); u[kind] = (u[kind] || 0) + 1; };
  const hasText = el => [...el.childNodes].some(n => n.nodeType === 3 && /\S/.test(n.nodeValue));
  // The colour actually behind an element: its own and its ancestors' backgrounds composited, white at the bottom
  // (background images and gradients are not seen).
  const backdrop = el => { const layers = []; let image = false;
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.backgroundImage !== 'none') image = true; const v = rgba(cs.backgroundColor); if (v && v[3] > 0) { layers.push(v); if (v[3] >= 0.999) break; } }
    const rgb = layers.reverse().reduce((b, [r, g, bl, a]) => [r * a + b[0] * (1 - a), g * a + b[1] * (1 - a), bl * a + b[2] * (1 - a)], [255, 255, 255]); rgb.image = image; return rgb; };
  // box styles of every visible element (tally order matters: it breaks ties between equal counts)
  const space = v => { const n = Math.round(parseFloat(v)) || 0; if (n > 0 && n <= 160) add('spacing', n + 'px'); };
  const shapePaint = s => { use('fill', norm(s.fill)); if (s.stroke !== 'none' && (parseFloat(s.strokeWidth) || 0) > 0) use('border', norm(s.stroke)); };
  const boxStyle = (el, s, svg) => { use('background', norm(s.backgroundColor)); if (svg && el.tagName.toLowerCase() !== 'svg') shapePaint(s);
    if ((parseFloat(s.borderTopWidth) || 0) > 0) use('border', norm(s.borderTopColor));
    add('radii', radius(s)); if (s.boxShadow && s.boxShadow !== 'none') add('shadows', s.boxShadow);
    for (const side of ['Top', 'Right', 'Bottom', 'Left']) { space(s['margin' + side]); space(s['padding' + side]); } };
  // a text-bearing element: typography, text colour and the contrast against what is behind it
  const typeStyle = (s, svg) => { if (!svg) use('text', norm(s.color)); add('fonts', typeface(s)); add('fontSizes', Math.round(parseFloat(s.fontSize)) + 'px');
    add('fontWeights', s.fontWeight); add('lineHeights', lineHeight(s)); add('letterSpacings', letterSpacing(s)); };
  const isLarge = s => { const size = parseFloat(s.fontSize); return size >= 24 || (size >= 18.66 && Number(s.fontWeight) >= 700); };
  const pairs = new Map();
  const contrastPair = (el, s, svg) => { const fgv = rgba(svg ? s.fill : s.color); if (!fgv || fgv[3] === 0) return;
    const bg = backdrop(el), a = fgv[3], fg = [0, 1, 2].map(i => fgv[i] * a + bg[i] * (1 - a)); // translucent text blends into its backdrop
    const key = `${hex(...fg)}|${hex(...bg)}|${isLarge(s) ? 1 : 0}|${bg.image ? 1 : 0}`; pairs.set(key, (pairs.get(key) || 0) + 1); };
  const measure = el => { const s = getComputedStyle(el), svg = el instanceof SVGElement; boxStyle(el, s, svg); if (hasText(el)) { typeStyle(s, svg); contrastPair(el, s, svg); } };
  const root = (rootSel && document.querySelector(rootSel)) || null;
  const all = (root ? [root, ...root.querySelectorAll('*')] : [...document.querySelectorAll('*')]).filter(vis);
  for (const el of all) measure(el);
  // :root custom properties (best effort: a failure keeps what was read so far)
  const rootVars = () => { const out = []; try { const rs = getComputedStyle(document.documentElement); for (const n of rs) if (n.startsWith('--')) out.push({ name: n, value: rs.getPropertyValue(n).trim() }); } catch { /* none readable */ } return out; };
  const cssVars = rootVars();
  // element inventory + a curated catalogue of notable elements
  const roleByTag = new Map([['a', 'link'], ['input', 'input'], ['textarea', 'input'], ['select', 'input'], ['img', 'image'], ['svg', 'image'], ['nav', 'nav'], ...[1, 2, 3, 4, 5, 6].map(n => ['h' + n, 'heading'])]);
  const roleOf = el => { const t = el.tagName.toLowerCase(); if (t === 'button' || el.getAttribute('role') === 'button') return 'button'; if (t === 'text' && el instanceof SVGElement) return 'text'; return roleByTag.get(t) || null; };
  const sample = (el, role) => { const s = getComputedStyle(el); const r = el.getBoundingClientRect();
    return { role, tag: el.tagName.toLowerCase(), // styles only: the element's text is never read
      bbox: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      color: el instanceof SVGElement ? norm(s.fill) : norm(s.color), bg: norm(s.backgroundColor), fontSize: Math.round(parseFloat(s.fontSize)) + 'px', weight: s.fontWeight, radius: radius(s) || '0px',
      font: typeface(s), lineHeight: lineHeight(s), letterSpacing: letterSpacing(s),
      border: (parseFloat(s.borderTopWidth) || 0) > 0 ? norm(s.borderTopColor) : null, padding: `${Math.round(parseFloat(s.paddingTop) || 0)}px ${Math.round(parseFloat(s.paddingLeft) || 0)}px` }; };
  const inv = {}, catalogue = [];
  for (const el of all) { const role = roleOf(el); if (!role) continue; inv[role] = (inv[role] || 0) + 1; if (catalogue.length < 400) catalogue.push(sample(el, role)); }
  const top = (k, n = 40) => [...(tally[k] || new Map())].sort((a, b) => b[1] - a[1]).slice(0, n).map(([value, count]) => ({ value, count }));
  // same-origin links for crawling (fragments stripped, so #anchors aren't treated as pages); an unparsable href is no page
  const pageUrl = href => { try { const u = new URL(href); if (u.origin !== location.origin || u.protocol !== location.protocol) return null; u.hash = ''; return u.href; } catch { return null; } };
  const links = [...new Set([...document.querySelectorAll('a[href]')].map(a => pageUrl(a.href)).filter(Boolean))].slice(0, 200);
  return {
    tokens: { colors: top('colors').map(c => ({ ...c, usage: usage.get(c.value) })), fonts: top('fonts', 20), fontSizes: top('fontSizes', 20), fontWeights: top('fontWeights', 10),
      lineHeights: top('lineHeights', 16), letterSpacings: top('letterSpacings', 16), spacing: top('spacing', 24), radii: top('radii', 16), shadows: top('shadows', 12), cssVars: cssVars.slice(0, 200) },
    contrast: [...pairs].map(([k, count]) => { const [fg, bg, large, image] = k.split('|'); return { fg, bg, large: large === '1', count, ...(image === '1' ? { overImage: true } : {}) }; }),
    inventory: inv, elements: catalogue, links,
  };
}

// Where the fonts a page uses come from: its @font-face rules (from loaded stylesheets and inline <style>), so the
// viewer and the PDF sheet can show each font in itself. Only the font file's URL and descriptors are kept — the
// file is never copied — and data: URLs are skipped. Never part of the JSON/CSS exports (URLs name the source).
export function parseFontFaces(css, baseUrl) {
  return [...String(css).matchAll(/@font-face\s*\{([^}]*)\}/gi)].map(([, body]) => fontFace(body, baseUrl)).filter(Boolean);
}
// one rule's family, preferred file and descriptors; null without a family or a usable (non-data:, resolvable) file
function fontFace(body, baseUrl) {
  const prop = n => new RegExp(`(?:^|;)\\s*${n}\\s*:\\s*([^;]+)`, 'i').exec(body)?.[1].trim();
  const family = prop('font-family')?.replace(/^["']|["']$/g, ''); if (!family) return null;
  const pick = preferredSrc(prop('src')); if (!pick) return null;
  let url; try { url = new URL(pick.url, baseUrl).href; } catch { return null; }
  return { family, url, weight: prop('font-weight') || '400', style: prop('font-style') || 'normal', ...(prop('unicode-range') ? { unicodeRange: prop('unicode-range') } : {}) };
}
// woff2 when offered, else the first url()
const preferredSrc = src => {
  const srcs = [...(src || '').matchAll(/url\(\s*(["']?)([^"')]+)\1\s*\)\s*(?:format\(\s*["']?([\w-]+)["']?\s*\))?/gi)].map(m => ({ url: m[2], format: m[3] || null }))
    .filter(x => !/^data:/i.test(x.url));
  return srcs.find(x => x.format === 'woff2' || /\.woff2(\?|$)/i.test(x.url)) || srcs[0];
};

// Merge a page's token tallies (and contrast pairs) into the project-wide tally. The acc maps are created lazily,
// in this order.
const TOKEN_KEYS = ['colors', 'fonts', 'fontSizes', 'fontWeights', 'lineHeights', 'letterSpacings', 'spacing', 'radii', 'shadows'];
function mergeTokens(acc, t, contrast = [], fontFaces = []) {
  mergeFaces(acc, fontFaces); mergeCounts(acc, t); mergeUsage(acc, t.colors || []); mergeVars(acc, t.cssVars || []); mergeContrast(acc, contrast);
}
const mergeFaces = (acc, faces) => { for (const f of faces) (acc.fontFaces ||= new Map()).set(`${f.family}|${f.weight}|${f.style}|${f.unicodeRange || ''}`, f); };
const mergeCounts = (acc, t) => { for (const key of TOKEN_KEYS) { const m = (acc[key] ||= new Map()); for (const { value, count } of t[key] || []) m.set(value, (m.get(value) || 0) + count); } };
const mergeUsage = (acc, colors) => { for (const c of colors) if (c.usage) { const u = ((acc.usage ||= new Map()).get(c.value) || acc.usage.set(c.value, {}).get(c.value)); for (const [k, n] of Object.entries(c.usage)) u[k] = (u[k] || 0) + n; } };
const mergeVars = (acc, vars) => { for (const v of vars) (acc.cssVars ||= new Map()).set(v.name, v.value); };
const mergeContrast = (acc, contrast) => { for (const c of contrast) { const k = `${c.fg}|${c.bg}|${c.large}|${!!c.overImage}`, m = (acc.contrast ||= new Map()); m.set(k, { ...c, count: (m.get(k)?.count || 0) + c.count }); } };
const finalizeTokens = acc => {
  const top = (key, n) => [...(acc[key] || new Map())].sort((a, b) => b[1] - a[1]).slice(0, n).map(([value, count]) => ({ value, count }));
  return { colors: top('colors', 60).map(c => acc.usage?.get(c.value) ? { ...c, usage: acc.usage.get(c.value) } : c), fonts: top('fonts', 24), fontSizes: top('fontSizes', 24), fontWeights: top('fontWeights', 12),
    lineHeights: top('lineHeights', 16), letterSpacings: top('letterSpacings', 16), spacing: top('spacing', 32), radii: top('radii', 20), shadows: top('shadows', 16),
    cssVars: [...(acc.cssVars || new Map())].map(([name, value]) => ({ name, value })).slice(0, 300) };
};
const finalizeContrast = acc => contrastReport([...(acc.contrast || new Map()).values()]);
// font faces for the families the tokens actually list; when a family is split into unicode-range subsets, only the
// subsets covering basic Latin ('A' = U+41) are kept — enough to show the font's name and samples in itself
const coversLatin = f => !f.unicodeRange || f.unicodeRange.split(',').some(r => { const [a, b = a] = r.trim().replace(/^U\+/i, '').split('-');
  const lo = parseInt(a.replace(/\?/g, '0'), 16), hi = parseInt(b.replace(/\?/g, 'F'), 16); return lo <= 0x41 && 0x41 <= hi; });
const finalizeFontFaces = (acc, tokens) => { const used = new Set(tokens.fonts.map(f => f.value.toLowerCase()));
  return [...(acc.fontFaces || new Map()).values()].filter(f => used.has(f.family.toLowerCase()) && coversLatin(f)).slice(0, 60); };

// capturePage's stages. Each failure that only costs a detail (a hook, a stylesheet, a screenshot) is caught where it
// happens, so one bad page or asset never stops a crawl.
// Load: networkidle for the web (it never settles on a bare SVG document, so files wait for load), else
// domcontentloaded; false when neither works.
async function load(page, url) {
  try { await page.goto(url, { waitUntil: url.startsWith('file:') ? 'load' : 'networkidle', timeout: 30000 }); return true; }
  catch { return page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 }).then(() => true, () => false); }
}
// the caller's wait hook, then <html> attributes (in our own browser only), then a fixed settle time
async function settle(page, { waitFor, htmlAttrs, waitMs }) {
  if (waitFor) await waitFor(page).catch(() => {});
  if (htmlAttrs) await page.evaluate(a => { for (const [k, v] of Object.entries(a)) document.documentElement.setAttribute(k, v); }, htmlAttrs).catch(() => {});
  await page.waitForTimeout(waitMs);
}
// @font-face rules of the loaded stylesheets (an unreadable one is skipped) and of inline <style>
async function pageFontFaces(page, sheets, url) {
  const linked = (await Promise.all(sheets.map(r => r.text().then(t => ({ t, base: r.url() })).catch(() => null)))).filter(Boolean);
  const inline = { t: await page.evaluate(() => [...document.querySelectorAll('style')].map(s => s.textContent).join('\n')).catch(() => ''), base: url };
  return [...linked, inline].flatMap(c => parseFontFaces(c.t, c.base));
}
const hasArea = box => box && box.width > 1 && box.height > 1;
// a story root can be 0-high when the component renders in a portal; fall back to the viewport then.
// Around a root, keep a 16px margin: components often overflow their root slightly.
const clipAround = box => { const x = Math.max(0, Math.floor(box.x - 16)), y = Math.max(0, Math.floor(box.y - 16));
  return { x, y, width: Math.ceil(box.x + box.width + 16 - x), height: Math.ceil(box.y + box.height + 16 - y) }; };
// What a screenshot shows: rootSel's box, or a bare SVG document's drawing (full-page screenshots hang on those)
async function shotFrame(page, rootSel) {
  const svgDoc = await page.evaluate(() => document.documentElement instanceof SVGElement).catch(() => false);
  const box = rootSel ? await page.locator(rootSel).first().boundingBox().catch(() => null) : svgDoc ? await page.locator(':root').boundingBox().catch(() => null) : null;
  const boxed = hasArea(box);
  return { svgDoc, box, boxed, clip: boxed && !svgDoc ? clipAround(box) : null };
}
// a bare SVG document: size the viewport to the drawing and shoot that, then restore the viewport
async function shootDrawing(page, file, box, viewport) {
  await page.setViewportSize({ width: Math.ceil(box.width), height: Math.ceil(box.height) }); await page.screenshot({ path: file });
  if (viewport) await page.setViewportSize(viewport);
}
// only when opted in; if the shot fails, the visible viewport; if that fails too, the screen just has no screenshot
async function shoot(page, file, { svgDoc, box, boxed, clip }, { rootSel, viewport, screenshots }) {
  if (!screenshots) return;
  try {
    if (svgDoc && boxed) await shootDrawing(page, file, box, viewport);
    else if (clip) await page.screenshot({ path: file, fullPage: true, clip }); else await page.screenshot({ path: file, fullPage: !rootSel });
  } catch { await page.screenshot({ path: file }).catch(() => {}); }
}
// the screen's size: the clip, the root's or drawing's box, else the document's scroll size
async function screenDims(page, { clip, box, boxed }, viewport) {
  if (clip) return { w: clip.width, h: clip.height };
  if (boxed) return { w: Math.round(box.width), h: Math.round(box.height) };
  return page.evaluate(() => ({ w: document.documentElement.scrollWidth || innerWidth, h: document.documentElement.scrollHeight || innerHeight })).catch(() => ({ w: viewport?.width, h: viewport?.height }));
}
const screenTitle = url => { try { const u = new URL(url); return u.protocol === 'file:' ? url : u.pathname + u.search; } catch { return url; } }; // the page's own <title> is content
// element boxes relative to the cropped screenshot
const relativeTo = (elements, clip) => { if (clip) for (const e of elements) { e.bbox.x -= clip.x; e.bbox.y -= clip.y; } };

// Load one URL and measure it: tokens, contrast pairs, font faces, inventory, text-free elements, links; plus a
// screenshot (full page, or just rootSel's box) only when screenshots are opted into.
// htmlAttrs: attributes set on <html> in our own browser before measuring (how many sites switch theme, e.g.
// data-bs-theme=dark); only ever for an explicitly requested mode, never on the site itself.
export async function capturePage(page, url, shotsDir, { waitMs = 1200, rootSel = null, waitFor = null, viewport, screenshots = false, htmlAttrs = null } = {}) {
  const sheets = [], onSheet = r => { if (r.request().resourceType() === 'stylesheet') sheets.push(r); };
  page.on('response', onSheet);
  if (!await load(page, url)) { page.off('response', onSheet); return null; }
  await settle(page, { waitFor, htmlAttrs, waitMs });
  page.off('response', onSheet);
  let data; try { data = await page.evaluate(collect, rootSel); } catch { return null; } // a page that can't be measured is skipped
  const fontFaces = await pageFontFaces(page, sheets, url);
  const id = sha8(url), file = path.join(shotsDir, `${id}.png`);
  const frame = await shotFrame(page, rootSel);
  await shoot(page, file, frame, { rootSel, viewport, screenshots });
  const dims = await screenDims(page, frame, viewport);
  relativeTo(data.elements, frame.clip);
  return { tokens: data.tokens, contrast: data.contrast, fontFaces, links: data.links, screen: { id, url, title: screenTitle(url), screenshot: screenshots ? `screens/${id}.png` : null, width: dims.w, height: dims.h, inventory: data.inventory, elements: data.elements } };
}

// A fresh context = signed out. When crawling the web the browser's own user agent gets a UI Atlas suffix, so site
// owners can see who is measuring; colorScheme drives prefers-color-scheme (dark/light modes).
export async function newMeasuringPage(browser, viewport, { colorScheme, identify = false } = {}) {
  let userAgent;
  if (identify) { const probe = await browser.newContext(); userAgent = `${await (await probe.newPage()).evaluate(() => navigator.userAgent)} ${userAgentSuffix}`; await probe.close(); }
  return (await browser.newContext({ viewport, deviceScaleFactor: 1, ...(colorScheme ? { colorScheme } : {}), ...(userAgent ? { userAgent } : {}) })).newPage();
}
export { mergeTokens, finalizeTokens, finalizeContrast, finalizeFontFaces };

// extractSite's stages. A crawl key has no fragment and no trailing slash (except the root path).
const normalizeUrl = u => { try { const x = new URL(u); x.hash = ''; if (x.pathname !== '/' && x.pathname.endsWith('/')) x.pathname = x.pathname.replace(/\/+$/, ''); return x.href; } catch { return u; } };
const inScope = (l, scope) => !scope || l.startsWith(scope);
// robots.txt and pacing (web crawls only); a refused URL is reported and skipped
async function politeAllow(gate, url) {
  const ok = await gate.allow(url); if (!ok.ok) { console.log(`  skipped ${url} (${ok.reason})`); return false; }
  await gate.wait(url); return true;
}
function addScreen(crawl, got, url, { scope, maxPages }) {
  mergeTokens(crawl.tokenAcc, got.tokens, got.contrast, got.fontFaces);
  // local files are recorded relative to the start folder, never as an absolute local path
  crawl.linksOf.set(got.screen.id, got.links.map(normalizeUrl)); crawl.idOf.set(url, got.screen.id);
  if (scope) got.screen.url = got.screen.title = decodeURIComponent(url.slice(scope.length));
  crawl.screens.push(got.screen);
  console.log(`  [${crawl.screens.length}/${maxPages}] ${got.screen.url}  (${Object.entries(got.screen.inventory).map(([k, v]) => `${v} ${k}`).join(', ')})`);
}
// queued holds every URL ever queued; each one leaves the queue only into seen, so it answers "seen or still queued"
const enqueue = (crawl, links, scope) => { for (const l of links.map(normalizeUrl)) if (!crawl.queued.has(l) && inScope(l, scope)) { crawl.queued.add(l); crawl.queue.push(l); } };
async function crawlPages(page, crawl, { web, gate, shotsDir, scope, maxPages, capture }) {
  while (crawl.queue.length && crawl.screens.length < maxPages) {
    const url = normalizeUrl(crawl.queue.shift()); if (crawl.seen.has(url)) continue; crawl.seen.add(url);
    if (web && !await politeAllow(gate, url)) continue;
    const got = await capturePage(page, url, shotsDir, capture); if (!got) continue;
    addScreen(crawl, got, url, { scope, maxPages });
    if (crawl.screens.length < maxPages) enqueue(crawl, got.links, scope);
  }
}
// flow: which captured pages link to which (links to pages outside the crawl are left out)
const flowEdges = (linksOf, idOf) => [...linksOf].flatMap(([from, ls]) => [...new Set(ls.map(l => idOf.get(l)).filter(to => to && to !== from))].map(to => ({ from, to })));
const siteAtlas = ({ screens, tokenAcc, linksOf, idOf }, { startUrl, name, kind, source, viewport, web, gate }) => ({
  project: { name: name || new URL(startUrl).hostname, kind, source: source || startUrl, viewport, ...(web ? { notes: gate.notes() } : {}) },
  flow: screens.length > 1 ? { start: screens[0].id, edges: flowEdges(linksOf, idOf) } : undefined, tokens: finalizeTokens(tokenAcc), contrast: finalizeContrast(tokenAcc), fontFaces: finalizeFontFaces(tokenAcc, finalizeTokens(tokenAcc)), screens });

// Crawl from startUrl (http(s) or file://). For file URLs only files under `scope` (the start folder's URL) are followed.
// Web crawls are polite: robots.txt is honoured (unless ignoreRobots) and requests to a host are spaced by delayMs
// (or the site's Crawl-delay, if longer).
export async function extractSite({ startUrl, maxPages = 1, outDir, viewport = { width: 1280, height: 900 }, waitMs = 1200, name, kind = 'web', source, scope, screenshots = false,
  colorScheme, htmlAttrs = null, ignoreRobots = false, delayMs = 1000 }) {
  const web = /^https?:/i.test(startUrl), gate = createGate({ ignoreRobots, delayMs });
  const shotsDir = prepareOut(outDir, { screenshots });
  const browser = await launchBrowser();
  const page = await newMeasuringPage(browser, viewport, { colorScheme, identify: web });
  const queue = [normalizeUrl(startUrl)], crawl = { queue, queued: new Set(queue), seen: new Set(), screens: [], tokenAcc: {}, linksOf: new Map(), idOf: new Map() };
  try { await crawlPages(page, crawl, { web, gate, shotsDir, scope, maxPages, capture: { waitMs, viewport, screenshots, htmlAttrs } }); } finally { await browser.close(); }
  return writeAtlas(outDir, siteAtlas(crawl, { startUrl, name, kind, source, viewport, web, gate }), { screenshots });
}
