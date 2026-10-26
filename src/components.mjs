// Component variants: element samples of the same role grouped by their combined style (background, text colour,
// border, radius, type, padding), so "button" becomes e.g. filled, filled-2, outline, plain — each with how often
// and on how many screens it appears. Pure; runs for every source when the atlas is written.

const ROLES = new Set(['button', 'link', 'input', 'nav', 'component', 'shape']);
const FIELDS = ['bg', 'color', 'border', 'radius', 'fontSize', 'weight'], EXTRA = ['font', 'padding']; // EXTRA: most common value within a variant
const norm = (f, v) => v == null || v === '' || (f === 'radius' && parseFloat(v) === 0) ? null : String(v);

// pageBg: the source's main background — a component 'filled' with exactly that colour reads as unfilled (outline/plain).
export function clusterComponents(screens = [], { max = 8, pageBg = null } = {}) {
  const byRole = new Map();
  for (const s of screens) for (const e of s.elements || []) {
    if (!ROLES.has(e.role)) continue;
    const style = Object.fromEntries(FIELDS.map(f => [f, norm(f, e[f])]));
    if (!style.bg && !style.border && !style.color && !style.fontSize) continue; // nothing to tell variants apart by
    const key = JSON.stringify(style), m = byRole.get(e.role) || byRole.set(e.role, new Map()).get(e.role);
    const v = m.get(key) || m.set(key, { style, count: 0, screens: new Set(), extra: {} }).get(key);
    v.count++; v.screens.add(s.id);
    for (const f of EXTRA) if (e[f]) { const t = (v.extra[f] ||= new Map()); t.set(e[f], (t.get(e[f]) || 0) + 1); }
  }
  const out = {};
  for (const [role, m] of byRole) {
    const total = [...m.values()].reduce((a, v) => a + v.count, 0);
    const list = [...m.values()].sort((a, b) => b.count - a.count);
    // one-off styles are noise once a role has repeated ones; keep at most `max` variants
    const kept = (list.some(v => v.count > 1) ? list.filter(v => v.count > 1) : list).slice(0, max);
    const seen = {};
    out[role] = kept.map(v => {
      const kind = v.style.bg && v.style.bg !== pageBg ? 'filled' : v.style.border ? 'outline' : 'plain';
      seen[kind] = (seen[kind] || 0) + 1;
      return { name: seen[kind] > 1 ? `${kind}-${seen[kind]}` : kind, kind, count: v.count, share: Math.round(v.count / total * 1000) / 1000, screens: v.screens.size,
        style: { ...Object.fromEntries(Object.entries(v.style).filter(([, x]) => x != null)),
          ...Object.fromEntries(Object.entries(v.extra).map(([f, t]) => [f, [...t].sort((a, b) => b[1] - a[1])[0][0]])) } };
    });
  }
  return out;
}
