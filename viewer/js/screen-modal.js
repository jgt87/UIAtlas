// Screen detail modal: the screenshot (when stored) at full width plus the screen's text-free details. A native
// <dialog>, so Esc, focus trapping and the backdrop come from the browser; a click outside the panel closes it too.
import { h } from './dom.js';
import { fmtColor } from './color-format.js';

let dialog;
function ensureDialog() {
  if (dialog) return dialog;
  dialog = h('dialog', { class: 'screen-modal', 'aria-labelledby': 'screen-modal-title' });
  dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); }); // the backdrop is the dialog itself
  document.body.append(dialog);
  return dialog;
}

export function openScreen(atlas, s) {
  const d = ensureDialog(), base = `/data/${atlas.name}/`;
  // colours used on this screen, most used first, from its element samples
  const used = new Map(); for (const e of s.elements || []) for (const c of [e.color, e.bg, e.border]) if (c) used.set(c, (used.get(c) || 0) + 1);
  const colors = [...used].sort((a, b) => b[1] - a[1]).slice(0, 16);
  d.replaceChildren(h('div', { class: 'modal-panel' },
    h('header', { class: 'modal-head' },
      h('div', {}, h('h2', { id: 'screen-modal-title' }, s.title || s.url), h('div', { class: 'card-url' }, s.purpose ? `${s.purpose} · ${s.url}` : s.url)),
      h('button', { class: 'modal-close', type: 'button', 'aria-label': 'Close', onclick: () => d.close() }, '×')),
    h('div', { class: 'modal-body' },
      s.screenshot ? h('div', { class: 'modal-shot' }, h('img', { src: base + s.screenshot, alt: s.title || s.url }))
        : h('div', { class: 'empty' }, atlas.project.screenshots === false ? 'Screenshot not stored (extract with --screenshots to keep them).' : 'No preview for this screen.'),
      h('div', { class: 'modal-meta' },
        h('div', {}, h('span', { class: 'k' }, 'Size'), `${s.width ?? '—'} × ${s.height ?? '—'} px`),
        h('div', {}, h('span', { class: 'k' }, 'Elements'), h('span', { class: 'badges' }, Object.entries(s.inventory || {}).map(([k, n]) => h('span', { class: 'badge' }, `${n} ${k}`)))),
        colors.length ? h('div', {}, h('span', { class: 'k' }, 'Colours'), h('span', { class: 'modal-colors' }, colors.map(([c, n]) =>
          h('span', { class: 'pill', title: `${n}×` }, h('span', { class: 'dot', style: `background:${c}` }), fmtColor(c))))) : null))));
  d.showModal();
  d.querySelector('.modal-close').focus();
}
