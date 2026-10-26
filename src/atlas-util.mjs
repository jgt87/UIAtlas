// Shared helpers for adapters: every adapter turns some source into the same atlas.json schema
// (see AGENTS.md) under data/<name>/; screenshots (opt-in) go to data/<name>/screens/.
import { chromium } from 'playwright';
import { mkdirSync, rmSync, writeFileSync, existsSync, copyFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// Browser to drive: an installed one ('msedge', 'chrome', ...) or 'chromium' for Playwright's own download.
export const CHANNEL = process.env.PLAYWRIGHT_CHANNEL || 'msedge';
export const launchBrowser = () => chromium.launch(CHANNEL === 'chromium' ? {} : { channel: CHANNEL });

export const sha8 = s => crypto.createHash('sha256').update(s).digest('hex').slice(0, 8);
export const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'item';

// Any colour notation an adapter meets -> '#rrggbb' (or '#rrggbbaa' when translucent); null when unreadable/transparent.
export function toHex(c) {
  if (c == null) return null;
  if (typeof c === 'object') { // {r,g,b[,a]} in 0-1 or 0-255
    const big = [c.r, c.g, c.b].some(v => v > 1), k = big ? 1 : 255;
    return rgbaHex(c.r * k, c.g * k, c.b * k, c.a ?? 1);
  }
  const s = String(c).trim().toLowerCase();
  let m;
  if ((m = /^#?([0-9a-f]{3,4})$/.exec(s))) return toHex('#' + [...m[1]].map(x => x + x).join(''));
  if ((m = /^#?([0-9a-f]{6})([0-9a-f]{2})?$/.exec(s))) return m[2] === '00' ? null : '#' + m[1] + (m[2] && m[2] !== 'ff' ? m[2] : '');
  if ((m = /^rgba?\(([^)]+)\)$/.exec(s))) {
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(x => x.endsWith('%') ? parseFloat(x) * 2.55 : Number(x));
    return rgbaHex(p[0], p[1], p[2], m[1].includes('%') && p[3] > 1 ? p[3] / 255 : (p[3] ?? 1));
  }
  return null;
}
function rgbaHex(r, g, b, a = 1) {
  if (!(a > 0)) return null;
  const h = v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return '#' + h(r) + h(g) + h(b) + (a < 0.999 ? h(a * 255) : '');
}

// Token tally: add('colors', '#fff') ... then finalize() -> the atlas tokens object (all keys always present).
// use(kind, hex) also records what a colour is used for: 'text', 'background', 'border' or 'fill'.
export function tokenTally() {
  const t = {}, labels = {}, vars = new Map(), usage = new Map();
  const add = (key, value, n = 1, label) => {
    if (value == null || value === '') return;
    const m = (t[key] ||= new Map()); m.set(value, (m.get(value) || 0) + n);
    if (label) { const lm = (labels[key] ||= new Map()); (lm.get(value) || lm.set(value, new Set()).get(value)).add(label); }
  };
  const use = (kind, value, n = 1, label) => { if (!value) return; add('colors', value, n, label); const u = usage.get(value) || usage.set(value, {}).get(value); u[kind] = (u[kind] || 0) + n; };
  const top = (key, n) => [...(t[key] || new Map())].sort((a, b) => b[1] - a[1]).slice(0, n).map(([value, count]) => {
    const l = labels[key]?.get(value), u = key === 'colors' && usage.get(value);
    return { value, count, ...(l ? { label: [...l].slice(0, 4).join(', ') + (l.size > 4 ? ` +${l.size - 4}` : '') } : {}), ...(u ? { usage: u } : {}) };
  });
  const finalize = () => ({ colors: top('colors', 80), fonts: top('fonts', 24), fontSizes: top('fontSizes', 32), fontWeights: top('fontWeights', 12),
    lineHeights: top('lineHeights', 16), letterSpacings: top('letterSpacings', 16), spacing: top('spacing', 40), radii: top('radii', 24), shadows: top('shadows', 20),
    cssVars: [...vars].map(([name, value]) => ({ name, value })).slice(0, 500) });
  return { add, use, cssVar: (name, value) => value != null && vars.set(name, String(value)), finalize };
}

// Fresh output folder for a (re)import: screens/ is cleared so stale screenshots never linger. Only created when
// screenshots are opted into (--screenshots); without it nothing but atlas.json is written.
export function prepareOut(outDir, { screenshots = false } = {}) {
  const shots = path.join(outDir, 'screens');
  rmSync(shots, { recursive: true, force: true }); mkdirSync(screenshots ? shots : outDir, { recursive: true });
  return shots;
}

// An atlas holds design tokens and text-free style samples, never source content. Whatever an adapter produced,
// element text is dropped, screenshots are dropped unless opted into, and variables holding quoted strings
// (CSS `content`-style values, i.e. copy) are left out.
export function sanitize(atlas, { screenshots = false } = {}) {
  for (const s of atlas.screens || []) {
    if (!screenshots) s.screenshot = null;
    for (const e of s.elements || []) delete e.text;
  }
  if (atlas.tokens?.cssVars) atlas.tokens.cssVars = atlas.tokens.cssVars.filter(v => !/^\s*["']/.test(v.value));
  atlas.project.screenshots = !!screenshots;
  return atlas;
}

// Re-extracting keeps the previous atlas.json as history/<created>.json, so `atlas compare --previous` can show drift.
// (History holds the same token-only data as atlas.json; screenshots are never archived.)
export function archivePrevious(outDir) {
  const file = path.join(outDir, 'atlas.json'); if (!existsSync(file)) return null;
  let created; try { created = JSON.parse(readFileSync(file, 'utf8')).project?.created; } catch { return null; }
  const dir = path.join(outDir, 'history'), to = path.join(dir, `${String(created || Date.now()).replace(/:/g, '-')}.json`);
  mkdirSync(dir, { recursive: true }); copyFileSync(file, to); return to;
}

// Extra top-level fields an adapter may add: contrast (from contrastReport), modes ({ [mode]: { tokens, contrast } }).
export function writeAtlas(outDir, { project, tokens, screens = [], ...extra }, { screenshots = false } = {}) {
  const atlas = sanitize({ project: { created: new Date().toISOString(), pages: screens.length, ...project }, tokens, ...extra, screens }, { screenshots });
  if (!screenshots) rmSync(path.join(outDir, 'screens'), { recursive: true, force: true });
  archivePrevious(outDir);
  writeFileSync(path.join(outDir, 'atlas.json'), JSON.stringify(atlas, null, 0));
  return atlas;
}

// WCAG 2.x contrast: relative luminance ratio of two #rrggbb colours (1..21).
const lum = hex => { const n = parseInt(hex.slice(1, 7), 16); return [n >> 16, (n >> 8) & 255, n & 255].map(v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0); };
export const contrastRatio = (fg, bg) => { const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x); return Math.round((a + 0.05) / (b + 0.05) * 100) / 100; };
// AA needs 4.5 (3 for large text: >= 24px, or >= 18.66px bold); AAA needs 7 (4.5 for large).
export const wcagLevel = (ratio, large) => ratio >= (large ? 4.5 : 7) ? 'AAA' : ratio >= (large ? 3 : 4.5) ? 'AA' : 'fail';
// Text/background pairs [{ fg, bg, large, count, overImage? }] -> the same with ratio and level, worst first, merged by
// pair. Text over a background image or gradient can't be rated from colours alone: level 'unknown'.
export function contrastReport(pairs) {
  const m = new Map();
  for (const p of pairs || []) { if (!/^#[0-9a-f]{6}$/i.test(p.fg) || !/^#[0-9a-f]{6}$/i.test(p.bg)) continue; const k = `${p.fg}|${p.bg}|${!!p.large}|${!!p.overImage}`; m.set(k, { fg: p.fg, bg: p.bg, large: !!p.large, ...(p.overImage ? { overImage: true } : {}), count: (m.get(k)?.count || 0) + (p.count || 1) }); }
  return [...m.values()].map(p => { const ratio = contrastRatio(p.fg, p.bg); return { ...p, ratio, level: p.overImage ? 'unknown' : wcagLevel(ratio, p.large) }; })
    .sort((a, b) => (a.level === 'unknown') - (b.level === 'unknown') || a.ratio - b.ratio || b.count - a.count).slice(0, 80);
}
