// The one segmented control of the viewer (HEX/RGB, the measurement pass, the New dialog's source): a radiogroup with
// one tab stop. The checked segment is the tab stop (tabindex 0, the others -1); arrows, Home and End move and select
// (rules in keys.js). items: [[value, label], ...]. Pass `el` to fill a group that is already in the page.
import { h } from './dom.js';
import { segmentIndex } from './keys.js';

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
