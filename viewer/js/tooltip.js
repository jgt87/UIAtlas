// The viewer's tooltip: a short hint for one control, such as why an unavailable button can't be used yet. The hint
// is a role="tooltip" element the control names with aria-describedby, so a screen reader reads it with the control
// even while it is not drawn. It is drawn at once on keyboard focus, after HOVER_DELAY on hover (only where the
// device can hover), and on a tap (touch has no hover); blur, leaving, Esc, a press elsewhere, scroll and wheel hide
// it. No fade: the viewer's only motions are the drawer and the spinner (DESIGN.md Motion).
// tip: the role="tooltip" element, already in the page (index.html), so the hint is there before any script runs.
// set(text) changes the hint; set('') removes it, and the control then has no description at all.
export const HOVER_DELAY = 600; // ms before a hover shows it (the shared 500-800ms)
export const EXIT_GUARD = 150;  // ms a pointer may leave and come back before it hides (the shared 100-200ms)
const GAP = 6, EDGE = 4;        // px from the control; px kept from the window's edge

// Where the hint goes: above the control, below it when there is no room above, kept inside the window.
export function tipPosition(anchor, tip, view) {
  const above = anchor.top - GAP - tip.height, top = above >= EDGE ? above : anchor.bottom + GAP;
  const centred = anchor.left + anchor.width / 2 - tip.width / 2;
  return { top, left: Math.max(EDGE, Math.min(centred, view.width - tip.width - EDGE)) };
}

export function tooltip(trigger, tip) {
  const canHover = matchMedia('(hover: hover) and (pointer: fine)');
  let timer = 0;
  const later = (fn, ms) => { clearTimeout(timer); timer = setTimeout(fn, ms); };
  const hide = () => { clearTimeout(timer); tip.hidden = true; };
  const show = () => {
    clearTimeout(timer);
    if (!tip.textContent) return;
    tip.hidden = false; // drawn first, so it can be measured; the anchor is measured again on every show
    const { top, left } = tipPosition(trigger.getBoundingClientRect(), tip.getBoundingClientRect(), { width: innerWidth });
    tip.style.top = `${top}px`; tip.style.left = `${left}px`;
  };
  trigger.addEventListener('focus', () => { if (trigger.matches(':focus-visible')) show(); });
  trigger.addEventListener('blur', hide);
  trigger.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse' && canHover.matches) later(show, tip.hidden ? HOVER_DELAY : 0); });
  trigger.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') later(hide, EXIT_GUARD); });
  trigger.addEventListener('pointerup', e => { if (e.pointerType !== 'mouse') show(); });
  document.addEventListener('pointerdown', e => { if (e.target !== trigger && !trigger.contains(e.target)) hide(); }, true);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !tip.hidden) hide(); });
  addEventListener('scroll', hide, true);
  addEventListener('wheel', hide, { passive: true });
  return {
    set(text) {
      tip.textContent = text || '';
      if (text) trigger.setAttribute('aria-describedby', tip.id); else { trigger.removeAttribute('aria-describedby'); hide(); }
    },
  };
}
