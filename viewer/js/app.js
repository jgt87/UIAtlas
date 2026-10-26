// UI Atlas viewer. Fetches the list of extracted atlases, loads the selected one, and renders
// three views (Screens, Design tokens, Elements) with hash routing and a live search filter.
import { kindOf } from './kinds.js';
const main = document.getElementById('main');
const pick = document.getElementById('atlasPick');
const search = document.getElementById('search');
const meta = document.getElementById('meta');
let atlas = null, q = '';

const h = (tag, attrs = {}, ...kids) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === 'class') e.className = v; else if (k === 'html') e.innerHTML = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (v != null) e.setAttribute(k, v); } for (const k of kids.flat()) if (k != null) e.append(k.nodeType ? k : document.createTextNode(k)); return e; };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const readable = hex => { const n = hex && /^#[0-9a-f]{6}$/i.test(hex) ? parseInt(hex.slice(1), 16) : 0; const r = n >> 16, g = (n >> 8) & 255, b = n & 255; return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? '#14161a' : '#ffffff'; };

async function boot() {
  const names = await fetch('/api/atlases').then(r => r.json()).catch(() => []);
  if (!names.length) { main.innerHTML = '<div class="empty">No atlases yet. Run <code>atlas extract &lt;url&gt;</code> or <code>atlas import &lt;file&gt;</code>, then reload.</div>'; return; }
  pick.innerHTML = ''; for (const n of names) pick.append(h('option', { value: n }, n));
  pick.onchange = () => load(pick.value);
  await load(names[0]);
}
async function load(name) {
  atlas = await fetch(`/data/${name}/atlas.json`).then(r => r.json());
  atlas.name = name;
  const k = kindOf(atlas), notes = atlas.project.notes || [];
  meta.innerHTML = `<b>${esc(atlas.project.name)}</b><br>${k.label}${atlas.project.previews === 'schematic' ? ' · schematic previews' : ''}<br>${atlas.screens.length ? `${atlas.project.pages} ${k.screens}<br>` : ''}${atlas.tokens.colors.length} colours · ${atlas.tokens.fonts.length} fonts<br><span style="color:var(--ink-3)">${new Date(atlas.project.created).toLocaleString()}</span>${notes.length ? `<ul class="notes">${notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}`;
  for (const a of document.querySelectorAll('.navitem')) if (a.dataset.nav === 'screens') a.textContent = k.screens[0].toUpperCase() + k.screens.slice(1);
  route();
}
// a token-only atlas (no screens) opens on its tokens
const view = () => (location.hash.replace('#/', '') || (atlas?.screens.length ? 'screens' : 'tokens'));
function route() {
  const v = view();
  for (const a of document.querySelectorAll('.navitem')) a.classList.toggle('active', a.dataset.nav === v);
  ({ screens: renderScreens, tokens: renderTokens, elements: renderElements }[v] || renderScreens)();
}

function renderScreens() {
  if (!atlas.screens.length) return main.replaceChildren(h('div', { class: 'empty' }, `This ${kindOf(atlas).label.toLowerCase()} has no ${kindOf(atlas).screens}; see Design tokens.`));
  const scr = atlas.screens.filter(s => !q || (s.title + ' ' + s.url).toLowerCase().includes(q));
  const base = `/data/${atlas.name}/`;
  main.replaceChildren(h('div', { class: 'grid' }, scr.map(s => h(s.screenshot ? 'a' : 'div', { class: 'card', href: s.screenshot ? base + s.screenshot : null, target: s.screenshot ? '_blank' : null },
    h('div', { class: 'shot' }, s.screenshot ? h('img', { src: base + s.screenshot, loading: 'lazy', alt: s.title }) : h('div', { class: 'empty' }, 'No preview')),
    h('div', { class: 'card-body' },
      h('div', { class: 'card-title' }, s.title || s.url),
      h('div', { class: 'card-url' }, s.purpose || s.url),
      h('div', { class: 'badges' }, Object.entries(s.inventory || {}).map(([k, n]) => h('span', { class: 'badge' }, `${n} ${k}`))))))));
}

function renderTokens() {
  const t = atlas.tokens;
  const sw = t.colors.filter(c => !q || (c.value + ' ' + (c.label || '')).toLowerCase().includes(q)).map(c => h('div', { class: 'swatch' },
    h('div', { class: 'chip', style: `background:${c.value}` }),
    h('div', { class: 'lbl' }, c.value, c.label ? h('small', {}, c.label) : null, h('small', {}, c.share != null ? `${(c.share * 100).toFixed(c.share < 0.1 ? 1 : 0)}%` : `${c.count}×`))));
  const sizes = t.fontSizes.slice().sort((a, b) => parseFloat(b.value) - parseFloat(a.value)).map(f =>
    h('div', { class: 'row' }, h('span', { class: 'k' }, f.value), h('span', { style: `font-size:${f.value}` }, 'The quick brown fox'), h('span', { class: 'count', style: 'margin-left:auto' }, `${f.count}×`)));
  const maxSp = Math.max(...t.spacing.map(s => parseFloat(s.value)), 1);
  const spacing = t.spacing.slice().sort((a, b) => parseFloat(a.value) - parseFloat(b.value)).map(s =>
    h('div', { class: 'row' }, h('span', { class: 'k' }, s.value), h('span', { class: 'bar', style: `width:${Math.max(6, parseFloat(s.value) / maxSp * 240)}px` }), h('span', { class: 'count' }, `${s.count}×`)));
  const fonts = t.fonts.map(f => h('span', { class: 'pill' }, h('span', { style: `font-family:${f.value}` }, f.value), ' ', h('small', {}, `${f.count}×`)));
  const weights = t.fontWeights.map(w => h('span', { class: 'pill' }, h('span', { style: `font-weight:${w.value}` }, w.value), ' ', h('small', {}, `${w.count}×`)));
  const radii = t.radii.map(r => h('span', { class: 'pill' }, h('span', { class: 'dot', style: `border-radius:${r.value};width:16px;height:16px;background:var(--ink)` }), r.value, ' ', h('small', {}, `${r.count}×`)));
  const shadows = t.shadows.map(s => h('div', { class: 'shadow-box', style: `box-shadow:${s.value}`, title: s.value }));
  const vars = (t.cssVars || []).filter(v => !q || (v.name + v.value).toLowerCase().includes(q)).map(v => {
    const isColor = /^#|rgb|hsl/.test(v.value);
    return h('tr', {}, h('td', {}, v.name), h('td', {}, isColor ? h('span', {}, h('span', { class: 'dot', style: `background:${v.value}` }), v.value) : v.value));
  });
  const kids = [h('h2', { class: 'sec' }, `Colour palette (${t.colors.length})`), h('div', { class: 'swatches' }, sw)];
  if (sizes.length) kids.push(h('h2', { class: 'sec' }, 'Type scale'), h('div', { class: 'scale' }, sizes));
  if (fonts.length) kids.push(h('h2', { class: 'sec' }, 'Font families'), h('div', { class: 'chips-row' }, fonts));
  if (weights.length) kids.push(h('h2', { class: 'sec' }, 'Font weights'), h('div', { class: 'chips-row' }, weights));
  if (spacing.length) kids.push(h('h2', { class: 'sec' }, 'Spacing scale'), h('div', { class: 'spacing-bars' }, spacing));
  if (radii.length) kids.push(h('h2', { class: 'sec' }, 'Radii'), h('div', { class: 'chips-row' }, radii));
  if (shadows.length) kids.push(h('h2', { class: 'sec' }, 'Shadows'), h('div', { class: 'shadow-grid' }, shadows));
  if (vars.length) kids.push(h('h2', { class: 'sec' }, `${kindOf(atlas).vars} (${(t.cssVars || []).length})`), h('table', { class: 'vars' }, h('tbody', {}, vars)));
  main.replaceChildren(...kids);
}

function renderElements() {
  const k = kindOf(atlas);
  const rows = [];
  for (const s of atlas.screens) for (const e of (s.elements || [])) rows.push({ ...e, screen: s.title || s.url });
  if (!rows.length) return main.replaceChildren(h('div', { class: 'empty' }, 'No elements in this atlas.'));
  const fontCol = rows.some(r => r.font); // design files carry font names; web pages carry radii
  // group by role, count, and list examples
  const byRole = {};
  for (const r of rows) (byRole[r.role] ||= []).push(r);
  const filtered = rows.filter(r => !q || (r.text + ' ' + r.role + ' ' + r.tag).toLowerCase().includes(q));
  const summary = h('div', { class: 'chips-row', style: 'margin-bottom:16px' }, Object.entries(byRole).sort((a, b) => b[1].length - a[1].length).map(([role, list]) => h('span', { class: 'pill' }, role, ' ', h('small', {}, `${list.length}`))));
  const body = filtered.slice(0, 600).map(e => h('tr', {},
    h('td', { class: 'rolecell' }, e.role),
    h('td', {}, e.text || h('span', { style: 'color:var(--ink-3)' }, `<${e.tag}>`)),
    h('td', { class: 'mono' }, e.bg ? h('span', {}, h('span', { class: 'dot', style: `background:${e.bg}` }), e.bg) : '—'),
    h('td', { class: 'mono' }, e.color ? h('span', {}, h('span', { class: 'dot', style: `background:${e.color}` }), e.color) : '—'),
    h('td', { class: 'mono' }, e.fontSize || '—'), h('td', { class: 'mono' }, e.weight || '—'), h('td', { class: 'mono' }, (fontCol ? e.font : e.radius) || '—'),
    h('td', { style: 'color:var(--ink-3);font-size:12px' }, e.screen)));
  main.replaceChildren(summary, h('table', { class: 'tbl' },
    h('thead', {}, h('tr', {}, ['Role', 'Text', 'Background', 'Text colour', 'Size', 'Weight', fontCol ? 'Font' : 'Radius', k.screen].map(x => h('th', {}, x)))),
    h('tbody', {}, body)));
}

search.addEventListener('input', () => { q = search.value.trim().toLowerCase(); route(); });
window.addEventListener('hashchange', () => { q = ''; search.value = ''; route(); });
boot();
