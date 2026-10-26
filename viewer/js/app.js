// UI Atlas viewer. Fetches the list of extracted atlases, loads the selected one, and renders
// three views (Screens, Design tokens, Elements) with hash routing and a live search filter.
import { kindOf } from './kinds.js';
import { h, esc } from './dom.js';
import { contrastSection } from './contrast.js';
import { loadFontFaces, fontStatus, STATUS_LABEL, fontCss, hasWeight, fallbackTag } from './fonts.js';
import { fmtColor, colorFormat, setColorFormat } from './color-format.js';
const main = document.getElementById('main');
const pick = document.getElementById('atlasPick');
const search = document.getElementById('search');
const meta = document.getElementById('meta');
let atlas = null, q = '', mode = ''; // mode: '' = the base pass, else a key of atlas.modes


async function boot() {
  const names = await fetch('/api/atlases').then(r => r.json()).catch(() => []);
  if (!names.length) { main.innerHTML = '<div class="empty">No atlases yet. Run <code>atlas extract &lt;url&gt;</code> or <code>atlas import &lt;file&gt;</code>, then reload.</div>'; return; }
  pick.innerHTML = ''; for (const n of names) pick.append(h('option', { value: n }, n));
  pick.onchange = () => load(pick.value);
  await load(names[0]);
}
async function load(name) {
  atlas = await fetch(`/data/${name}/atlas.json`).then(r => r.json());
  atlas.name = name; mode = '';
  const k = kindOf(atlas), notes = atlas.project.notes || [];
  meta.innerHTML = `<b>${esc(atlas.project.name)}</b><br>${k.label}${atlas.project.previews === 'schematic' ? ' · schematic previews' : ''}<br>${atlas.screens.length ? `${atlas.project.pages} ${k.screens}<br>` : ''}${atlas.tokens.colors.length} colours · ${atlas.tokens.fonts.length} fonts<br><span style="color:var(--ink-3)">${new Date(atlas.project.created).toLocaleString()}</span>${notes.length ? `<ul class="notes">${notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}`;
  for (const a of document.querySelectorAll('.navitem')) if (a.dataset.nav === 'screens') a.textContent = k.screens[0].toUpperCase() + k.screens.slice(1);
  route();
  // web fonts load from their original URLs; re-render once they're in so names show in themselves
  if (atlas.fontFaces?.length) loadFontFaces(atlas.fontFaces).then(() => route());
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
    // without --screenshots there is no image at all: compact cards instead of empty boxes
    atlas.project.screenshots === false ? null : h('div', { class: 'shot' }, s.screenshot ? h('img', { src: base + s.screenshot, loading: 'lazy', alt: s.title }) : h('div', { class: 'empty' }, 'No preview')),
    h('div', { class: 'card-body' },
      h('div', { class: 'card-title' }, s.title || s.url),
      h('div', { class: 'card-url' }, s.purpose || s.url),
      h('div', { class: 'badges' }, Object.entries(s.inventory || {}).map(([k, n]) => h('span', { class: 'badge' }, `${n} ${k}`))))))));
}

// what a colour is used for, most used first: 'text 23 · bg 4'
const usageText = u => Object.entries(u || {}).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k === 'background' ? 'bg' : k} ${n}`).join(' · ');

