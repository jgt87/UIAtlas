// Compare an atlas (target) against a reference atlas: brand check (is a site using the brand's tokens?) or drift
// (the same atlas now vs an earlier snapshot in <atlasDir>/history/). Pure apart from latestSnapshot(); the report
// carries token values and atlas names only, never content.
//
// Colours are compared in CIELAB with CIEDE2000. A target colour within `deltaE` (default 3) of a reference colour is
// matched (exact when the hex is identical, else near); alpha differences add 1 ΔE per 1% opacity. The same
// threshold finds near-duplicates within the target: #e0e0e0/#e2e2e2 is ~0.5, #e0e0e0/#e8e8e8 ~1.8, #e0e0e0/#f0f0f0 ~3.5
// (ΔE00 is less sensitive in light greys than CIE76). Pass `dupDeltaE` to tune that separately.
// Dimensions are normalised to px (rem = 16px, pt = 4/3px, in = 96px); unparseable values (50%, shorthands) compare as strings.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { colorValue, dimensionValue } from './tokens-json.mjs';

const r2 = v => Math.round(v * 100) / 100;
const cnt = x => Number(x.count) || 1;
const str = v => String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

// --- colour -------------------------------------------------------------------------------------------------
function lab(hex) {
  const c = colorValue(hex); if (!c) return null;
  const [r, g, b] = c.components.map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const f = t => t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116;
  const x = f((0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047), y = f(0.2126729 * r + 0.7151522 * g + 0.0721750 * b),
    z = f((0.0193339 * r + 0.1191920 * g + 0.9503041 * b) / 1.08883);
  return { L: 116 * y - 16, a: 500 * (x - y), b: 200 * (y - z), alpha: c.alpha ?? 1, hex: c.hex + (c.alpha != null ? hex.slice(7, 9).toLowerCase() : '') };
}

export function deltaE2000(p, q) {
  const rad = Math.PI / 180, { cos, sin, sqrt, atan2, abs, exp } = Math;
  const C1 = sqrt(p.a ** 2 + p.b ** 2), C2 = sqrt(q.a ** 2 + q.b ** 2), Cm = (C1 + C2) / 2;
  const G = 0.5 * (1 - sqrt(Cm ** 7 / (Cm ** 7 + 25 ** 7))), a1 = p.a * (1 + G), a2 = q.a * (1 + G);
  const c1 = sqrt(a1 ** 2 + p.b ** 2), c2 = sqrt(a2 ** 2 + q.b ** 2);
  const hue = (b, a) => { const h = atan2(b, a) / rad; return h < 0 ? h + 360 : h; }, h1 = hue(p.b, a1), h2 = hue(q.b, a2);
  const dL = q.L - p.L, dC = c2 - c1;
  let dh = c1 * c2 === 0 ? 0 : h2 - h1; if (dh > 180) dh -= 360; else if (dh < -180) dh += 360;
  const dH = 2 * sqrt(c1 * c2) * sin(dh * rad / 2), Lm = (p.L + q.L) / 2, cm = (c1 + c2) / 2;
  let hm = h1 + h2; if (c1 * c2 !== 0) hm = abs(h1 - h2) > 180 ? (hm < 360 ? hm + 360 : hm - 360) / 2 : hm / 2;
  const T = 1 - 0.17 * cos((hm - 30) * rad) + 0.24 * cos(2 * hm * rad) + 0.32 * cos((3 * hm + 6) * rad) - 0.2 * cos((4 * hm - 63) * rad);
  const SL = 1 + 0.015 * (Lm - 50) ** 2 / sqrt(20 + (Lm - 50) ** 2), SC = 1 + 0.045 * cm, SH = 1 + 0.015 * cm * T;
  const RT = -2 * sqrt(cm ** 7 / (cm ** 7 + 25 ** 7)) * sin(60 * exp(-(((hm - 275) / 25) ** 2)) * rad);
  return sqrt((dL / SL) ** 2 + (dC / SC) ** 2 + (dH / SH) ** 2 + RT * (dC / SC) * (dH / SH));
}
const dist = (p, q) => deltaE2000(p, q) + 100 * Math.abs(p.alpha - q.alpha);
// Distance between two hex colours (null when either is unreadable).
export const colorDistance = (a, b) => { const p = lab(a), q = lab(b); return p && q ? r2(dist(p, q)) : null; };

function compareColors(target = [], reference = [], deltaE, dupDeltaE) {
  const refs = reference.map(c => ({ value: c.value, lab: lab(c.value) })).filter(c => c.lab);
  const tl = target.map(c => ({ ...c, lab: lab(c.value) }));
  const matched = [], offBrand = [], used = new Set();
  for (const c of tl) {
    let best = null;
    if (c.lab) for (const r of refs) { const d = r.lab.hex === c.lab.hex ? 0 : dist(c.lab, r.lab); if (!best || d < best.d) best = { r, d }; }
    const usage = c.usage ? { usage: c.usage } : {};
    if (best && best.d <= deltaE) { used.add(best.r.value); matched.push({ value: c.value, count: cnt(c), ref: best.r.value, exact: best.d === 0, deltaE: r2(best.d), ...usage }); }
    else offBrand.push({ value: c.value, count: cnt(c), ...usage, nearest: best ? { value: best.r.value, deltaE: r2(best.d) } : null });
  }
  const nearDuplicates = [];
  for (let i = 0; i < tl.length; i++) for (let j = i + 1; j < tl.length; j++) {
    const p = tl[i].lab, q = tl[j].lab; if (!p || !q || p.hex === q.hex) continue;
    const d = dist(p, q); if (d < dupDeltaE) nearDuplicates.push({ a: tl[i].value, b: tl[j].value, deltaE: r2(d) });
  }
  const desc = (a, b) => b.count - a.count;
  return { matched: matched.sort(desc), offBrand: offBrand.sort(desc), unused: reference.filter(c => !used.has(c.value)).map(c => ({ value: c.value })),
    nearDuplicates: nearDuplicates.sort((a, b) => a.deltaE - b.deltaE) };
}

// --- other token lists: normalise to a key, then exact match -------------------------------------------------
const px = v => { const d = dimensionValue(v); return d ? r2(d.unit === 'rem' ? d.value * 16 : d.value) : null; };
const dimKey = v => { const n = px(v); return n != null ? `${n}px` : str(v); };
const WEIGHTS = { thin: 100, hairline: 100, 'extra-light': 200, extralight: 200, light: 300, normal: 400, regular: 400, medium: 500,
  'semi-bold': 600, semibold: 600, bold: 700, 'extra-bold': 800, extrabold: 800, black: 900, heavy: 900 };
const NORM = {
  fonts: v => str(String(v).split(',')[0]).replace(/^["']|["']$/g, ''),
  fontWeights: v => { const n = Number(v); return Number.isFinite(n) ? String(n) : String(WEIGHTS[str(v)] ?? str(v)); },
  lineHeights: v => /^\s*-?\d*\.?\d+\s*$/.test(String(v)) ? String(r2(parseFloat(v))) : dimKey(v),
  fontSizes: dimKey, radii: dimKey, spacing: dimKey, letterSpacings: dimKey,
};
const LISTS = Object.keys(NORM);

function compareList(key, target = [], reference = []) {
  const norm = NORM[key], refByKey = new Map(), used = new Set();
  for (const r of reference) if (!refByKey.has(norm(r.value))) refByKey.set(norm(r.value), r.value);
  const matched = [], missing = [];
  for (const t of target) {
    const k = norm(t.value), ref = refByKey.get(k);
    if (ref != null) { used.add(k); matched.push({ value: t.value, count: cnt(t), ref, exact: String(t.value).trim() === String(ref).trim() }); continue; }
    const m = { value: t.value, count: cnt(t) }, n = key === 'fonts' ? null : parseFloat(k); // numeric keys: say how far off the nearest is
    if (Number.isFinite(n) && /^-?[\d.]+(px)?$/.test(k)) {
      let best = null; for (const [rk, rv] of refByKey) { const rn = parseFloat(rk); if (/^-?[\d.]+(px)?$/.test(rk) && (!best || Math.abs(rn - n) < best.diff)) best = { value: rv, diff: r2(Math.abs(rn - n)) }; }
      if (best) m.nearest = best;
    }
    missing.push(m);
  }
  const desc = (a, b) => b.count - a.count;
  return { matched: matched.sort(desc), missing: missing.sort(desc), unused: reference.filter(r => !used.has(norm(r.value))).map(r => ({ value: r.value })) };
}

const meta = a => ({ name: a?.project?.name ?? null, kind: a?.project?.kind ?? null, created: a?.project?.created ?? null });
const sum = l => l.reduce((s, x) => s + x.count, 0);

export function compareAtlases(target, reference, { deltaE = 3, dupDeltaE = deltaE } = {}) {
  const tt = target?.tokens || {}, rt = reference?.tokens || {};
  const report = { target: meta(target), reference: meta(reference), options: { deltaE, dupDeltaE, colorDistance: 'CIEDE2000' },
    colors: compareColors(tt.colors || [], rt.colors || [], deltaE, dupDeltaE) };
  for (const k of LISTS) report[k] = compareList(k, tt[k] || [], rt[k] || []);
  const scores = {}; let hit = 0, all = 0;
  for (const k of ['colors', ...LISTS]) {
    const m = sum(report[k].matched), t = m + sum(report[k].offBrand || report[k].missing);
    hit += m; all += t; scores[k] = t ? r2(m / t) : null;
  }
  const c = report.colors;
  report.summary = { score: all ? r2(hit / all) : 1, scores,
    exactColors: c.matched.filter(x => x.exact).length, nearColors: c.matched.filter(x => !x.exact).length, offBrandColors: c.offBrand.length,
    unusedColors: c.unused.length, nearDuplicateColors: c.nearDuplicates.length,
    ...Object.fromEntries(LISTS.map(k => [`missing${k[0].toUpperCase()}${k.slice(1)}`, report[k].missing.length])) };
  return report;
}

export function formatReport(r, { top = 5 } = {}) {
  const s = r.summary, pct = v => v == null ? '-' : `${Math.round(v * 100)}%`, who = m => `${m.name ?? '?'} (${m.kind ?? '?'})`;
  const out = [`${who(r.target)} vs ${who(r.reference)}`, `Score: ${pct(s.score)} of token usage matches the reference`,
    `Colours: ${s.exactColors} exact, ${s.nearColors} near, ${s.offBrandColors} off-brand, ${s.nearDuplicateColors} near-duplicate pairs (ΔE00 < ${r.options.dupDeltaE})`];
  for (const c of r.colors.offBrand.slice(0, top)) out.push(`  off-brand ${c.value} x${c.count}` + (c.nearest ? ` -> nearest ${c.nearest.value} (ΔE ${c.nearest.deltaE})` : ''));
  for (const d of r.colors.nearDuplicates.slice(0, top)) out.push(`  near-dup  ${d.a} ~ ${d.b} (ΔE ${d.deltaE})`);
  for (const k of LISTS) {
    const l = r[k]; if (!l.matched.length && !l.missing.length && !l.unused.length) continue;
    const miss = l.missing.slice(0, top).map(m => m.value + (m.nearest ? ` (~${m.nearest.value})` : '')).join(', ');
    out.push(`${k}: ${pct(s.scores[k])} matched, ${l.missing.length} not in reference${miss ? ': ' + miss : ''}`);
  }
  return out.join('\n');
}

// Newest snapshot in <atlasDir>/history/ (file names are ISO timestamps with ':' -> '-', so they sort by name), or null.
export function latestSnapshot(atlasDir) {
  let files; try { files = readdirSync(path.join(atlasDir, 'history')).filter(f => f.endsWith('.json')).sort().reverse(); } catch { return null; }
  for (const f of files) { try { return JSON.parse(readFileSync(path.join(atlasDir, 'history', f), 'utf8')); } catch { /* unreadable: try older */ } }
  return null;
}
