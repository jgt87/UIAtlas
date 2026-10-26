// Structured design-tokens JSON (W3C Design Tokens Format, 2025.10) built from an atlas, plus CSS variables
// generated from the same structure. Pure functions, no Node APIs.
//
// Layout: primitives (color, font.family/size/weight/lineHeight/letterSpacing, spacing, radius, shadow), then
// derived layers that reference them by alias — color-usage (text/background/border/fill colours ranked primary,
// secondary, ...), typography (most common type style per element role) and component (most common background/
// text colour/radius per role) — then the source's own declared variables. Usage counts live under
// $extensions["ui-atlas"]. Like every export, it carries tokens only: no source name or text.

const EXT = 'ui-atlas';
const WEIGHT_NAMES = { 100: 'thin', 200: 'extra-light', 300: 'light', 400: 'regular', 500: 'medium', 600: 'semi-bold', 700: 'bold', 800: 'extra-bold', 900: 'black' };
const COMPONENT_ROLES = new Set(['button', 'link', 'input', 'nav', 'component', 'shape']);
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
  const layers = String(css).split(/,(?![^(]*\))/).map(l => {
    const colorM = /(rgba?\([^)]*\)|#[0-9a-f]{3,8}\b)/i.exec(l), lens = l.replace(colorM?.[0] || '', '').match(/-?\d*\.?\d+(px)?/g) || [];
    const c = colorM ? toHex(colorM[0]) : '#000000', [x = 0, y = 0, blur = 0, spread = 0] = lens.map(parseFloat);
    return c && { color: colorValue(c), offsetX: { value: x, unit: 'px' }, offsetY: { value: y, unit: 'px' }, blur: { value: blur, unit: 'px' }, spread: { value: spread, unit: 'px' }, ...(/\binset\b/.test(l) ? { inset: true } : {}) };
  }).filter(Boolean);
  return layers.length ? (layers.length === 1 ? layers[0] : layers) : null;
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