function renderTokens() {
  const modes = Object.keys(atlas.modes || {}), current = mode && atlas.modes?.[mode];
  const t = { lineHeights: [], letterSpacings: [], ...(current ? current.tokens : atlas.tokens) };
  const sw = t.colors.filter(c => !q || (c.value + ' ' + (c.label || '') + ' ' + usageText(c.usage)).toLowerCase().includes(q)).map(c => h('div', { class: 'swatch' },
    h('div', { class: 'chip', style: `background:${c.value}` }),
    h('div', { class: 'lbl' }, fmtColor(c.value), c.label ? h('small', {}, c.label) : null, c.usage ? h('small', {}, usageText(c.usage)) : null,
      h('small', {}, c.share != null ? `${(c.share * 100).toFixed(c.share < 0.1 ? 1 : 0)}%` : `${c.count}×`))));
  const sizes = t.fontSizes.slice().sort((a, b) => parseFloat(b.value) - parseFloat(a.value)).map(f =>
    h('div', { class: 'row' }, h('span', { class: 'k' }, f.value), h('span', { style: `font-size:${f.value};${fontCss(t.fonts[0]?.value || 'system-ui')}` }, 'The quick brown fox'), h('span', { class: 'count', style: 'margin-left:auto' }, `${f.count}×`)));
  const maxSp = Math.max(...t.spacing.map(s => parseFloat(s.value)), 1);
  const spacing = t.spacing.slice().sort((a, b) => parseFloat(a.value) - parseFloat(b.value)).map(s =>
    h('div', { class: 'row' }, h('span', { class: 'k' }, s.value), h('span', { class: 'bar', style: `width:${Math.max(6, parseFloat(s.value) / maxSp * 240)}px` }), h('span', { class: 'count' }, `${s.count}×`)));
  // each family shown in itself, with whether that's the real font (web font / installed) or a fallback
  const fonts = t.fonts.map(f => { const st = fontStatus(f.value, atlas.fontFaces); return h('div', { class: 'font-row' + (st === 'missing' ? ' missing' : '') },
    h('span', { class: 'font-demo', style: fontCss(f.value) }, f.value), st === 'missing' ? fallbackTag(h) : h('small', {}, STATUS_LABEL[st]), h('span', { class: 'count' }, `${f.count}×`)); });
  const primary = t.fonts[0]?.value, primaryStatus = primary && fontStatus(primary, atlas.fontFaces);
  const fallbackNote = primaryStatus === 'missing' ? h('p', { class: 'fallback-note' }, fallbackTag(h), ` ${primary} isn't available here, so these samples use a fallback font.`) : null;
  const lineHeights = t.lineHeights.map(l => h('span', { class: 'pill' }, l.value, ' ', h('small', {}, `${l.count}×`)));
  const letterSpacings = t.letterSpacings.map(l => h('span', { class: 'pill' }, h('span', { style: `letter-spacing:${l.value}` }, l.value), ' ', h('small', {}, `${l.count}×`)));
  // weights in the primary font; a web font without that weight is drawn synthesized, which is marked
  const weights = t.fontWeights.map(w => h('span', { class: 'pill' }, h('span', { style: `font-weight:${w.value};${primary ? fontCss(primary) : ''}` }, w.value), ' ', h('small', {}, `${w.count}×`),
    primaryStatus === 'web' && !hasWeight(primary, w.value) ? h('span', { class: 'tag-fallback', title: `${primary} has no ${w.value} weight loaded; the browser fakes it.` }, 'synthesized') : primaryStatus === 'missing' ? fallbackTag(h) : null));
  const radii = t.radii.map(r => h('span', { class: 'pill' }, h('span', { class: 'dot', style: `border-radius:${r.value};width:16px;height:16px;background:var(--ink)` }), r.value, ' ', h('small', {}, `${r.count}×`)));
  const shadows = t.shadows.map(s => h('div', { class: 'shadow-box', style: `box-shadow:${s.value}`, title: s.value }));
  const vars = (t.cssVars || []).filter(v => !q || (v.name + v.value).toLowerCase().includes(q)).map(v => {
    const isColor = /^#|rgb|hsl/.test(v.value);
    return h('tr', {}, h('td', {}, v.name), h('td', {}, isColor ? h('span', {}, h('span', { class: 'dot', style: `background:${v.value}` }), fmtColor(v.value)) : v.value));
  });
  const kids = [];
  // light/dark, screen sizes, themes: switch which pass's tokens are shown
  if (modes.length) kids.push(h('div', { class: 'modes' }, ['', ...modes].map(m => h('button', { class: 'pill' + (m === mode ? ' on' : ''), onclick: () => { mode = m; renderTokens(); } }, m || 'Base'))));
  kids.push(h('h2', { class: 'sec' }, `Colour palette (${t.colors.length})`), h('div', { class: 'swatches' }, sw));
  if (sizes.length) kids.push(h('h2', { class: 'sec' }, 'Type scale'), fallbackNote, h('div', { class: 'scale' }, sizes));
  if (fonts.length) kids.push(h('h2', { class: 'sec' }, 'Font families'), h('div', { class: 'font-list' }, fonts));
  if (weights.length) kids.push(h('h2', { class: 'sec' }, 'Font weights'), h('div', { class: 'chips-row' }, weights));
  if (lineHeights.length) kids.push(h('h2', { class: 'sec' }, 'Line heights (× font size)'), h('div', { class: 'chips-row' }, lineHeights));
  if (letterSpacings.length) kids.push(h('h2', { class: 'sec' }, 'Letter spacing'), h('div', { class: 'chips-row' }, letterSpacings));
  if (spacing.length) kids.push(h('h2', { class: 'sec' }, 'Spacing scale'), h('div', { class: 'spacing-bars' }, spacing));
  if (radii.length) kids.push(h('h2', { class: 'sec' }, 'Radii'), h('div', { class: 'chips-row' }, radii));
  if (shadows.length) kids.push(h('h2', { class: 'sec' }, 'Shadows'), h('div', { class: 'shadow-grid' }, shadows));
  kids.push(...contrastSection(current ? current.contrast : atlas.contrast)); // before the (often long) variables list
  if (vars.length) kids.push(h('h2', { class: 'sec' }, `${kindOf(atlas).vars} (${(t.cssVars || []).length})`), h('table', { class: 'vars' }, h('tbody', {}, vars)));
  main.replaceChildren(...kids.filter(Boolean));
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
  const filtered = rows.filter(r => !q || [r.name, r.role, r.tag, r.screen].join(' ').toLowerCase().includes(q));
  const summary = h('div', { class: 'chips-row', style: 'margin-bottom:16px' }, Object.entries(byRole).sort((a, b) => b[1].length - a[1].length).map(([role, list]) => h('span', { class: 'pill' }, role, ' ', h('small', {}, `${list.length}`))));
  const body = filtered.slice(0, 600).map(e => h('tr', {},
    h('td', { class: 'rolecell' }, e.role),
    h('td', {}, e.name || h('span', { style: 'color:var(--ink-3)' }, `<${e.tag}>`)), // atlases hold no text content
    h('td', { class: 'mono' }, e.bg ? h('span', {}, h('span', { class: 'dot', style: `background:${e.bg}` }), fmtColor(e.bg)) : '—'),
    h('td', { class: 'mono' }, e.color ? h('span', {}, h('span', { class: 'dot', style: `background:${e.color}` }), fmtColor(e.color)) : '—'),
    h('td', { class: 'mono' }, e.fontSize || '—'), h('td', { class: 'mono' }, e.weight || '—'), fontCol && e.font ? h('td', {}, h('span', { style: fontCss(e.font) }, e.font), fontStatus(e.font, atlas.fontFaces) === 'missing' ? fallbackTag(h) : null) : h('td', { class: 'mono' }, (fontCol ? e.font : e.radius) || '—'),
    h('td', { style: 'color:var(--ink-3);font-size:12px' }, e.screen)));
  main.replaceChildren(summary, h('table', { class: 'tbl' },
    h('thead', {}, h('tr', {}, ['Role', 'Element', 'Background', 'Text colour', 'Size', 'Weight', fontCol ? 'Font' : 'Radius', k.screen].map(x => h('th', {}, x)))),
    h('tbody', {}, body)));
}

// HEX / RGB toggle in the top bar
const fmtButtons = document.querySelectorAll('#colorFmt button');
const showFmt = () => fmtButtons.forEach(b => b.classList.toggle('on', b.dataset.f === colorFormat()));
fmtButtons.forEach(b => b.addEventListener('click', () => { setColorFormat(b.dataset.f); showFmt(); if (atlas) route(); }));
showFmt();
search.addEventListener('input', () => { q = search.value.trim().toLowerCase(); route(); });
window.addEventListener('hashchange', () => { q = ''; search.value = ''; route(); });
boot();
