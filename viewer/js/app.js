// UI Atlas viewer. Fetches the list of extracted atlases, loads the selected one, and renders
// three views (Screens, Design tokens, Elements) with hash routing and a live search filter.
import { kindOf } from './kinds.js';
import { h, esc, scrollBox } from './dom.js';
import { contrastSection } from './contrast.js';
import { loadFontFaces, fontStatus, STATUS_LABEL, fontCss, hasWeight, fallbackTag } from './fonts.js';
import { fmtColor, colorFormat, setColorFormat } from './color-format.js';
import { renderComponents } from './components-view.js';
import { renderFlow } from './flow-view.js';
import { openScreen } from './screen-modal.js';
import { openNewItem } from './new-item.js';
import { openExport } from './export-dialog.js';
const main = document.getElementById('main');
const pick = document.getElementById('atlasPick');
const search = document.getElementById('search');
const meta = document.getElementById('meta');
let atlas = null, q = '', mode = ''; // mode: '' = the base pass, else a key of atlas.modes


// select: the atlas to show (after "+ New" finished one), else the first
async function boot(select) {
  const names = await fetch('/api/atlases').then(r => r.json()).catch(() => []);
  if (!names.length) { main.innerHTML = '<div class="empty">No atlases yet. Click <b>+ New</b> to measure a website or import a file.</div>'; return; }
  pick.innerHTML = ''; for (const n of names) pick.append(h('option', { value: n }, n));
  pick.onchange = () => load(pick.value);
  const first = names.includes(select) ? select : names[0]; pick.value = first;
  await load(first);
}
document.getElementById('newItem').addEventListener('click', () => openNewItem(name => boot(name)));
const exportBtn = document.getElementById('exportBtn');
exportBtn.addEventListener('click', () => atlas && openExport(atlas.name));
async function load(name) {
  atlas = await fetch(`/data/${name}/atlas.json`).then(r => r.json());
  atlas.name = name; mode = ''; exportBtn.disabled = false;
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
  for (const a of document.querySelectorAll('.navitem')) { const on = a.dataset.nav === v; a.classList.toggle('active', on); if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); }
  ({ screens: renderScreens, tokens: renderTokens, elements: renderElements, components: () => main.replaceChildren(...renderComponents(atlas, q)), map: () => main.replaceChildren(...renderFlow(atlas)) }[v] || renderScreens)();
}

// --- shared pieces of the views ---
const matches = text => !q || text.toLowerCase().includes(q); // the live search filter
const colorValue = v => h('span', {}, h('span', { class: 'dot', style: `background:${v}` }), fmtColor(v)); // dot + HEX/RGB text
const countText = c => c.share != null ? `${(c.share * 100).toFixed(c.share < 0.1 ? 1 : 0)}%` : `${c.count}×`;
const pill = (parts, count, ...after) => h('span', { class: 'pill' }, ...parts, ' ', h('small', {}, `${count}×`), ...after);
// a heading and its wrapped items, or nothing when there are no items (extra nodes go between the two)
const section = (title, cls, items, ...between) => items.length ? [h('h2', { class: 'sec' }, title), ...between, h('div', { class: cls }, items)] : [];

// --- Screens ---
// a card opens the screen in a modal (keyboard: Enter/Space), instead of navigating to the image
const openOnKey = s => e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openScreen(atlas, s); } };
// without --screenshots there is no image at all: compact cards instead of empty boxes
const screenShot = (s, base) => atlas.project.screenshots === false ? null
  : h('div', { class: 'shot' }, s.screenshot ? h('img', { src: base + s.screenshot, loading: 'lazy', alt: s.title }) : h('div', { class: 'empty' }, 'No preview'));
const screenCard = (s, base) => h('div', { class: 'card clickable', role: 'button', tabindex: '0', 'aria-haspopup': 'dialog', onclick: () => openScreen(atlas, s), onkeydown: openOnKey(s) },
  screenShot(s, base),
  h('div', { class: 'card-body' },
    h('div', { class: 'card-title', title: s.title || s.url }, s.title || s.url),
    h('div', { class: 'card-url', title: s.purpose || s.url }, s.purpose || s.url),
    h('div', { class: 'badges' }, Object.entries(s.inventory || {}).map(([k, n]) => h('span', { class: 'badge' }, `${n} ${k}`)))));
