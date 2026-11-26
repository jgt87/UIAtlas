// The focus ring is for keyboard navigation (DESIGN.md One Focus Ring). `:focus-visible` alone does
// not hold that: after a click a browser also turns the ring on for Shift, Control, a shortcut or
// Escape, and for a focus a script sets before anything was pressed. So the page records the last
// input on <html data-modality>: "keyboard" after a navigation key, "pointer" after a press and at
// the start; atlas.css hides the ring while it is "pointer". Text fields keep theirs (a caret needs
// one). Same approach as CommonShared's ui-kit modality part.

const NAV_KEYS = new Set(['Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown', 'F6']);

/** A key press that moves focus or the active item. Alt + arrow (history), Ctrl + Tab (the
 *  browser's tabs) and anything with the meta key belong to the browser or the system. */
export const navigates = (e) => NAV_KEYS.has(e.key) && !e.altKey && !e.metaKey && !(e.ctrlKey && e.key === 'Tab');

/** Records the last input on the document's root element. */
export function initModality(doc = document) {
  const root = doc.documentElement;
  const set = (value) => { if (root.getAttribute('data-modality') !== value) root.setAttribute('data-modality', value); };
  set('pointer'); // nothing pressed yet: a focus set by script at load shows no ring
  doc.addEventListener('keydown', (e) => { if (navigates(e)) set('keyboard'); }, true);
  for (const type of ['pointerdown', 'mousedown', 'touchstart']) doc.addEventListener(type, () => set('pointer'), { capture: true, passive: true });
}
