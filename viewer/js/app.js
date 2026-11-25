// UI Atlas viewer. Fetches the list of extracted atlases, loads the selected one, and renders its views (Screens,
// Design tokens, Elements, Components, Map) with hash routing and a live search filter.
import { kindOf } from './kinds.js';
import { h, scrollBox, guardDisabled, setOff, chevronIcon } from './dom.js';
import { contrastSection } from './contrast.js';
import { loadFontFaces, fontStatus, STATUS_LABEL, fontCss, hasWeight, fallbackTag } from './fonts.js';
import { fmtColor, colorFormat, setColorFormat } from './color-format.js';
import { segmented, choice } from './segmented.js';
import { tooltip } from './tooltip.js';
import { renderComponents } from './components-view.js';
import { renderFlow } from './flow-view.js';
import { openScreen } from './screen-modal.js';
import { openNewItem, mountNewItem } from './new-item.js';
import { openExport, mountExport } from './export-dialog.js';
import { initShell, focusMain } from './shell.js';
import { loadingState, errorState, noMatches, announce } from './states.js';
import { spacingBars as barsOf, roleCounts, formatProblem } from './view-model.js';
import { SHOW_AFTER, holdResult } from './loading-timing.js';
import { pause } from './requests.js';
const main = document.getElementById('main');
const pick = document.getElementById('atlasPick');
const search = document.getElementById('search');
const meta = document.getElementById('meta');
const exportBtn = guardDisabled(document.getElementById('exportBtn')); // aria-disabled until an atlas has loaded
const exportWhy = tooltip(exportBtn, document.getElementById('exportWhy')); // why it is unavailable
pick.after(chevronIcon());
// atlasName: the selected atlas folder, kept here and never written into the loaded document
let atlas = null, atlasName = '', q = '', mode = '', loading = 0; // mode: '' = the base pass, else a key of atlas.modes
const NO_SERVER_FIX = 'Check that `atlas serve` is still running in its terminal, then retry.';

const getJson = url => fetch(url).then(r => { if (!r.ok) throw new Error(`The server answered ${r.status}.`); return r.json(); });
const setExport = (on, why) => { setOff(exportBtn, !on); exportWhy.set(on ? '' : why); };
const show = (...nodes) => { main.removeAttribute('aria-busy'); announce(''); main.replaceChildren(...nodes); };
// main keeps its height while the next atlas loads (CSS .main[aria-busy]), so the page doesn't collapse to an empty frame
const holdHeight = () => main.style.setProperty('--held-height', `${main.offsetHeight}px`);
const atlasBase = () => `/data/${encodeURIComponent(atlasName)}/`;

// Runs work() (a fetch) with a loading state in main that appears only once the wait passes SHOW_AFTER and then stays
// its minimum time (loading-timing.js), so a fast load never flashes a spinner. ticket: the load it belongs to.
async function withSpinner(text, ticket, work) {
  const started = performance.now();
  let shown = false;
  const spin = () => { if (!shown && ticket === loading) { shown = true; main.replaceChildren(loadingState(text)); } };
  const timer = setTimeout(spin, SHOW_AFTER);
  try { return await work(); } finally {
    clearTimeout(timer);
    const hold = holdResult(started, performance.now());
    if (hold && ticket === loading) { spin(); await pause(hold); }
  }
}

// select: the atlas to show (after "+ New" finished one), else the first
async function boot(select) {
  let names;
  main.setAttribute('aria-busy', 'true');
  try { names = await withSpinner('Loading the list of atlases…', loading, () => getJson('/api/atlases')); } catch (err) {
    setExport(false, 'Export needs a loaded atlas');
    return show(errorState({ what: `The list of atlases could not be loaded (${err.message.replace(/\.$/, '')}).`, fix: NO_SERVER_FIX }, () => boot(select)));
  }
  if (!names.length) { setExport(false, 'Create an atlas with + New first'); return show(h('div', { class: 'empty' }, 'No atlases yet. Click ', h('b', {}, '+ New'), ' to measure a website or import a file.')); }
  pick.replaceChildren(...names.map(n => h('option', { value: n }, n)));
  pick.onchange = () => load(pick.value);
  pick.value = names.includes(select) ? select : names[0];
  await load(pick.value);
}
document.getElementById('newItem').addEventListener('click', () => openNewItem(name => boot(name)));
exportBtn.addEventListener('click', () => atlas && openExport(atlasName));

