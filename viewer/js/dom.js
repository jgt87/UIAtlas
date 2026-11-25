// Tiny DOM helpers shared by the viewer modules. Text children become text nodes, never markup.
export const h = (tag, attrs = {}, ...kids) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === 'class') e.className = v; else if (k === 'html') e.innerHTML = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (v != null) e.setAttribute(k, v); } for (const k of kids.flat()) if (k != null) e.append(k.nodeType ? k : document.createTextNode(k)); return e; }; // injection: `html` only ever gets the constant icon markup below (icon()); every value from an atlas goes in as a text node or an attribute
// a drawn icon, not a glyph, so it has no font size of its own: constant SVG markup only, never data
const icon = svg => h('span', { 'aria-hidden': 'true', style: 'display:contents', html: svg });
// the close cross of a dialog
export const closeIcon = () => icon('<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>');
// the busy spinner: an SVG ring stroked in currentColor (14px in buttons, 16px beside a loading label; CSS .spinner);
// .motion-alt: under reduced motion it turns slowly instead of stopping (its variant sits in the CSS motion block)
export const spinnerIcon = () => icon('<svg class="spinner motion-alt" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="8" cy="8" r="6" stroke-opacity=".25"/><path d="M14 8a6 6 0 0 0-6-6"/></svg>');
// the chevron of a select drawn like a field (the atlas picker, the mode picker): CSS places it (.pick-wrap .chevron)
export const chevronIcon = () => icon('<svg class="chevron" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6l4 4 4-4"/></svg>');
// a wide table scrolls inside this box instead of making the page scroll sideways
export const scrollBox = table => h('div', { class: 'table-scroll' }, table);
// Controls are switched off with aria-disabled="true", never the native attribute: they stay focusable, so the
// tooltip saying why (js/tooltip.js) can be reached by keyboard, pointer and touch. This stops what a press would do (click, and Enter/Space, which become a click) before
// any other handler on the element runs. Call it before adding the element's own listeners.
export const isOff = el => el.getAttribute('aria-disabled') === 'true';
export function guardDisabled(el) {
  const stop = e => { if (isOff(el)) { e.preventDefault(); e.stopImmediatePropagation(); } };
  el.addEventListener('click', stop, true);
  el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') stop(e); }, true);
  return el;
}
export const setOff = (el, off) => { if (off) el.setAttribute('aria-disabled', 'true'); else el.removeAttribute('aria-disabled'); };