export function buildTokens(atlas, { exported = new Date().toISOString() } = {}) {
  const t = atlas.tokens, out = {}, refs = { color: new Map(), size: new Map(), family: new Map(), weight: new Map(), radius: new Map(), lineHeight: new Map(), letterSpacing: new Map() };
  const skipped = []; // values with no token form in the format, e.g. 50% or per-corner radii, em sizes
  const unique = (g, n) => { let k = n, i = 2; while (g[k]) k = `${n}-${i++}`; return k; };
  const usage = x => ext({ count: x.count, ...(x.share != null ? { share: x.share } : {}) });

  // Palette names: the source's label, else the name of a variable the source declared with that exact colour
  // (preferring names that say what it is for, then the shortest), else the hex digits.
  const declared = new Map();
  for (const v of t.cssVars || []) { const h = /^#[0-9a-f]{6}$/i.test(v.value.trim()) ? v.value.trim().toLowerCase() : null; if (h) (declared.get(h) || declared.set(h, []).get(h)).push(v.name.replace(/^--/, '')); }
  // score: names matching the colour's main use first, then any semantic hint, then the shortest
  const declaredName = (h, usage) => { const main = Object.entries(usage || {}).sort((a, b) => b[1] - a[1])[0]?.[0], hint = USE_HINT[main];
    const score = n => (hint?.test(n) ? 2 : 0) + (SEMANTIC_HINT.test(n) ? 1 : 0);
    return (declared.get(h) || []).sort((a, b) => score(b) - score(a) || a.length - b.length)[0]; };
  if (t.colors?.length) {
    const g = out.color = { $type: 'color' };
    for (const c of t.colors) { const v = colorValue(c.value); if (!v) { skipped.push(c.value); continue; }
      const k = unique(g, name((c.label || '').split(/,| · /)[0].trim() || declaredName(c.value, c.usage) || c.value.slice(1, 7))); refs.color.set(c.value, `{color.${k}}`);
      g[k] = { $value: v, ...(c.label ? { $description: c.label } : {}), ...ext({ count: c.count, ...(c.share != null ? { share: c.share } : {}), ...(c.usage ? { usage: c.usage } : {}) }) }; }
  }
  const font = {};
  if (t.fonts?.length) { const g = font.family = { $type: 'fontFamily' };
    for (const f of t.fonts) { const k = unique(g, name(f.value)); refs.family.set(f.value, `{font.family.${k}}`); g[k] = { $value: f.value, ...usage(f) }; } }
  const dimGroup = (list, refMap, desc) => {
    const g = { $type: 'dimension' };
    for (const d of [...list].sort((a, b) => (dimensionValue(a.value)?.value ?? 0) - (dimensionValue(b.value)?.value ?? 0))) {
      const v = dimensionValue(d.value); if (!v) { skipped.push(d.value); continue; }
      const k = unique(g, name(d.value)); refMap?.set(d.value, `{${desc}.${k}}`);
      g[k] = { $value: v, ...ext({ count: d.count, ...(String(d.value).trim() !== `${v.value}${v.unit}` ? { source: d.value } : {}) }) };
    }
    return Object.keys(g).length > 1 ? g : null;
  };
  if (t.fontSizes?.length) { const g = dimGroup(t.fontSizes, refs.size, 'font.size'); if (g) font.size = g; }
  if (t.fontWeights?.length) { const g = font.weight = { $type: 'fontWeight' };
    for (const w of [...t.fontWeights].sort((a, b) => Number(a.value) - Number(b.value))) { const n = Number(w.value);
      const k = unique(g, WEIGHT_NAMES[n] || name(w.value)); refs.weight.set(String(w.value), `{font.weight.${k}}`); g[k] = { $value: Number.isFinite(n) ? n : w.value, ...usage(w) }; } }
  if (t.lineHeights?.length) { const g = { $type: 'number' }; // unitless: a ratio of the font size
    for (const l of [...t.lineHeights].sort((a, b) => parseFloat(a.value) - parseFloat(b.value))) { const n = parseFloat(l.value); if (!Number.isFinite(n)) { skipped.push(`line-height ${l.value}`); continue; }
      const k = unique(g, name(l.value)); refs.lineHeight.set(String(l.value), `{font.lineHeight.${k}}`); g[k] = { $value: n, ...usage(l) }; }
    if (Object.keys(g).length > 1) font.lineHeight = g; }
  if (t.letterSpacings?.length) { const g = dimGroup(t.letterSpacings, refs.letterSpacing, 'font.letterSpacing'); if (g) font.letterSpacing = g; }
  if (Object.keys(font).length) out.font = font;
  const spacing = t.spacing?.length && dimGroup(t.spacing, null, 'spacing'); if (spacing) out.spacing = spacing;
  const radius = t.radii?.length && dimGroup(t.radii, refs.radius, 'radius'); if (radius) out.radius = radius;
  if (t.shadows?.length) { const g = { $type: 'shadow' };
    t.shadows.forEach((s, i) => { const v = shadowValue(s.value); if (v) g[String(i + 1)] = { $value: v, ...ext({ count: s.count, css: s.value }) }; else skipped.push(s.value); });
    if (Object.keys(g).length > 1) out.shadow = g; }

  // Derived layers: aliases into the primitives where the value is one of them, else the literal value.
  const color = hex => refs.color.get(hex) || colorValue(hex), alias = (map, v, lit) => map.get(v) || lit(v);
  // color-usage: per kind of use, the colours most used that way (at least 2% of that use), ranked.
  const kinds = { text: 'text', background: 'background', border: 'border', fill: 'fill' }, byUse = {};
  for (const c of t.colors || []) for (const [k, n] of Object.entries(c.usage || {})) if (kinds[k] && refs.color.has(c.value)) (byUse[k] ||= []).push({ value: c.value, n });
  for (const [k, list] of Object.entries(byUse)) {
    const total = list.reduce((a, x) => a + x.n, 0), ranked = list.filter(x => x.n / total >= 0.02).sort((a, b) => b.n - a.n).slice(0, 6);
    if (!ranked.length) continue;
    const g = ((out['color-usage'] ||= {})[kinds[k]] = { $type: 'color' });
    ranked.forEach((x, i) => { g[RANKS[i]] = { $value: refs.color.get(x.value), ...ext({ count: x.n, share: r4(x.n / total) }) }; });
  }
  const typo = perRole(atlas, ['font', 'fontSize', 'weight', 'lineHeight', 'letterSpacing'], e => e.fontSize && e.role !== 'image'); // images carry no type
  const fallbackFont = t.fonts?.[0]?.value;
  if (typo.length) { const g = out.typography = { $type: 'typography' };
    for (const r of typo.sort((a, b) => b.total - a.total)) {
      const fam = r.font || fallbackFont, size = dimensionValue(r.fontSize); if (!fam || !size) continue;
      const lh = r.lineHeight != null && Number.isFinite(parseFloat(r.lineHeight)) ? alias(refs.lineHeight, String(r.lineHeight), v => parseFloat(v)) : null;
      const ls = r.letterSpacing != null && dimensionValue(r.letterSpacing) ? alias(refs.letterSpacing, r.letterSpacing, dimensionValue) : null;
      g[unique(g, name(r.role))] = { $value: { fontFamily: alias(refs.family, fam, v => v), fontSize: alias(refs.size, r.fontSize, () => size), fontWeight: alias(refs.weight, String(r.weight ?? 400), v => Number(v) || 400),
        ...(lh != null ? { lineHeight: lh } : {}), ...(ls ? { letterSpacing: ls } : {}) },
        ...ext({ role: r.role, samples: r.total, share: r4(r.count / r.total) }) };
    } }
  const comp = perRole(atlas, ['bg', 'color', 'radius'], e => COMPONENT_ROLES.has(e.role) && (e.bg || e.radius && parseFloat(e.radius) > 0));
  if (comp.length) { const g = out.component = {};
    for (const r of comp.sort((a, b) => b.total - a.total)) {
      const c = {}, rad = r.radius && parseFloat(r.radius) > 0 ? (refs.radius.get(r.radius) || dimensionValue(r.radius)) : null;
      if (r.bg) c.background = { $type: 'color', $value: color(r.bg) };
      if (r.color) c.text = { $type: 'color', $value: color(r.color) };
      if (rad) c.radius = { $type: 'dimension', $value: rad };
      if (Object.keys(c).length) g[unique(g, name(r.role))] = { ...c, ...ext({ samples: r.total, share: r4(r.count / r.total) }) };
    }
    if (!Object.keys(out.component).length) delete out.component; }

  // The source's declared variables (CSS custom properties, theme slots, token paths), typed where possible.
  const vars = (t.cssVars || []).filter(v => !/^\s*["']/.test(v.value));
  if (vars.length) { const g = out.source = {}, raw = {};
    for (const v of vars) {
      const k = unique(g, name(v.name.replace(/^--/, ''))), val = v.value.trim(), hex = /^(#[0-9a-f]{3,8}|rgba?\([^)]*\))$/i.test(val) && toHex(val);
      const c = hex && colorValue(hex), d = !c && /[a-z]$/i.test(val) && dimensionValue(val); // a dimension needs a unit
      const n = !c && !d && /^-?\d*\.?\d+$/.test(val) ? parseFloat(val) : null; // unitless: a weight, line height, ratio...
      if (c) g[k] = { $type: 'color', $value: refs.color.get(hex) || c };
      else if (d) g[k] = { $type: 'dimension', $value: d };
      else if (n != null) g[k] = /weight/i.test(v.name) && n >= 1 && n <= 1000 ? { $type: 'fontWeight', $value: n } : { $type: 'number', $value: n };
      else raw[v.name] = v.value;
    }
    if (Object.keys(raw).length) g.$extensions = { [EXT]: { untyped: raw } };
  }
  return { $description: 'Design tokens extracted by UI Atlas', ...out,
    $extensions: { [EXT]: { format: 'https://www.designtokens.org/tr/2025.10/format/', exported, ...(skipped.length ? { unrepresentable: skipped } : {}) } } };
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

export function toCssVars(tokens) {
  const lines = [];
  for (const { path, type, value } of walkTokens(tokens)) {
    if (type === 'typography') for (const [p, sub, type] of [['font-family', 'fontFamily', 'fontFamily'], ['font-size', 'fontSize', 'dimension'], ['font-weight', 'fontWeight', 'fontWeight'], ['line-height', 'lineHeight', 'number'], ['letter-spacing', 'letterSpacing', 'dimension']]) {
      if (value[sub] != null) lines.push(`  --${path.join('-')}-${p}: ${cssValue(type, value[sub])};`);
    } else lines.push(`  --${path.join('-')}: ${cssValue(type, value)};`);
  }
  return `/* Design tokens, extracted by UI Atlas */\n:root {\n${lines.join('\n')}\n}\n`;
}
