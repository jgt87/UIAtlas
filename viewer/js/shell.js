// The app shell around the views: the skip link, focus on a view switch, and the narrow-screen drawer that holds the
// side navigation below 760px (menu button in the top bar; Esc, the backdrop or a link close it).
import { trapTab } from './dialog.js';
import { isDismiss } from './keys.js';

const $ = id => document.getElementById(id);
// main has tabindex="-1": it takes focus from a script, never from Tab
export const focusMain = () => $('main').focus();

export function initShell() {
  const side = $('side'), btn = $('menuBtn'), backdrop = $('drawerBackdrop'), narrow = matchMedia('(max-width: 760px)');
  const isOpen = () => side.classList.contains('open');
  const setOpen = on => { side.classList.toggle('open', on); backdrop.hidden = !on; btn.setAttribute('aria-expanded', String(on)); };
  const close = returnFocus => { if (!isOpen()) return; setOpen(false); if (returnFocus) btn.focus({ preventScroll: true }); };
  btn.addEventListener('click', () => { if (isOpen()) close(true); else { setOpen(true); side.querySelector('.navitem')?.focus(); } });
  backdrop.addEventListener('click', () => close(true));
  side.addEventListener('keydown', e => {
    if (!isOpen()) return;
    if (isDismiss(e.key) && !e.isComposing) { e.preventDefault(); close(true); } else trapTab(side, e);
  });
  // a view link: the drawer closes and focus goes to the view (also on a wide screen)
  side.addEventListener('click', e => { if (e.target.closest('.navitem')) { close(false); focusMain(); } });
  narrow.addEventListener('change', () => { if (!narrow.matches) close(false); });
  // "#main" would be read as a view route, so the skip link moves focus itself
  document.querySelector('.skip-link').addEventListener('click', e => { e.preventDefault(); focusMain(); });
}
