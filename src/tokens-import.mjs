// Design-token adapter: turns design-token JSON (one file, or a folder of .json files merged) into an atlas with no
// screens. Three shapes are read, detected per token leaf: W3C DTCG ($value/$type, type inherited from groups),
// Tokens Studio (value/type, top-level keys are token sets) and Style Dictionary (value only; the type is inferred
// from the path and the value). Aliases ({group.token}, {x.y.value}) are resolved across sets with a cycle guard;
// typed tokens feed the tallies and every token also becomes a cssVar.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { tokenTally, toHex, prepareOut, writeAtlas } from './atlas-util.mjs';

const isObj = v => v != null && typeof v === 'object' && !Array.isArray(v);
const readJson = f => JSON.parse(readFileSync(f, 'utf8').replace(/^﻿/, ''));
const deepMerge = (a, b) => { for (const [k, v] of Object.entries(b)) a[k] = isObj(v) && isObj(a[k]) ? deepMerge(a[k], v) : v; return a; };

// A folder is merged at the root (split Style Dictionary / DTCG files), unless it is a Tokens Studio multi-file export
// ($metadata.json / $themes.json present): then each file is a token set named by its relative path.
function load(src) {
  if (!statSync(src).isDirectory()) { const root = readJson(src); return { root, files: 1, studio: isObj(root) && ('$themes' in root || '$metadata' in root) }; }
  const files = [], walk = d => { for (const f of readdirSync(d).sort()) { const full = path.join(d, f); if (statSync(full).isDirectory()) walk(full); else if (f.endsWith('.json')) files.push(full); } };
  walk(src);
  const rel = f => path.relative(src, f).replace(/\\/g, '/').replace(/\.json$/, '');
  const studio = files.some(f => /^\$(metadata|themes)$/.test(rel(f))), root = {};
  for (const f of files) { const r = rel(f); if (r.startsWith('$')) continue; if (studio) root[r] = readJson(f); else deepMerge(root, readJson(f)); }
  return { root, files: files.length, studio };
}

// Token leaves in tree order. A plain `value` whose own children carry values is a group named "value", not a token.
const groupish = v => isObj(v) && Object.values(v).some(x => isObj(x) && ('value' in x || '$value' in x));
function collect(node, p, inherited, out) {
  for (const [k, v] of Object.entries(node)) {
    if (k.startsWith('$') || !isObj(v)) continue;
    const at = [...p, k];
    if ('$value' in v) out.push({ path: at, raw: v.$value, type: v.$type ?? inherited, fmt: 'dtcg' });
    else if ('value' in v && !groupish(v.value)) out.push({ path: at, raw: v.value, type: v.type, fmt: v.type ? 'tokens-studio' : 'style-dictionary', hint: [v.attributes?.category, v.attributes?.type] });
    else collect(v, at, v.$type ?? inherited, out);
  }
  return out;
}

// --- value helpers -------------------------------------------------------------------------------------------------
const alphaHex = a => Math.round(Math.max(0, Math.min(1, a)) * 255).toString(16).padStart(2, '0');
function colorHex(v) {
  if (!isObj(v)) return typeof v === 'string' ? toHex(v) : null;
  const a = v.alpha ?? 1;
  if (v.hex) { const h = toHex(v.hex); return h && h.length === 7 && a < 1 ? toHex(h + alphaHex(a)) : h; }
  if ((v.colorSpace || 'srgb') !== 'srgb' || !Array.isArray(v.components)) return null; // other spaces need a hex fallback
  const [r, g, b] = v.components.map(x => (typeof x === 'number' ? x : 0));
  return toHex({ r: Math.min(r, 1), g: Math.min(g, 1), b: Math.min(b, 1), a });
}
const colorCss = v => colorHex(v) ?? (isObj(v) ? `color(${v.colorSpace} ${(v.components || []).join(' ')}${(v.alpha ?? 1) < 1 ? ` / ${v.alpha}` : ''})` : v == null ? null : String(v));
const dim = v => v == null || v === '' ? null : isObj(v) ? (v.value == null ? null : `${v.value}${v.unit ?? 'px'}`) : typeof v === 'number' || /^-?[\d.]+$/.test(String(v).trim()) ? `${String(v).trim()}px` : String(v).trim();
const WEIGHTS = { thin: 100, hairline: 100, extralight: 200, ultralight: 200, light: 300, normal: 400, regular: 400, book: 400, medium: 500,
  semibold: 600, demibold: 600, bold: 700, extrabold: 800, ultrabold: 800, black: 900, heavy: 900, extrablack: 950, ultrablack: 950 };
