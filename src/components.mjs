// Component variants: element samples of the same role grouped by their combined style (background, text colour,
// border, radius, type, padding), so "button" becomes e.g. filled, filled-2, outline, plain — each with how often
// and on how many screens it appears. Pure; runs for every source when the atlas is written.

const ROLES = new Set(['button', 'link', 'input', 'nav', 'component', 'shape']);
const FIELDS = ['bg', 'color', 'border', 'radius', 'fontSize', 'weight'], EXTRA = ['font', 'padding']; // EXTRA: most common value within a variant
const norm = (f, v) => v == null || v === '' || (f === 'radius' && parseFloat(v) === 0) ? null : String(v);

// one element sample into its role's variant (keyed by its combined style)
const telling = style => style.bg || style.border || style.color || style.fontSize; // anything to tell variants apart by
const countInto = (t, value) => t.set(value, (t.get(value) || 0) + 1);
function addSample(byRole, s, e) {
  if (!ROLES.has(e.role)) return;
  const style = Object.fromEntries(FIELDS.map(f => [f, norm(f, e[f])]));
  if (!telling(style)) return;
  const key = JSON.stringify(style), m = byRole.get(e.role) || byRole.set(e.role, new Map()).get(e.role);
  const v = m.get(key) || m.set(key, { style, count: 0, screens: new Set(), extra: {} }).get(key);
  v.count++; v.screens.add(s.id);
  for (const f of EXTRA) if (e[f]) countInto(v.extra[f] ||= new Map(), e[f]);
}

const kindOf = (style, pageBg) => style.bg && style.bg !== pageBg ? 'filled' : style.border ? 'outline' : 'plain';
const variantStyle = v => ({ ...Object.fromEntries(Object.entries(v.style).filter(([, x]) => x != null)),
  ...Object.fromEntries(Object.entries(v.extra).map(([f, t]) => [f, [...t].sort((a, b) => b[1] - a[1])[0][0]])) });

// one role's variants, most common first, named filled / filled-2 / outline / plain ...
function roleVariants(m, max, pageBg) {
  const total = [...m.values()].reduce((a, v) => a + v.count, 0);
  const list = [...m.values()].sort((a, b) => b.count - a.count);
  // one-off styles are noise once a role has repeated ones; keep at most `max` variants
  const kept = (list.some(v => v.count > 1) ? list.filter(v => v.count > 1) : list).slice(0, max);
  const seen = {};
  return kept.map(v => {
    const kind = kindOf(v.style, pageBg);
    seen[kind] = (seen[kind] || 0) + 1;
    return { name: seen[kind] > 1 ? `${kind}-${seen[kind]}` : kind, kind, count: v.count, share: Math.round(v.count / total * 1000) / 1000, screens: v.screens.size,
      style: variantStyle(v) };
  });
}

// pageBg: the source's main background — a component 'filled' with exactly that colour reads as unfilled (outline/plain).
export function clusterComponents(screens = [], { max = 8, pageBg = null } = {}) {
  const byRole = new Map();
  for (const s of screens) for (const e of s.elements || []) addSample(byRole, s, e);
  const out = {};
  for (const [role, m] of byRole) out[role] = roleVariants(m, max, pageBg);
  return out;
}
