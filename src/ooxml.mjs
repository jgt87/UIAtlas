// Minimal Office Open XML helpers for the PowerPoint adapter: an element/attribute-only XML parser (text nodes are
// skipped entirely, so document text is never even read), tree lookups, .rels resolution and DrawingML colours.

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decode = s => s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENT[e] ?? m);

export function parseXml(xml) {
  const root = { name: '#root', attrs: {}, children: [] }, stack = [root];
  const re = /<(\/?)([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|<\?[\s\S]*?\?>|<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<![^>]*>/g;
  for (let m; (m = re.exec(xml));) {
    if (!m[2]) continue;
    if (m[1]) { while (stack.length > 1 && stack.pop().name !== m[2]); continue; }
    const attrs = {}; for (const a of m[3].matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[a[1]] = decode(a[2] ?? a[3]);
    const node = { name: m[2], attrs, children: [] };
    stack.at(-1).children.push(node);
    if (!m[4]) stack.push(node);
  }
  return root;
}

export const kids = (n, name) => (n?.children || []).filter(c => c.name === name);
export const kid = (n, name) => (n?.children || []).find(c => c.name === name) || null;
export const path = (n, ...names) => names.reduce((x, k) => kid(x, k), n);
export function desc(n, name) { for (const c of n?.children || []) { if (c.name === name) return c; const d = desc(c, name); if (d) return d; } return null; }
export function descs(n, name, out = []) { for (const c of n?.children || []) { if (c.name === name) out.push(c); descs(c, name, out); } return out; }

// '.rels' next to a part: { rId: absolute part path }, plus byType(typeSuffix) -> [paths]
export function rels(files, part) {
  const dir = part.split('/').slice(0, -1).join('/'), file = `${dir}/_rels/${part.split('/').at(-1)}.rels`, buf = files.get(file);
  const map = {}, types = [];
  if (buf) for (const r of descs(parseXml(buf.toString('utf8')), 'Relationship')) {
    if (r.attrs.TargetMode === 'External') continue;
    const parts = (r.attrs.Target.startsWith('/') ? r.attrs.Target.slice(1) : `${dir}/${r.attrs.Target}`).split('/'), out = [];
    for (const p of parts) p === '..' ? out.pop() : p !== '.' && out.push(p);
    map[r.attrs.Id] = out.join('/'); types.push([r.attrs.Type || '', out.join('/')]);
  }
  return { ...map, byType: t => types.filter(([ty]) => ty.endsWith('/' + t)).map(([, p]) => p) };
}

// ---- DrawingML colours -------------------------------------------------------------------------------------------
const PRESET = { black: '000000', white: 'ffffff', red: 'ff0000', green: '008000', blue: '0000ff', yellow: 'ffff00', gray: '808080', grey: '808080', darkGray: 'a9a9a9', lightGray: 'd3d3d3' };
const COLOR_TAGS = new Set(['a:srgbClr', 'a:schemeClr', 'a:sysClr', 'a:prstClr', 'a:scrgbClr', 'a:hslClr']);
const rgbToHsl = ([r, g, b]) => { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn), h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return [h / 6, s, l]; };
const hslToRgb = ([h, s, l]) => { if (!s) return [l, l, l].map(v => v * 255); const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = t => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; }; return [f(h + 1 / 3), f(h), f(h - 1 / 3)].map(v => v * 255); };
const toHex = (rgb, a = 1) => '#' + rgb.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('') + (a < 0.999 ? Math.round(a * 255).toString(16).padStart(2, '0') : '');

// ctx: { theme: { dk1: 'rrggbb', ... }, clrMap: { bg1: 'lt1', tx1: 'dk1', ... }, phClr? }. Returns { hex, slot } or null.
// Accepts a colour element or any element that has one as a direct child (a:solidFill, a:fontRef, p:bgRef, ...).
export function color(node, ctx) {
  const c = node && (COLOR_TAGS.has(node.name) ? node : node.children.find(k => COLOR_TAGS.has(k.name))); if (!c) return null;
  let rgb, slot = null;
  if (c.name === 'a:srgbClr') rgb = c.attrs.val;
  else if (c.name === 'a:sysClr') rgb = c.attrs.lastClr || (c.attrs.val === 'window' ? 'ffffff' : '000000');
  else if (c.name === 'a:prstClr') rgb = PRESET[c.attrs.val];
  else if (c.name === 'a:scrgbClr') rgb = toHex(['r', 'g', 'b'].map(k => Math.round(255 * Math.min(1, (+c.attrs[k] || 0) / 100000) ** (1 / 2.2)))).slice(1);
  else if (c.name === 'a:hslClr') rgb = toHex(hslToRgb([(+c.attrs.hue || 0) / 21600000, (+c.attrs.sat || 0) / 100000, (+c.attrs.lum || 0) / 100000])).slice(1);
  else if (c.name === 'a:schemeClr') { if (c.attrs.val === 'phClr') return ctx.phClr || null; slot = ctx.clrMap?.[c.attrs.val] || c.attrs.val; rgb = ctx.theme?.[slot]; }
  if (!/^[0-9a-f]{6}$/i.test(rgb || '')) return null;
  let v = [0, 2, 4].map(i => parseInt(rgb.slice(i, i + 2), 16)), a = 1, mods = false;
  for (const m of c.children) { const x = (+m.attrs.val || 0) / 100000;
    if (m.name === 'a:lumMod' || m.name === 'a:lumOff') { const hsl = rgbToHsl(v); hsl[2] = m.name === 'a:lumMod' ? hsl[2] * x : Math.min(1, hsl[2] + x); v = hslToRgb(hsl); mods = true; }
    else if (m.name === 'a:tint') { v = v.map(ch => ch + (255 - ch) * (1 - x)); mods = true; }
    else if (m.name === 'a:shade') { v = v.map(ch => ch * x); mods = true; }
    else if (m.name === 'a:alpha') a = x; }
  return { hex: toHex(v, a).toLowerCase(), slot: mods ? null : slot }; // a modified theme colour is a tint/shade, not the slot itself
}
