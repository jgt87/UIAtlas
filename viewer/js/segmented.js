// The one segmented control of the viewer (HEX/RGB, the mode, the New dialog's source): a radiogroup with
// one tab stop. The checked segment is the tab stop (tabindex 0, the others -1); arrows, Home and End move and select
// (rules in keys.js). items: [[value, label], ...]. Pass `el` to fill a group that is already in the page.
import { h, chevronIcon } from './dom.js';
import { segmentIndex, fitsSegments } from './keys.js';

// A segmented control holds 2-4 short options (keys.js SEGMENT_MAX); more become a select, drawn like the atlas
// picker (a field with a drawn chevron). choice() takes segmented()'s arguments (not `el`) and returns whichever fits.
export function choice({ label, items, value, onSelect, cls = '' }) {
  if (fitsSegments(items.length)) return segmented({ label, items, value, onSelect, cls });
  const select = h('select', { class: 'pick', 'aria-label': label, onchange: () => onSelect(select.value) }, items.map(([v, text]) => h('option', { value: v }, text)));
  select.value = value;
  return h('span', { class: `pick-wrap ${cls}`.trim() }, select, chevronIcon());
}

export function segmented({ label, items, value, onSelect, cls = '', el = h('div') }) {
  // data-label reserves the bold width, so selecting never shifts the neighbours (CSS ::before)
  const buttons = items.map(([v, text]) => h('button', { type: 'button', role: 'radio', 'data-v': v, 'data-label': text }, h('span', {}, text)));
  const set = v => { for (const b of buttons) { const on = b.dataset.v === v; b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1; } };
  const pick = (b, focus) => { set(b.dataset.v); if (focus) b.focus(); onSelect(b.dataset.v); };
  for (const b of buttons) b.addEventListener('click', () => pick(b, false));
  el.addEventListener('keydown', e => {
    const i = segmentIndex(e.key, buttons.length, buttons.indexOf(e.target.closest('[role="radio"]')));
    if (i < 0 || e.altKey || e.ctrlKey || e.metaKey) return;
    e.preventDefault(); pick(buttons[i], true);
  });
  el.className = `seg ${cls}`.trim(); el.setAttribute('role', 'radiogroup'); el.setAttribute('aria-label', label);
  el.replaceChildren(...buttons); set(value);
  return el;
}
