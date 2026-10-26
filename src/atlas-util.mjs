// Shared helpers for adapters: every adapter turns some source into the same atlas.json schema
// (see AGENTS.md) under data/<name>/; screenshots (opt-in) go to data/<name>/screens/.
import { chromium } from 'playwright';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
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
export function tokenTally() {
  const t = {}, labels = {}, vars = new Map();
  const add = (key, value, n = 1, label) => {
    if (value == null || value === '') return;
    const m = (t[key] ||= new Map()); m.set(value, (m.get(value) || 0) + n);
    if (label) { const lm = (labels[key] ||= new Map()); (lm.get(value) || lm.set(value, new Set()).get(value)).add(label); }
  };
  const top = (key, n) => [...(t[key] || new Map())].sort((a, b) => b[1] - a[1]).slice(0, n).map(([value, count]) => {
    const l = labels[key]?.get(value); return l ? { value, count, label: [...l].slice(0, 4).join(', ') + (l.size > 4 ? ` +${l.size - 4}` : '') } : { value, count };
  });
  const finalize = () => ({ colors: top('colors', 80), fonts: top('fonts', 24), fontSizes: top('fontSizes', 32), fontWeights: top('fontWeights', 12),
    spacing: top('spacing', 40), radii: top('radii', 24), shadows: top('shadows', 20), cssVars: [...vars].map(([name, value]) => ({ name, value })).slice(0, 500) });
  return { add, cssVar: (name, value) => value != null && vars.set(name, String(value)), finalize };
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

export function writeAtlas(outDir, { project, tokens, screens = [] }, { screenshots = false } = {}) {
  const atlas = sanitize({ project: { created: new Date().toISOString(), pages: screens.length, ...project }, tokens, screens }, { screenshots });
  if (!screenshots) rmSync(path.join(outDir, 'screens'), { recursive: true, force: true });
  writeFileSync(path.join(outDir, 'atlas.json'), JSON.stringify(atlas, null, 0));
  return atlas;
}