// the sidebar's summary of the atlas; every value goes in as text
function metaNodes(a) {
  const k = kindOf(a), p = a.project, notes = p.notes || [];
  return [h('b', {}, p.name), h('br'), `${k.label}${p.previews === 'schematic' ? ' · schematic previews' : ''}`, h('br'),
    ...(a.screens.length ? [`${p.pages} ${k.screens}`, h('br')] : []), `${a.tokens.colors.length} colours · ${a.tokens.fonts.length} fonts`, h('br'),
    h('span', { class: 'meta-date' }, new Date(p.created).toLocaleString()), notes.length ? h('ul', { class: 'notes' }, notes.map(n => h('li', {}, n))) : null];
}

// Until the atlas arrives main is empty (and busy) but keeps its height; the spinner only shows for a slow load.
async function load(name) {
  const ticket = ++loading; // a later pick wins over a slower earlier load
  atlas = null; setExport(false, 'Export opens once the atlas has loaded'); announce('', true);
  holdHeight(); main.setAttribute('aria-busy', 'true'); main.replaceChildren();
  let next;
  try { next = await withSpinner(`Loading ${name}…`, ticket, () => getJson(`/data/${encodeURIComponent(name)}/atlas.json`)); } catch {
    if (ticket !== loading) return;
    return show(errorState({ what: `The atlas ${name} could not be loaded.`, fix: 'Retry. If it fails again, its atlas.json is missing or damaged: pick another atlas, or extract or import this one again.' }, () => load(name)));
  }
  if (ticket !== loading) return;
  const bad = formatProblem(next, name); // a newer format would be misread: refused, not shown
  if (bad) return show(errorState(bad, () => load(name)));
  atlas = next; atlasName = name; mode = ''; setExport(true);
  showAtlas(ticket);
}

function showAtlas(ticket) {
  const k = kindOf(atlas);
  meta.replaceChildren(...metaNodes(atlas).filter(Boolean));
  for (const a of document.querySelectorAll('.navitem')) if (a.dataset.nav === 'screens') a.textContent = k.screens[0].toUpperCase() + k.screens.slice(1);
  route();
  // web fonts load from their original URLs; re-render once they're in so names show in themselves
  if (atlas.fontFaces?.length) loadFontFaces(atlas.fontFaces).then(() => ticket === loading && route());
}
// a token-only atlas (no screens) opens on its tokens; only "#/<view>" is a route
const view = () => (location.hash.startsWith('#/') && location.hash.slice(2)) || (atlas?.screens.length ? 'screens' : 'tokens');
const VIEWS = { screens: () => renderScreens(), tokens: () => renderTokens(), elements: () => renderElements(),
  components: () => show(...renderComponents(atlas, q, () => noMatch())), map: () => show(...renderFlow(atlas)) };
function route() {
  const v = VIEWS[view()] ? view() : 'screens';
  for (const a of document.querySelectorAll('.navitem')) {
    const on = a.dataset.nav === v; a.classList.toggle('active', on);
    if (on) { a.setAttribute('aria-current', 'page'); main.setAttribute('aria-label', a.textContent); } else a.removeAttribute('aria-current');
  }
  // the tab and the history name the view and the atlas, so each entry can be told apart
  document.title = atlas ? `${main.getAttribute('aria-label')} · ${atlasName} · UI Atlas` : 'UI Atlas';
  if (atlas) VIEWS[v]();
}

// --- shared pieces of the views ---
const matches = text => !q || text.toLowerCase().includes(q); // the live search filter
const clearSearch = () => { search.value = ''; q = ''; route(); search.focus(); };
const noMatch = () => noMatches(search.value.trim(), clearSearch);
const colorValue = v => h('span', {}, h('span', { class: 'dot', style: `background:${v}` }), fmtColor(v)); // dot + HEX/RGB text
const countText = c => c.share != null ? `${(c.share * 100).toFixed(c.share < 0.1 ? 1 : 0)}%` : `${c.count}×`;
const pill = (parts, count, ...after) => h('span', { class: 'pill' }, ...parts, ' ', h('small', {}, `${count}×`), ...after);
// a heading and its wrapped items, or nothing when there are no items (extra nodes go between the two)
const section = (title, cls, items, ...between) => items.length ? [h('h2', { class: 'sec' }, title), ...between, h('div', { class: cls }, items)] : [];