const weight = v => typeof v === 'number' ? String(v) : typeof v !== 'string' ? null : /^\d+$/.test(v.trim()) ? v.trim()
  : WEIGHTS[v.toLowerCase().replace(/italic|oblique/g, '').replace(/[\s_-]+/g, '')]?.toString() ?? null;
const family = v => { const f = Array.isArray(v) ? v[0] : typeof v === 'string' ? v.split(',')[0] : null; return f == null ? null : String(f).trim().replace(/^['"]|['"]$/g, '') || null; };
const familyCss = v => Array.isArray(v) ? v.map(f => (/\s/.test(f) && !/^['"]/.test(f) ? `"${f}"` : f)).join(', ') : v == null ? null : String(v);
const shadowLayer = s => isObj(s) ? [s.inset || s.type === 'innerShadow' ? 'inset' : '', dim(s.offsetX ?? s.x ?? 0), dim(s.offsetY ?? s.y ?? 0), dim(s.blur ?? 0), dim(s.spread ?? 0), colorCss(s.color)].filter(Boolean).join(' ') : String(s);
const shadowCss = v => v == null ? null : Array.isArray(v) ? v.map(shadowLayer).join(', ') : shadowLayer(v);
const typoCss = v => v.fontSize != null && v.fontFamily != null
  ? [weight(v.fontWeight), dim(v.fontSize) + (v.lineHeight != null ? '/' + (isObj(v.lineHeight) ? dim(v.lineHeight) : v.lineHeight) : ''), familyCss(v.fontFamily)].filter(Boolean).join(' ')
  : JSON.stringify(v);
function cssOf(kind, v, type) {
  switch (kind) {
    case 'color': return colorCss(v);
    case 'fontFamily': return familyCss(v);
    case 'fontWeight': return weight(v) ?? String(v);
    case 'fontSize': case 'spacing': case 'radius': case 'dimension': return dim(v);
    case 'shadow': return shadowCss(v);
    case 'typography': return isObj(v) ? typoCss(v) : String(v);
  }
  if (Array.isArray(v)) return /cubicbezier/i.test(type || '') ? `cubic-bezier(${v.join(', ')})` : v.join(', ');
  if (isObj(v)) return 'width' in v && 'style' in v ? [dim(v.width), v.style, colorCss(v.color)].filter(Boolean).join(' ') : 'value' in v && 'unit' in v ? dim(v) : JSON.stringify(v);
  return String(v);
}

// --- typing ----------------------------------------------------------------------------------------------------------
const TYPES = { color: 'color', fontfamily: 'fontFamily', fontfamilies: 'fontFamily', fontweight: 'fontWeight', fontweights: 'fontWeight', fontsize: 'fontSize',
  fontsizes: 'fontSize', shadow: 'shadow', boxshadow: 'shadow', typography: 'typography', borderradius: 'radius', radius: 'radius', spacing: 'spacing', dimension: 'dimension', sizing: 'dimension' };
const RADIUS = /radius|radii|rounded|corner/, FONTSIZE = /font.?size|size\.font|text.?size/, SPACING = /spac|gap|padding|margin|inset|gutter/;
const looksColor = v => (typeof v === 'string' && /^(#|rgba?\()/i.test(v.trim())) || (isObj(v) && ('colorSpace' in v || 'hex' in v));
// Untyped (Style Dictionary) tokens: the path names the kind, the value shape confirms it.
const infer = (h, v) => isObj(v) ? (v.fontFamily != null || v.fontSize != null ? 'typography' : looksColor(v) ? 'color' : 'color' in v && ('offsetX' in v || 'x' in v) ? 'shadow' : null)
  : Array.isArray(v) ? (v.length && v.every(x => isObj(x) && 'color' in x) ? 'shadow' : null)
  : /colou?r/.test(h) && colorHex(v) && !/^[\d.]+$/.test(String(v)) ? 'color'
  : /shadow|elevation/.test(h) ? 'shadow' : RADIUS.test(h) ? 'radius' : FONTSIZE.test(h) ? 'fontSize'
  : /famil|typeface/.test(h) ? 'fontFamily' : /weight/.test(h) ? 'fontWeight' : SPACING.test(h) ? 'spacing' : looksColor(v) ? 'color' : null;
function kindOf(l) {
  const h = [...(l.hint || []), ...l.path].filter(Boolean).join('.').toLowerCase();
  const k = l.type != null ? TYPES[String(l.type).toLowerCase()] ?? null : l.via?.kind ?? infer(h, l.value);
  return k === 'dimension' ? (RADIUS.test(h) ? 'radius' : FONTSIZE.test(h) ? 'fontSize' : SPACING.test(h) ? 'spacing' : 'dimension') : k;
}

export async function importTokens({ source, outDir }) {
  prepareOut(outDir);
  const { root, files, studio } = load(source);
  const leaves = collect(root, [], root.$type, []);
  const byPath = new Map(leaves.map(l => [l.path.join('.'), l]));
  const sets = Object.keys(root).filter(k => !k.startsWith('$'));
  // Exact path first, then {x.y.value} without its suffix, then (Tokens Studio) the same path inside own set / any set.
  const find = (ref, own) => {
    const r = ref.trim(), refs = r.endsWith('.value') ? [r, r.slice(0, -6)] : [r];
    for (const x of refs) for (const k of [x, `${own}.${x}`, ...sets.map(s => `${s}.${x}`)]) if (byPath.has(k)) return byPath.get(k);
  };
  const FAIL = Symbol('unresolved');
  const target = (ref, l) => { const t = find(ref, l.path[0]); if (!t || !resolve(t).ok) throw FAIL; return t; };
  const sub = (v, l) => typeof v === 'string' ? (/^\{[^{}]+\}$/.test(v.trim()) ? target(v.trim().slice(1, -1), l).value : v.replace(/\{([^{}]+)\}/g, (_, r) => target(r, l).css))
    : Array.isArray(v) ? v.map(x => sub(x, l)) : isObj(v) ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, sub(x, l)])) : v;
  function resolve(l) {
    if (l.done) return l;
    if (l.busy) throw FAIL; // cycle
    l.busy = true;
    try {
      const whole = typeof l.raw === 'string' && /^\{([^{}]+)\}$/.exec(l.raw.trim());
      if (whole) { const t = target(whole[1], l); l.value = t.value; l.type ??= t.type; l.via = t; } else l.value = sub(l.raw, l);
      l.ok = true;
    } catch (e) { if (e !== FAIL) throw e; l.ok = false; }
    l.busy = false; l.done = true;
    if (l.ok) { l.kind = kindOf(l); l.css = cssOf(l.kind, l.value, l.type); } else l.css = typeof l.raw === 'string' ? l.raw : JSON.stringify(l.raw);
    return l;
  }

  const { add, cssVar, finalize } = tokenTally();
  for (const l of leaves) {
    resolve(l);
    cssVar('--' + l.path.join('-').replace(/[^\w-]+/g, '-'), l.css);
    if (!l.ok) continue;
    const label = l.path.join('.'), v = l.value, put = (key, val) => add(key, val, 1, label);
    if (l.kind === 'color') put('colors', colorHex(v));
    else if (l.kind === 'fontFamily') put('fonts', family(v));
    else if (l.kind === 'fontWeight') put('fontWeights', weight(v));
    else if (l.kind === 'fontSize') put('fontSizes', dim(v));
    else if (l.kind === 'spacing') put('spacing', dim(v));
    else if (l.kind === 'radius') put('radii', dim(v));
    else if (l.kind === 'shadow') put('shadows', shadowCss(v));
    else if (l.kind === 'typography' && isObj(v)) { put('fonts', family(v.fontFamily)); put('fontSizes', dim(v.fontSize)); put('fontWeights', weight(v.fontWeight)); }
  }

  const fmts = new Set(leaves.map(l => (studio && l.fmt === 'style-dictionary' ? 'tokens-studio' : l.fmt)));
  const unresolved = leaves.filter(l => !l.ok).map(l => l.path.join('.'));
  const notes = [`${leaves.length} tokens from ${files} file${files === 1 ? '' : 's'}`];
  if (unresolved.length) notes.push(`${unresolved.length} unresolved alias${unresolved.length === 1 ? '' : 'es'} (kept raw in cssVars): ${unresolved.slice(0, 8).join(', ')}${unresolved.length > 8 ? ', …' : ''}`);
  const base = path.basename(path.resolve(source));
  return writeAtlas(outDir, {
    project: { name: statSync(source).isDirectory() ? base : base.replace(/\.json$/i, ''), kind: 'tokens', source: base,
      format: fmts.size > 1 ? 'mixed' : [...fmts][0] ?? null, notes },
    tokens: finalize(), screens: [],
  });
}
