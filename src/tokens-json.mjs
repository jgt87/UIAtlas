import { clusterComponents } from './components.mjs';

// Structured design-tokens JSON (W3C Design Tokens Format, 2025.10) built from an atlas, plus CSS variables
// generated from the same structure. Pure functions, no Node APIs.
//
// Layout: primitives (color, font.family/size/weight/lineHeight/letterSpacing, spacing, radius, shadow), then
// derived layers that reference them by alias — color-usage (text/background/border/fill colours ranked primary,
// secondary, ...), typography (most common type style per element role) and component (most common background/
// text colour/border/radius/type/padding per style variant of each role) — then the source's own declared variables. Usage counts live under
// $extensions["ui-atlas"]. Like every export, it carries tokens only: no source name or text.

const EXT = 'ui-atlas';
const WEIGHT_NAMES = { 100: 'thin', 200: 'extra-light', 300: 'light', 400: 'regular', 500: 'medium', 600: 'semi-bold', 700: 'bold', 800: 'extra-bold', 900: 'black' };
const RANKS = ['primary', 'secondary', 'tertiary', 'quaternary', 'quinary', 'senary']; // words, not 4/5/6: integer-like keys would sort first
const SEMANTIC_HINT = /brand|primary|secondary|accent|text|background|surface|border|focus|link|error|success|warning|info/;
const USE_HINT = { text: /text|fg|foreground|ink/, background: /background|bg|surface|layer|canvas/, border: /border|outline|divider|stroke/, fill: /icon|fill|graphic/ };
const name = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'token'; // no '.', '{', '}' in names
const r4 = v => Math.round(v * 10000) / 10000;
const ext = o => ({ $extensions: { [EXT]: o } });

export function colorValue(hex) {
  const m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(hex || ''); if (!m) return null;
  const n = parseInt(m[1], 16), alpha = m[2] ? r4(parseInt(m[2], 16) / 255) : 1;
  return { colorSpace: 'srgb', components: [n >> 16, (n >> 8) & 255, n & 255].map(c => r4(c / 255)), ...(alpha < 1 ? { alpha } : {}), hex: '#' + m[1].toLowerCase() };
}

// The format only knows px and rem: pt and in are converted to px (the original stays in $extensions); %, em and
// multi-value shorthands have no dimension form and return null.
export function dimensionValue(v) {
  const m = /^\s*(-?\d*\.?\d+)\s*(px|rem|pt|in)?\s*$/i.exec(String(v ?? '')); if (!m) return null;
  const n = parseFloat(m[1]), u = (m[2] || 'px').toLowerCase();
  return u === 'rem' ? { value: n, unit: 'rem' } : { value: r4(u === 'pt' ? n * 4 / 3 : u === 'in' ? n * 96 : n), unit: 'px' };
}

// CSS box-shadow text (any order of colour and lengths, layers comma-separated) -> shadow value(s).
export function shadowValue(css) {
  const layers = String(css).split(/,(?![^(]*\))/).map(shadowLayer).filter(Boolean);
  return layers.length ? (layers.length === 1 ? layers[0] : layers) : null;
}
const px = value => ({ value, unit: 'px' });
// a layer's colour (black when it names none) and its lengths; the colour is cut out first so its digits aren't lengths
function shadowParts(l) {
  const colorM = /(rgba?\([^)]*\)|#[0-9a-f]{3,8}\b)/i.exec(l), lens = l.replace(colorM?.[0] || '', '').match(/-?\d*\.?\d+(px)?/g) || [];
  return { c: colorM ? toHex(colorM[0]) : '#000000', lens: lens.map(parseFloat) };
}
function shadowLayer(l) {
  const { c, lens: [x = 0, y = 0, blur = 0, spread = 0] } = shadowParts(l);
  return c && { color: colorValue(c), offsetX: px(x), offsetY: px(y), blur: px(blur), spread: px(spread), ...(/\binset\b/.test(l) ? { inset: true } : {}) };
}
function toHex(c) {
  const m = /^#([0-9a-f]{3,8})$/i.exec(c); if (m) return '#' + (m[1].length <= 4 ? [...m[1]].map(x => x + x).join('') : m[1]).toLowerCase();
  const p = /rgba?\(([^)]*)\)/i.exec(c)?.[1].split(/[\s,/]+/).filter(Boolean).map(Number); if (!p) return null;
  const h = v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return '#' + h(p[0]) + h(p[1]) + h(p[2]) + (p[3] != null && p[3] < 1 ? h(p[3] * 255) : '');
}

