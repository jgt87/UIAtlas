// Web extractor: drives a headless browser over a site's pages and produces a normalized atlas —
// screenshots, a per-page element inventory, and design tokens aggregated from COMPUTED styles
// (the real colors/type/spacing the browser applied, not just declared CSS). JS is run by the page as
// normal browsing; nothing is injected into the site beyond read-only measurement in page.evaluate.
// Also measures local HTML/SVG files (file:// URLs) and, via capturePage, Storybook stories.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { launchBrowser, sha8 } from './atlas-util.mjs';

// Runs inside the page. Returns {tokens, inventory, elements, links} measured from computed styles;
// rootSel limits measurement to the first matching element's subtree (e.g. a Storybook story root).
function collect(rootSel) {
  const vis = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 1 && r.height > 1 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05; };
  const norm = c => { // rgb/rgba -> #hex (drop fully transparent)
    const m = /^rgba?\(([^)]+)\)/.exec(c); if (!m) return null;
    const p = m[1].split(',').map(x => x.trim()); const a = p[3] === undefined ? 1 : Number(p[3]);
    if (a === 0) return null; const h = p.slice(0, 3).map(x => Number(x).toString(16).padStart(2, '0')).join('');
    return '#' + h;
  };
  // all four corners: one value when equal ('8px', '50%'), else the shorthand ('8px 8px 0px 0px'); null when square
  const radius = s => { const c = ['TopLeft', 'TopRight', 'BottomRight', 'BottomLeft'].map(k => { const v = s[`border${k}Radius`].split(' ')[0]; return v.endsWith('%') ? v : (Math.round(parseFloat(v)) || 0) + 'px'; });
    return c.every(v => parseFloat(v) === 0) ? null : c.every(v => v === c[0]) ? c[0] : c.join(' '); };
  const tally = {}; const add = (k, v) => { if (v == null || v === '') return; (tally[k] ||= new Map()).set(v, (tally[k]?.get(v) || 0) + 1); };
  const root = (rootSel && document.querySelector(rootSel)) || null;
  const all = (root ? [root, ...root.querySelectorAll('*')] : [...document.querySelectorAll('*')]).filter(vis);
  for (const el of all) {
    const s = getComputedStyle(el);
    add('colors', norm(s.color));
    add('colors', norm(s.backgroundColor));
    if (el instanceof SVGElement && el.tagName.toLowerCase() !== 'svg') { add('colors', norm(s.fill)); if (s.stroke !== 'none' && (parseFloat(s.strokeWidth) || 0) > 0) add('colors', norm(s.stroke)); }
    const bw = parseFloat(s.borderTopWidth) || 0; if (bw > 0) add('colors', norm(s.borderTopColor));
    add('fonts', s.fontFamily.split(',')[0].replace(/["']/g, '').trim());
    add('fontSizes', Math.round(parseFloat(s.fontSize)) + 'px');
    add('fontWeights', s.fontWeight);
    add('radii', radius(s));
    if (s.boxShadow && s.boxShadow !== 'none') add('shadows', s.boxShadow);
    for (const side of ['Top', 'Right', 'Bottom', 'Left']) { const m = Math.round(parseFloat(s['margin' + side])) || 0; if (m > 0 && m <= 160) add('spacing', m + 'px'); const pd = Math.round(parseFloat(s['padding' + side])) || 0; if (pd > 0 && pd <= 160) add('spacing', pd + 'px'); }
  }
  // :root custom properties
  const cssVars = [];
  try { const rs = getComputedStyle(document.documentElement); for (const n of rs) if (n.startsWith('--')) cssVars.push({ name: n, value: rs.getPropertyValue(n).trim() }); } catch {}
  // element inventory + a curated catalogue of notable elements
  const inv = {}; const bump = k => inv[k] = (inv[k] || 0) + 1;
  const catalogue = [];
  const roleOf = el => { const t = el.tagName.toLowerCase(); if (t === 'button' || el.getAttribute('role') === 'button') return 'button'; if (t === 'a') return 'link'; if (t === 'input' || t === 'textarea' || t === 'select') return 'input'; if (/^h[1-6]$/.test(t)) return 'heading'; if (t === 'img' || t === 'svg') return 'image'; if (t === 'nav') return 'nav'; if (t === 'text' && el instanceof SVGElement) return 'text'; return null; };
  for (const el of all) { const role = roleOf(el); if (!role) continue; bump(role);
    if (catalogue.length < 400) { const s = getComputedStyle(el); const r = el.getBoundingClientRect();
      catalogue.push({ role, tag: el.tagName.toLowerCase(), text: (el.innerText || el.value || el.getAttribute('aria-label') || (el instanceof SVGElement ? el.textContent : '') || '').trim().slice(0, 80),
        bbox: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
        color: norm(s.color), bg: norm(s.backgroundColor), fontSize: Math.round(parseFloat(s.fontSize)) + 'px', weight: s.fontWeight, radius: radius(s) || '0px' }); } }
  const top = (k, n = 40) => [...(tally[k] || new Map())].sort((a, b) => b[1] - a[1]).slice(0, n).map(([value, count]) => ({ value, count }));
  // same-origin links for crawling (fragments stripped, so #anchors aren't treated as pages)
  const links = [...new Set([...document.querySelectorAll('a[href]')].map(a => { try { const u = new URL(a.href); if (u.origin !== location.origin || u.protocol !== location.protocol) return null; u.hash = ''; return u.href; } catch { return null; } }).filter(Boolean))].slice(0, 200);
  return {
    tokens: { colors: top('colors'), fonts: top('fonts', 20), fontSizes: top('fontSizes', 20), fontWeights: top('fontWeights', 10), spacing: top('spacing', 24), radii: top('radii', 16), shadows: top('shadows', 12), cssVars: cssVars.slice(0, 200) },
    inventory: inv, elements: catalogue, links,
  };
}

// Merge a page's token tallies into the project-wide tally.
function mergeTokens(acc, t) {
  for (const key of ['colors', 'fonts', 'fontSizes', 'fontWeights', 'spacing', 'radii', 'shadows']) {
    const m = (acc[key] ||= new Map());
    for (const { value, count } of t[key] || []) m.set(value, (m.get(value) || 0) + count);
  }
  for (const v of t.cssVars || []) (acc.cssVars ||= new Map()).set(v.name, v.value);
}
const finalizeTokens = acc => {
  const top = (key, n) => [...(acc[key] || new Map())].sort((a, b) => b[1] - a[1]).slice(0, n).map(([value, count]) => ({ value, count }));
  return { colors: top('colors', 60), fonts: top('fonts', 24), fontSizes: top('fontSizes', 24), fontWeights: top('fontWeights', 12), spacing: top('spacing', 32), radii: top('radii', 20), shadows: top('shadows', 16), cssVars: [...(acc.cssVars || new Map())].map(([name, value]) => ({ name, value })).slice(0, 300) };
};

// Load one URL and measure it: screenshot (full page, or just rootSel's box), tokens, inventory, elements, links.
export async function capturePage(page, url, shotsDir, { waitMs = 1200, rootSel = null, waitFor = null, viewport } = {}) {
  try { await page.goto(url, { waitUntil: url.startsWith('file:') ? 'load' : 'networkidle', timeout: 30000 }); } // networkidle never settles on a bare SVG document
  catch { try { await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 }); } catch { return null; } }
  if (waitFor) await waitFor(page).catch(() => {});
  await page.waitForTimeout(waitMs);
  let data; try { data = await page.evaluate(collect, rootSel); } catch { return null; }
  const id = sha8(url), file = path.join(shotsDir, `${id}.png`);
  // full-page screenshots hang on bare SVG documents: size the viewport to the drawing and shoot that instead
  const svgDoc = await page.evaluate(() => document.documentElement instanceof SVGElement).catch(() => false);
  const box = rootSel ? await page.locator(rootSel).first().boundingBox().catch(() => null) : svgDoc ? await page.locator(':root').boundingBox().catch(() => null) : null;
  const boxed = box && box.width > 1 && box.height > 1;
  // a story root can be 0-high when the component renders in a portal; fall back to the viewport then.
  // Around a root, keep a 16px margin: components often overflow their root slightly.
  const clip = boxed && !svgDoc ? (({ x, y }) => ({ x, y, width: Math.ceil(box.x + box.width + 16 - x), height: Math.ceil(box.y + box.height + 16 - y) }))({ x: Math.max(0, Math.floor(box.x - 16)), y: Math.max(0, Math.floor(box.y - 16)) }) : null;
  try { if (svgDoc && boxed) { await page.setViewportSize({ width: Math.ceil(box.width), height: Math.ceil(box.height) }); await page.screenshot({ path: file }); if (viewport) await page.setViewportSize(viewport); }
    else if (clip) await page.screenshot({ path: file, fullPage: true, clip }); else await page.screenshot({ path: file, fullPage: !rootSel }); }
  catch { try { await page.screenshot({ path: file }); } catch {} }
  const title = await page.title().catch(() => '') || url;
  const dims = clip ? { w: clip.width, h: clip.height } : boxed ? { w: Math.round(box.width), h: Math.round(box.height) }
    : await page.evaluate(() => ({ w: document.documentElement.scrollWidth || innerWidth, h: document.documentElement.scrollHeight || innerHeight })).catch(() => ({ w: viewport?.width, h: viewport?.height }));
  if (clip) for (const e of data.elements) { e.bbox.x -= clip.x; e.bbox.y -= clip.y; } // element boxes relative to the cropped screenshot
  return { tokens: data.tokens, links: data.links, screen: { id, url, title, screenshot: `screens/${id}.png`, width: dims.w, height: dims.h, inventory: data.inventory, elements: data.elements } };
}
export const newMeasuringPage = async (browser, viewport) => (await browser.newContext({ viewport, deviceScaleFactor: 1 })).newPage(); // fresh context = signed out
export { mergeTokens, finalizeTokens };