function renderScreens() {
  if (!atlas.screens.length) return main.replaceChildren(h('div', { class: 'empty' }, `This ${kindOf(atlas).label.toLowerCase()} has no ${kindOf(atlas).screens}; see Design tokens.`));
  const base = `/data/${atlas.name}/`;
  main.replaceChildren(h('div', { class: 'grid' }, atlas.screens.filter(s => matches(s.title + ' ' + s.url)).map(s => screenCard(s, base))));
}

// --- Design tokens ---
// what a colour is used for, most used first: 'text 23 · bg 4'
const usageText = u => Object.entries(u || {}).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k === 'background' ? 'bg' : k} ${n}`).join(' · ');
const swatch = c => h('div', { class: 'swatch' },
  h('div', { class: 'chip', style: `background:${c.value}` }),
  h('div', { class: 'lbl' }, fmtColor(c.value), c.label ? h('small', {}, c.label) : null, c.usage ? h('small', {}, usageText(c.usage)) : null, h('small', {}, countText(c))));
const swatches = colors => colors.filter(c => matches(c.value + ' ' + (c.label || '') + ' ' + usageText(c.usage))).map(swatch);
const typeScale = t => t.fontSizes.slice().sort((a, b) => parseFloat(b.value) - parseFloat(a.value)).map(f =>
  h('div', { class: 'row' }, h('span', { class: 'k' }, f.value), h('span', { style: `font-size:${f.value};${fontCss(t.fonts[0]?.value || 'system-ui')}` }, 'The quick brown fox'), h('span', { class: 'count', style: 'margin-left:auto' }, `${f.count}×`)));
function spacingBars(spacing) {
  const max = Math.max(...spacing.map(s => parseFloat(s.value)), 1);
  return spacing.slice().sort((a, b) => parseFloat(a.value) - parseFloat(b.value)).map(s =>
    h('div', { class: 'row' }, h('span', { class: 'k' }, s.value), h('span', { class: 'bar', style: `width:${Math.max(6, parseFloat(s.value) / max * 240)}px` }), h('span', { class: 'count' }, `${s.count}×`)));
}
// each family shown in itself, with whether that's the real font (web font / installed) or a fallback
const fontRow = f => { const st = fontStatus(f.value, atlas.fontFaces); return h('div', { class: 'font-row' + (st === 'missing' ? ' missing' : '') },
  h('span', { class: 'font-demo', style: fontCss(f.value) }, f.value), st === 'missing' ? fallbackTag(h) : h('small', {}, STATUS_LABEL[st]), h('span', { class: 'count' }, `${f.count}×`)); };
const fallbackNote = (primary, status) => status === 'missing' ? h('p', { class: 'fallback-note' }, fallbackTag(h), ` ${primary} isn't available here, so these samples use a fallback font.`) : null;
// weights in the primary font; a web font without that weight is drawn synthesized, which is marked
const weightTag = (primary, status, w) => status === 'web' && !hasWeight(primary, w.value) ? h('span', { class: 'tag-fallback', title: `${primary} has no ${w.value} weight loaded; the browser fakes it.` }, 'synthesized')
  : status === 'missing' ? fallbackTag(h) : null;