// --- Screens ---
// without --screenshots there is no image at all: compact cards instead of empty boxes. A card is a <button> that
// opens the screen's details; its parts are spans because a button holds phrasing content only.
const screenShot = (s, base) => atlas.project.screenshots === false ? null
  : h('span', { class: 'shot' }, s.screenshot ? h('img', { src: base + s.screenshot, loading: 'lazy', alt: '' }) : h('span', { class: 'empty' }, 'No preview'));
const screenCard = (s, base) => h('button', { type: 'button', class: 'card clickable', 'aria-haspopup': 'dialog', onclick: () => openScreen(atlas, s, base) },
  screenShot(s, base),
  h('span', { class: 'card-body' },
    h('span', { class: 'card-title', title: s.title || s.url }, s.title || s.url),
    h('span', { class: 'card-url', title: s.purpose || s.url }, s.purpose || s.url),
    h('span', { class: 'badges' }, Object.entries(s.inventory || {}).map(([k, n]) => h('span', { class: 'badge' }, `${n} ${k}`)))));
function renderScreens() {
  if (!atlas.screens.length) return show(h('div', { class: 'empty' }, `This ${kindOf(atlas).label.toLowerCase()} has no ${kindOf(atlas).screens}; see Design tokens.`));
  const base = atlasBase(), shown = atlas.screens.filter(s => matches(s.title + ' ' + s.url));
  show(shown.length ? h('div', { class: 'grid' }, shown.map(s => screenCard(s, base))) : noMatch());
}