// Most common combination of the given element fields per role, across all screens.
function perRole(atlas, fields, keep) {
  const by = new Map();
  for (const s of atlas.screens || []) for (const e of s.elements || []) {
    if (!keep(e)) continue;
    const key = JSON.stringify(fields.map(f => e[f] ?? null)), m = by.get(e.role) || by.set(e.role, new Map()).get(e.role);
    m.set(key, (m.get(key) || 0) + 1);
  }
  return [...by].map(([role, m]) => { const [key, count] = [...m].sort((a, b) => b[1] - a[1])[0]; const total = [...m.values()].reduce((a, b) => a + b, 0);
    return { role, count, total, ...Object.fromEntries(fields.map((f, i) => [f, JSON.parse(key)[i]])) }; });
}

const unique = (g, n) => { let k = n, i = 2; while (g[k]) k = `${n}-${i++}`; return k; };
const usage = x => ext({ count: x.count, ...(x.share != null ? { share: x.share } : {}) });
const alias = (map, v, lit) => map.get(v) || lit(v);
const colorRef = (refs, hex) => refs.color.get(hex) || colorValue(hex);

// Palette names: the source's label, else the name of a variable the source declared with that exact colour
// (preferring names that say what it is for, then the shortest), else the hex digits.
function declaredColors(cssVars) {
  const declared = new Map();
  for (const v of cssVars || []) { const h = /^#[0-9a-f]{6}$/i.test(v.value.trim()) ? v.value.trim().toLowerCase() : null; if (h) (declared.get(h) || declared.set(h, []).get(h)).push(v.name.replace(/^--/, '')); }
  return declared;
}
// score: names matching the colour's main use first, then any semantic hint, then the shortest
function declaredName(declared, h, usage) {
  const main = Object.entries(usage || {}).sort((a, b) => b[1] - a[1])[0]?.[0], hint = USE_HINT[main];
  const score = n => (hint?.test(n) ? 2 : 0) + (SEMANTIC_HINT.test(n) ? 1 : 0);
  return (declared.get(h) || []).sort((a, b) => score(b) - score(a) || a.length - b.length)[0];
}
const colorName = (c, declared) => name((c.label || '').split(/,| · /)[0].trim() || declaredName(declared, c.value, c.usage) || c.value.slice(1, 7));

// Primitives. Each builder fills b.out (and b.refs, for the derived layers' aliases) and records values with no
// token form in b.skipped; they run in a fixed order, which is the order of groups in the output.
function colorPrimitives({ t, out, refs, skipped }) {
  if (!t.colors?.length) return;
  const declared = declaredColors(t.cssVars), g = out.color = { $type: 'color' };
  for (const c of t.colors) {
    const v = colorValue(c.value); if (!v) { skipped.push(c.value); continue; }
    const k = unique(g, colorName(c, declared)); refs.color.set(c.value, `{color.${k}}`);
    g[k] = { $value: v, ...(c.label ? { $description: c.label } : {}), ...ext({ count: c.count, ...(c.share != null ? { share: c.share } : {}), ...(c.usage ? { usage: c.usage } : {}) }) };
  }
}
function dimGroup({ skipped }, list, refMap, desc) {
  const g = { $type: 'dimension' };
  for (const d of [...list].sort((a, b) => (dimensionValue(a.value)?.value ?? 0) - (dimensionValue(b.value)?.value ?? 0))) {
    const v = dimensionValue(d.value); if (!v) { skipped.push(d.value); continue; }
    const k = unique(g, name(d.value)); refMap?.set(d.value, `{${desc}.${k}}`);
    g[k] = { $value: v, ...ext({ count: d.count, ...(String(d.value).trim() !== `${v.value}${v.unit}` ? { source: d.value } : {}) }) };
  }
  return Object.keys(g).length > 1 ? g : null;
}
function familyGroup({ t, refs }) {
  const g = { $type: 'fontFamily' };
  for (const f of t.fonts) { const k = unique(g, name(f.value)); refs.family.set(f.value, `{font.family.${k}}`); g[k] = { $value: f.value, ...usage(f) }; }
  return g;
}
function weightGroup({ t, refs }) {
  const g = { $type: 'fontWeight' };
  for (const w of [...t.fontWeights].sort((a, b) => Number(a.value) - Number(b.value))) {
    const n = Number(w.value), k = unique(g, WEIGHT_NAMES[n] || name(w.value));
    refs.weight.set(String(w.value), `{font.weight.${k}}`); g[k] = { $value: Number.isFinite(n) ? n : w.value, ...usage(w) };
  }
  return g;
}
function lineHeightGroup({ t, refs, skipped }) {
  const g = { $type: 'number' }; // unitless: a ratio of the font size
  for (const l of [...t.lineHeights].sort((a, b) => parseFloat(a.value) - parseFloat(b.value))) {
    const n = parseFloat(l.value); if (!Number.isFinite(n)) { skipped.push(`line-height ${l.value}`); continue; }
    const k = unique(g, name(l.value)); refs.lineHeight.set(String(l.value), `{font.lineHeight.${k}}`); g[k] = { $value: n, ...usage(l) };
  }
  return Object.keys(g).length > 1 ? g : null;
}
// [group under font, list in atlas.tokens, builder]; in output order. A builder returning null left nothing representable.
const FONT_GROUPS = [
  ['family', 'fonts', familyGroup],
  ['size', 'fontSizes', b => dimGroup(b, b.t.fontSizes, b.refs.size, 'font.size')],
  ['weight', 'fontWeights', weightGroup],
  ['lineHeight', 'lineHeights', lineHeightGroup],
  ['letterSpacing', 'letterSpacings', b => dimGroup(b, b.t.letterSpacings, b.refs.letterSpacing, 'font.letterSpacing')],
];
function fontPrimitives(b) {
  const font = {};
  for (const [k, list, build] of FONT_GROUPS) { const g = b.t[list]?.length && build(b); if (g) font[k] = g; }
  if (Object.keys(font).length) b.out.font = font;
}
function shadowPrimitives({ t, out, skipped }) {
  if (!t.shadows?.length) return;
  const g = { $type: 'shadow' };
  t.shadows.forEach((s, i) => { const v = shadowValue(s.value); if (v) g[String(i + 1)] = { $value: v, ...ext({ count: s.count, css: s.value }) }; else skipped.push(s.value); });
  if (Object.keys(g).length > 1) out.shadow = g;
}

// Derived layers: aliases into the primitives where the value is one of them, else the literal value.
// color-usage: per kind of use, the colours most used that way (at least 2% of that use), ranked.
const USE_KINDS = { text: 'text', background: 'background', border: 'border', fill: 'fill' };
// palette colours per known kind of use, with how often each is used that way
function usesByKind({ t, refs }) {
  const byUse = {};
  for (const c of t.colors || []) for (const [k, n] of Object.entries(c.usage || {})) if (USE_KINDS[k] && refs.color.has(c.value)) (byUse[k] ||= []).push({ value: c.value, n });
  return byUse;
}
function colorUsage(b) {
  const { out, refs } = b;
  for (const [k, list] of Object.entries(usesByKind(b))) {
    const total = list.reduce((a, x) => a + x.n, 0), ranked = list.filter(x => x.n / total >= 0.02).sort((a, b) => b.n - a.n).slice(0, 6);
    if (!ranked.length) continue;
    const g = ((out['color-usage'] ||= {})[USE_KINDS[k]] = { $type: 'color' });
    ranked.forEach((x, i) => { g[RANKS[i]] = { $value: refs.color.get(x.value), ...ext({ count: x.n, share: r4(x.n / total) }) }; });
  }
}
// typography: the most common type style per element role
const weightLit = v => Number(v) || 400; // a weight with no number reads as regular
// line height and letter spacing are optional parts of a type style: null when absent or with no token form
const lineHeightPart = (refs, lh) => lh != null && Number.isFinite(parseFloat(lh)) ? alias(refs.lineHeight, String(lh), v => parseFloat(v)) : null;
const letterSpacingPart = (refs, ls) => ls != null && dimensionValue(ls) ? alias(refs.letterSpacing, ls, dimensionValue) : null;
function typeStyle(refs, r, fallbackFont) {
  const fam = r.font || fallbackFont, size = dimensionValue(r.fontSize); if (!fam || !size) return null;
  const lh = lineHeightPart(refs, r.lineHeight), ls = letterSpacingPart(refs, r.letterSpacing);
  return { fontFamily: alias(refs.family, fam, v => v), fontSize: alias(refs.size, r.fontSize, () => size), fontWeight: alias(refs.weight, String(r.weight ?? 400), weightLit),
    ...(lh != null ? { lineHeight: lh } : {}), ...(ls ? { letterSpacing: ls } : {}) };
}
function typography({ t, out, refs }, atlas) {
  const rows = perRole(atlas, ['font', 'fontSize', 'weight', 'lineHeight', 'letterSpacing'], e => e.fontSize && e.role !== 'image'); // images carry no type
  if (!rows.length) return;
  const g = out.typography = { $type: 'typography' }, fallbackFont = t.fonts?.[0]?.value;
  for (const r of rows.sort((a, b) => b.total - a.total)) {
    const v = typeStyle(refs, r, fallbackFont); if (!v) continue;
    g[unique(g, name(r.role))] = { $value: v, ...ext({ role: r.role, samples: r.total, share: r4(r.count / r.total) }) };
  }
}
// component: style variants per role (see components.mjs), each property aliased into the primitives where it is one
const paddingPart = (padding, i) => { const d = dimensionValue(padding.split(' ')[i]); return d?.value ? d : undefined; }; // "block inline"; zero is no padding
// [property, style field, $type, value]; in output order. A value of undefined means no token for that property; a
// colour that doesn't parse still gets one (with a null value), as it always has.
const COMPONENT_PROPS = [
  ['background', 'bg', 'color', colorRef],
  ['text', 'color', 'color', colorRef],
  ['border', 'border', 'color', colorRef],
  ['radius', 'radius', 'dimension', (refs, v) => refs.radius.get(v) || dimensionValue(v) || undefined],
  ['font-size', 'fontSize', 'dimension', (refs, v) => dimensionValue(v) ? alias(refs.size, v, dimensionValue) : undefined],
  ['font-weight', 'weight', 'fontWeight', (refs, v) => alias(refs.weight, String(v), weightLit)],
  ['padding-block', 'padding', 'dimension', (refs, v) => paddingPart(v, 0)],
  ['padding-inline', 'padding', 'dimension', (refs, v) => paddingPart(v, 1)],
];
function componentStyle(refs, st) {
  const c = {};
  for (const [prop, field, $type, value] of COMPONENT_PROPS) {
    const v = st[field] ? value(refs, st[field]) : undefined;
    if (v !== undefined) c[prop] = { $type, $value: v };
  }
  return c;
}
const pageBackground = colors => [...(colors || [])].filter(c => c.usage?.background).sort((a, b) => b.usage.background - a.usage.background)[0]?.value;
function componentTokens({ t, out, refs }, atlas) {
  const variants = atlas.components || clusterComponents(atlas.screens, { pageBg: pageBackground(t.colors) });
  for (const [role, list] of Object.entries(variants)) for (const v of list) {
    const c = componentStyle(refs, v.style);
    if (Object.keys(c).length) ((out.component ||= {})[name(role)] ||= {})[name(v.name)] = { ...c, ...ext({ count: v.count, share: v.share, screens: v.screens }) };
  }
}

// The source's declared variables (CSS custom properties, theme slots, token paths), typed where possible.
function colorSource(refs, val) {
  const hex = /^(#[0-9a-f]{3,8}|rgba?\([^)]*\))$/i.test(val) && toHex(val), c = hex && colorValue(hex);
  return c && { $type: 'color', $value: refs.color.get(hex) || c };
}
const dimensionSource = (refs, val) => { const d = /[a-z]$/i.test(val) && dimensionValue(val); return d && { $type: 'dimension', $value: d }; }; // a dimension needs a unit
// unitless: a weight (when the name says so and it is in range), else a line height, ratio...
function numberSource(refs, val, varName) {
  if (!/^-?\d*\.?\d+$/.test(val)) return null;
  const n = parseFloat(val);
  return /weight/i.test(varName) && n >= 1 && n <= 1000 ? { $type: 'fontWeight', $value: n } : { $type: 'number', $value: n };
}
const SOURCE_TYPES = [colorSource, dimensionSource, numberSource]; // tried in order: the first that reads the value types it
function sourceToken(refs, v) {
  const val = v.value.trim();
  for (const read of SOURCE_TYPES) { const tok = read(refs, val, v.name); if (tok) return tok; }
  return null;
}
function sourceVariables({ t, out, refs }) {
  const vars = (t.cssVars || []).filter(v => !/^\s*["']/.test(v.value));
  if (!vars.length) return;
  const g = out.source = {}, raw = {};
  for (const v of vars) {
    const k = unique(g, name(v.name.replace(/^--/, ''))), tok = sourceToken(refs, v);
    if (tok) g[k] = tok; else raw[v.name] = v.value;
  }
  if (Object.keys(raw).length) g.$extensions = { [EXT]: { untyped: raw } };
}

export function buildTokens(atlas, { exported = new Date().toISOString() } = {}) {
  const refs = { color: new Map(), size: new Map(), family: new Map(), weight: new Map(), radius: new Map(), lineHeight: new Map(), letterSpacing: new Map() };
  const b = { t: atlas.tokens, out: {}, refs, skipped: [] }; // skipped: values with no token form in the format, e.g. 50% or per-corner radii, em sizes
  colorPrimitives(b);
  fontPrimitives(b);
  const spacing = b.t.spacing?.length && dimGroup(b, b.t.spacing, null, 'spacing'); if (spacing) b.out.spacing = spacing;
  const radius = b.t.radii?.length && dimGroup(b, b.t.radii, refs.radius, 'radius'); if (radius) b.out.radius = radius;
  shadowPrimitives(b);
  colorUsage(b);
  typography(b, atlas);
  componentTokens(b, atlas);
  sourceVariables(b);
  return { $description: 'Design tokens extracted by UI Atlas', ...b.out,
    $extensions: { [EXT]: { format: 'https://www.designtokens.org/tr/2025.10/format/', exported, ...(b.skipped.length ? { unrepresentable: b.skipped } : {}) } } };
}

// Walk a token tree: yields { path: [...], token } for every node with a $value; $type is inherited from groups.
export function* walkTokens(node, path = [], type) {
  for (const [k, v] of Object.entries(node)) {
    if (k[0] === '$' || !v || typeof v !== 'object') continue;
    const tp = v.$type || type;
    if ('$value' in v) yield { path: [...path, k], type: tp, value: v.$value };
    else yield* walkTokens(v, [...path, k], tp);
  }
}

const cssRef = a => `var(--${a.slice(1, -1).split('.').join('-')})`;
export function cssValue(type, v) {
  if (typeof v === 'string' && /^\{[^}]+\}$/.test(v)) return cssRef(v);
  if (type === 'color') return v.hex + (v.alpha != null && v.alpha < 1 ? Math.round(v.alpha * 255).toString(16).padStart(2, '0') : '');
  if (type === 'dimension') return `${v.value}${v.unit}`;
  if (type === 'fontFamily') return /\s/.test(v) ? `"${v}"` : v;
  if (type === 'shadow') return [].concat(v).map(s => `${s.inset ? 'inset ' : ''}${s.offsetX.value}px ${s.offsetY.value}px ${s.blur.value}px ${s.spread.value}px ${cssValue('color', s.color)}`).join(', ');
  return String(v);
}

// CSS has no composite type style: a typography token becomes one variable per part it has, [suffix, part, $type]
const TYPE_PARTS = [['font-family', 'fontFamily', 'fontFamily'], ['font-size', 'fontSize', 'dimension'], ['font-weight', 'fontWeight', 'fontWeight'], ['line-height', 'lineHeight', 'number'], ['letter-spacing', 'letterSpacing', 'dimension']];
const typographyVars = (base, value) => TYPE_PARTS.filter(([, sub]) => value[sub] != null).map(([p, sub, type]) => `  --${base}-${p}: ${cssValue(type, value[sub])};`);
export function toCssVars(tokens) {
  const lines = [];
  for (const { path, type, value } of walkTokens(tokens)) {
    const base = path.join('-');
    if (type === 'typography') lines.push(...typographyVars(base, value)); else lines.push(`  --${base}: ${cssValue(type, value)};`);
  }
  return `/* Design tokens, extracted by UI Atlas */\n:root {\n${lines.join('\n')}\n}\n`;
}