// Crawl from startUrl (http(s) or file://). For file URLs only files under `scope` (the start folder's URL) are followed.
export async function extractSite({ startUrl, maxPages = 1, outDir, viewport = { width: 1280, height: 900 }, waitMs = 1200, name, kind = 'web', source, scope }) {
  const shotsDir = path.join(outDir, 'screens');
  mkdirSync(shotsDir, { recursive: true });
  const browser = await launchBrowser();
  const page = await newMeasuringPage(browser, viewport);
  const normalize = u => { try { const x = new URL(u); x.hash = ''; if (x.pathname !== '/' && x.pathname.endsWith('/')) x.pathname = x.pathname.replace(/\/+$/, ''); return x.href; } catch { return u; } };
  const queue = [normalize(startUrl)], seen = new Set(), screens = [], tokenAcc = {};
  try {
    while (queue.length && screens.length < maxPages) {
      const url = normalize(queue.shift()); if (seen.has(url)) continue; seen.add(url);
      const got = await capturePage(page, url, shotsDir, { waitMs, viewport }); if (!got) continue;
      mergeTokens(tokenAcc, got.tokens);
      // local files are recorded relative to the start folder, never as an absolute local path
      if (scope) { got.screen.url = decodeURIComponent(url.slice(scope.length)); if (got.screen.title === url) got.screen.title = got.screen.url; }
      screens.push(got.screen);
      console.log(`  [${screens.length}/${maxPages}] ${got.screen.url}  (${Object.entries(got.screen.inventory).map(([k, v]) => `${v} ${k}`).join(', ')})`);
      if (screens.length < maxPages) for (const l of got.links.map(normalize)) if (!seen.has(l) && !queue.includes(l) && (!scope || l.startsWith(scope))) queue.push(l);
    }
  } finally { await browser.close(); }
  const atlas = {
    project: { name: name || new URL(startUrl).hostname, kind, source: source || startUrl, created: new Date().toISOString(), pages: screens.length, viewport },
    tokens: finalizeTokens(tokenAcc), screens,
  };
  writeFileSync(path.join(outDir, 'atlas.json'), JSON.stringify(atlas, null, 0));
  return atlas;
}