// --- Design tokens ---
// what a colour is used for, most used first: 'text 23 · bg 4'
const usageText = u => Object.entries(u || {}).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k === 'background' ? 'bg' : k} ${n}`).join(' · ');
const swatch = c => h('div', { class: 'swatch' },
  h('div', { class: 'chip', style: `background:${c.value}` }),
  h('div', { class: 'lbl' }, fmtColor(c.value), c.label ? h('small', {}, c.label) : null, c.usage ? h('small', {}, usageText(c.usage)) : null, h('small', {}, countText(c))));
const swatches = colors => colors.filter(c => matches(c.value + ' ' + (c.label || '') + ' ' + usageText(c.usage))).map(swatch);
// the font size and family are the source's values, so they stay inline styles
const typeScale = t => t.fontSizes.slice().sort((a, b) => parseFloat(b.value) - parseFloat(a.value)).map(f =>
  h('div', { class: 'row' }, h('span', { class: 'k' }, f.value), h('span', { style: `font-size:${f.value};${fontCss(t.fonts[0]?.value || 'system-ui')}` }, 'The quick brown fox'), h('span', { class: 'count end' }, `${f.count}×`)));
// one grid for all rows, so every bar starts at the same x; the widths come from view-model.js
const spacingBars = spacing => barsOf(spacing).map(s =>
  h('div', { class: 'row' }, h('span', { class: 'k' }, s.value), h('span', { class: 'bar', style: `width:${s.width}px` }), h('span', { class: 'count' }, `${s.count}×`)));
// each family shown in itself, with whether that's the real font (web font / installed) or a fallback
const fontRow = f => { const st = fontStatus(f.value, atlas.fontFaces); return h('div', { class: 'font-row' + (st === 'missing' ? ' missing' : '') },
  h('span', { class: 'font-demo', style: fontCss(f.value) }, f.value), st === 'missing' ? fallbackTag(h) : h('small', {}, STATUS_LABEL[st]), h('span', { class: 'count' }, `${f.count}×`)); };
const fallbackNote = (primary, status) => status === 'missing' ? h('p', { class: 'fallback-note' }, fallbackTag(h), ` ${primary} seems not to be installed here, so these samples probably show a fallback font.`) : null;
// weights in the primary font; a web font without that weight is drawn synthesized, which is marked
const weightTag = (primary, status, w) => status === 'web' && !hasWeight(primary, w.value) ? h('span', { class: 'tag-fallback', title: `${primary} has no ${w.value} weight loaded; the browser fakes it.` }, 'synthesized')
  : status === 'missing' ? fallbackTag(h) : null;
const weightPill = (primary, status) => w => pill([h('span', { style: `font-weight:${w.value};${primary ? fontCss(primary) : ''}` }, w.value)], w.count, weightTag(primary, status, w));
const radiusPill = r => pill([h('span', { class: 'dot radius-dot', style: `border-radius:${r.value}` }), r.value], r.count);
const shadowBox = s => h('div', { class: 'shadow-box', style: `box-shadow:${s.value}`, title: s.value });
const varRow = v => h('tr', {}, h('td', {}, v.name), h('td', {}, /^#|rgb|hsl/.test(v.value) ? colorValue(v.value) : v.value));
// light/dark, screen sizes, themes: switch which mode's tokens are shown (the same segmented control as HEX/RGB, or a
// select once there are more than four options); the view is drawn again for the new mode, so focus goes back to the
// checked segment, or the select, of the new control
const pickMode = m => { mode = m; renderTokens(); main.querySelector('.modes [aria-checked="true"], .modes select')?.focus(); };
const modeButtons = modes => modes.length ? choice({ cls: 'modes', label: 'Mode', items: ['', ...modes].map(m => [m, m || 'Base']), value: mode, onSelect: pickMode }) : null;

// the tokens and contrast of the selected pass: the base extraction, or one of its modes
const shownPass = () => { const current = mode && atlas.modes?.[mode];
  return { t: { lineHeights: [], letterSpacings: [], ...(current ? current.tokens : atlas.tokens) }, contrast: current ? current.contrast : atlas.contrast }; };
const varsSection = t => { const vars = (t.cssVars || []).filter(v => matches(v.name + v.value)).map(varRow);
  return vars.length ? [h('h2', { class: 'sec' }, `${kindOf(atlas).vars} (${(t.cssVars || []).length})`), scrollBox(h('table', { class: 'vars' }, h('tbody', {}, vars)))] : []; };
const palette = t => { const list = swatches(t.colors); return list.length || !q ? h('div', { class: 'swatches' }, list) : noMatch(); };

function renderTokens() {
  const { t, contrast } = shownPass();
  const primary = t.fonts[0]?.value, primaryStatus = primary && fontStatus(primary, atlas.fontFaces);
  show(...[
    modeButtons(Object.keys(atlas.modes || {})),
    h('h2', { class: 'sec' }, `Colour palette (${t.colors.length})`), palette(t),
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
// one plain tag per role with its count, most common first (a summary, not a filter)
const roleSummary = rows => h('div', { class: 'chips-row role-summary' }, roleCounts(rows).map(([role, n]) => h('span', { class: 'badge' }, `${role} ${n}`)));
const colorCell = v => h('td', { class: 'mono' }, v ? colorValue(v) : '—');
// design files carry font names (shown in themselves); web pages carry radii
const styleCell = (e, fontCol) => fontCol && e.font ? h('td', {}, h('span', { style: fontCss(e.font) }, e.font), fontStatus(e.font, atlas.fontFaces) === 'missing' ? fallbackTag(h) : null)
  : h('td', { class: 'mono' }, (fontCol ? e.font : e.radius) || '—');
const elementRow = fontCol => e => h('tr', {},
  h('td', { class: 'rolecell' }, e.role),
  h('td', {}, e.name || h('span', { class: 'muted' }, `<${e.tag}>`)), // atlases hold no text content
  colorCell(e.bg), colorCell(e.color),
  h('td', { class: 'mono' }, e.fontSize || '—'), h('td', { class: 'mono' }, e.weight || '—'), styleCell(e, fontCol),
  h('td', { class: 'screen-cell' }, e.screen));
function renderElements() {
  const rows = elementRows();
  if (!rows.length) return show(h('div', { class: 'empty' }, 'No elements in this atlas.'));
  const fontCol = rows.some(r => r.font);
  const body = rows.filter(r => matches([r.name, r.role, r.tag, r.screen].join(' '))).slice(0, 600).map(elementRow(fontCol));
  if (!body.length) return show(roleSummary(rows), noMatch());
  show(roleSummary(rows), scrollBox(h('table', { class: 'tbl' },
    h('thead', {}, h('tr', {}, ['Role', 'Element', 'Background', 'Text colour', 'Font size', 'Weight', fontCol ? 'Font' : 'Radius', kindOf(atlas).screen].map(x => h('th', {}, x)))),
    h('tbody', {}, body))));
}

// HEX / RGB toggle in the top bar
segmented({ el: document.getElementById('colorFmt'), label: 'Colour notation', items: [['hex', 'HEX'], ['rgb', 'RGB']], value: colorFormat(),
  onSelect: f => { setColorFormat(f); if (atlas) route(); } });
initShell();
// the dialogs the top bar's aria-controls name exist (closed) from the start
mountNewItem(); mountExport();
search.addEventListener('input', () => { q = search.value.trim().toLowerCase(); route(); });
// a view switch moves focus to the new view, so keyboard and screen-reader users land in it
window.addEventListener('hashchange', () => { q = ''; search.value = ''; route(); focusMain(); });
boot();