const weightPill = (primary, status) => w => pill([h('span', { style: `font-weight:${w.value};${primary ? fontCss(primary) : ''}` }, w.value)], w.count, weightTag(primary, status, w));
const radiusPill = r => pill([h('span', { class: 'dot', style: `border-radius:${r.value};width:16px;height:16px;background:var(--ink)` }), r.value], r.count);
const shadowBox = s => h('div', { class: 'shadow-box', style: `box-shadow:${s.value}`, title: s.value });
const varRow = v => h('tr', {}, h('td', {}, v.name), h('td', {}, /^#|rgb|hsl/.test(v.value) ? colorValue(v.value) : v.value));
// light/dark, screen sizes, themes: switch which pass's tokens are shown
const modeButtons = modes => modes.length ? h('div', { class: 'modes' }, ['', ...modes].map(m =>
  h('button', { type: 'button', class: 'pill' + (m === mode ? ' on' : ''), 'aria-pressed': String(m === mode), onclick: () => { mode = m; renderTokens(); } }, m || 'Base'))) : null;

// the tokens and contrast of the selected pass: the base extraction, or one of its modes
const shownPass = () => { const current = mode && atlas.modes?.[mode];
  return { t: { lineHeights: [], letterSpacings: [], ...(current ? current.tokens : atlas.tokens) }, contrast: current ? current.contrast : atlas.contrast }; };
const varsSection = t => { const vars = (t.cssVars || []).filter(v => matches(v.name + v.value)).map(varRow);
  return vars.length ? [h('h2', { class: 'sec' }, `${kindOf(atlas).vars} (${(t.cssVars || []).length})`), scrollBox(h('table', { class: 'vars' }, h('tbody', {}, vars)))] : []; };

function renderTokens() {
  const { t, contrast } = shownPass();
  const primary = t.fonts[0]?.value, primaryStatus = primary && fontStatus(primary, atlas.fontFaces);
  main.replaceChildren(...[
    modeButtons(Object.keys(atlas.modes || {})),
    h('h2', { class: 'sec' }, `Colour palette (${t.colors.length})`), h('div', { class: 'swatches' }, swatches(t.colors)),
    ...section('Type scale', 'scale', typeScale(t), fallbackNote(primary, primaryStatus)),
    ...section('Font families', 'font-list', t.fonts.map(fontRow)),
    ...section('Font weights', 'chips-row', t.fontWeights.map(weightPill(primary, primaryStatus))),
    ...section('Line heights (× font size)', 'chips-row', t.lineHeights.map(l => pill([l.value], l.count))),
    ...section('Letter spacing', 'chips-row', t.letterSpacings.map(l => pill([h('span', { style: `letter-spacing:${l.value}` }, l.value)], l.count))),
    ...section('Spacing scale', 'spacing-bars', spacingBars(t.spacing)),
    ...section('Radii', 'chips-row', t.radii.map(radiusPill)),
    ...section('Shadows', 'shadow-grid', t.shadows.map(shadowBox)),
    ...contrastSection(contrast), // before the (often long) variables list
    ...varsSection(t),
  ].filter(Boolean));
}

// --- Elements ---
const elementRows = () => atlas.screens.flatMap(s => (s.elements || []).map(e => ({ ...e, screen: s.title || s.url })));
// one chip per role with its count, most common first
function roleSummary(rows) {
  const byRole = {};
  for (const r of rows) (byRole[r.role] ||= []).push(r);
  return h('div', { class: 'chips-row', style: 'margin-bottom:16px' }, Object.entries(byRole).sort((a, b) => b[1].length - a[1].length).map(([role, list]) => h('span', { class: 'pill' }, role, ' ', h('small', {}, `${list.length}`))));
}
const colorCell = v => h('td', { class: 'mono' }, v ? colorValue(v) : '—');
// design files carry font names (shown in themselves); web pages carry radii
const styleCell = (e, fontCol) => fontCol && e.font ? h('td', {}, h('span', { style: fontCss(e.font) }, e.font), fontStatus(e.font, atlas.fontFaces) === 'missing' ? fallbackTag(h) : null)
  : h('td', { class: 'mono' }, (fontCol ? e.font : e.radius) || '—');
const elementRow = fontCol => e => h('tr', {},
  h('td', { class: 'rolecell' }, e.role),
  h('td', {}, e.name || h('span', { style: 'color:var(--ink-3)' }, `<${e.tag}>`)), // atlases hold no text content
  colorCell(e.bg), colorCell(e.color),
  h('td', { class: 'mono' }, e.fontSize || '—'), h('td', { class: 'mono' }, e.weight || '—'), styleCell(e, fontCol),
  h('td', { style: 'color:var(--ink-3);font-size:12px' }, e.screen));
function renderElements() {
  const rows = elementRows();
  if (!rows.length) return main.replaceChildren(h('div', { class: 'empty' }, 'No elements in this atlas.'));
  const fontCol = rows.some(r => r.font);
  const body = rows.filter(r => matches([r.name, r.role, r.tag, r.screen].join(' '))).slice(0, 600).map(elementRow(fontCol));
  main.replaceChildren(roleSummary(rows), scrollBox(h('table', { class: 'tbl' },
    h('thead', {}, h('tr', {}, ['Role', 'Element', 'Background', 'Text colour', 'Size', 'Weight', fontCol ? 'Font' : 'Radius', kindOf(atlas).screen].map(x => h('th', {}, x)))),
    h('tbody', {}, body))));
}

// HEX / RGB toggle in the top bar
const fmtButtons = document.querySelectorAll('#colorFmt button');
const showFmt = () => fmtButtons.forEach(b => { const on = b.dataset.f === colorFormat(); b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
fmtButtons.forEach(b => b.addEventListener('click', () => { setColorFormat(b.dataset.f); showFmt(); if (atlas) route(); }));
showFmt();
search.addEventListener('input', () => { q = search.value.trim().toLowerCase(); route(); });
window.addEventListener('hashchange', () => { q = ''; search.value = ''; route(); });
boot();
