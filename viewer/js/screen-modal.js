// Screen detail modal: the screenshot (when stored) at full width plus the screen's text-free details. A native
// <dialog> opened with showModal(); dialog.js keeps Tab inside it, and Esc or a click outside the panel closes it.
import { h } from './dom.js';
import { fmtColor } from './color-format.js';
import { modal } from './dialog.js';
import { NBSP } from './job-model.js';
import { colorTally } from './view-model.js';

let m = null;

const dimensions = s => [s.width ?? '—', '×', s.height ?? '—', 'px'].join(NBSP);
const colorsRow = colors => colors.length ? h('div', {}, h('span', { class: 'k' }, 'Colours'), h('span', { class: 'modal-colors' }, colors.map(([c, n]) =>
  h('span', { class: 'pill', title: `${n}×` }, h('span', { class: 'dot', style: `background:${c}` }), fmtColor(c))))) : null;
const shot = (atlas, s, base) => s.screenshot ? h('div', { class: 'modal-shot' }, h('img', { src: base + s.screenshot, alt: s.title || s.url }))
  : h('div', { class: 'empty' }, atlas.project.screenshots === false ? 'Screenshot not stored (extract with --screenshots to keep them).' : 'No preview for this screen.');

// base: the atlas folder's URL ("/data/<name>/"), which screenshots are relative to
export function openScreen(atlas, s, base) {
  m ||= modal({ cls: 'screen-modal screen-details', titleId: 'screen-modal-title', descId: 'screen-modal-desc' });
  m.dialog.replaceChildren(h('div', { class: 'modal-panel' },
    m.head(h('div', {}, h('h2', { id: 'screen-modal-title' }, s.title || s.url), h('div', { class: 'card-url', id: 'screen-modal-desc' }, s.purpose ? `${s.purpose} · ${s.url}` : s.url))),
    h('div', { class: 'modal-body' }, shot(atlas, s, base),
      h('div', { class: 'modal-meta' },
        h('div', {}, h('span', { class: 'k' }, 'Dimensions'), dimensions(s)),
        h('div', {}, h('span', { class: 'k' }, 'Elements'), h('span', { class: 'badges' }, Object.entries(s.inventory || {}).map(([k, n]) => h('span', { class: 'badge' }, `${n} ${k}`)))),
        colorsRow(colorTally(s.elements || []))))));
  m.open(m.dialog.querySelector('.modal-close'));
}
