// Shared pieces of the viewer's native <dialog>s: opened with showModal(), Tab kept inside, a click on the backdrop
// or Esc closes them unless a job is running, and focus goes back to what opened them.
import { h, closeIcon, spinnerIcon, guardDisabled, setOff } from './dom.js';
import { isDismiss, trapIndex } from './keys.js';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';
// the controls Tab can reach inside root: rendered ones only (not hidden, not in a closed <details>)
export const focusables = root => [...root.querySelectorAll(FOCUSABLE)].filter(e => e.getClientRects().length > 0);

export function trapTab(root, e) {
  if (e.key !== 'Tab') return;
  const list = focusables(root), i = trapIndex(list.length, list.indexOf(document.activeElement), e.shiftKey);
  if (i >= 0) { e.preventDefault(); list[i].focus(); }
}

// -> { dialog, close, open(focusEl), head(title), lock(on) }. While isBusy() is true (a job runs) the backdrop,
// the close button and Esc leave it open. lock(on) is called when the job starts and stops: closedby="none" tells
// the browser itself not to close it, because a browser may close a dialog on a second Esc even when 'cancel' is
// cancelled. Should one close it anyway, it opens again at once. id: what the trigger's aria-controls names.
export function modal({ id, cls, titleId, descId, isBusy = () => false }) {
  const dialog = h('dialog', { id, class: cls, 'aria-labelledby': titleId, 'aria-describedby': descId });
  let opener = null;
  const close = () => { if (!isBusy()) dialog.close(); };
  dialog.addEventListener('click', e => { if (e.target === dialog) close(); }); // the backdrop is the dialog itself
  dialog.addEventListener('cancel', e => { if (isBusy()) e.preventDefault(); });
  // Esc while an input method is composing ends the composition, not the dialog
  dialog.addEventListener('keydown', e => { if (isDismiss(e.key) && (e.isComposing || isBusy())) e.preventDefault(); trapTab(dialog, e); });
  dialog.addEventListener('close', () => {
    if (isBusy()) return dialog.showModal();
    if (opener?.isConnected) opener.focus({ preventScroll: true }); // the page stays where it was
  });
  const lock = on => dialog.setAttribute('closedby', on ? 'none' : 'closerequest');
  document.body.append(dialog);
  const open = focusEl => {
    if (!dialog.open) { opener = document.activeElement; dialog.showModal(); }
    (focusEl || focusables(dialog)[0])?.focus();
  };
  const head = (...title) => h('header', { class: 'modal-head' }, ...title,
    h('button', { class: 'modal-close', type: 'button', 'aria-label': 'Close', onclick: close }, closeIcon()));
  return { dialog, close, open, head, lock };
}

// A submit button that keeps its width while busy: both labels share one grid cell and only one is visible. Busy,
// it is aria-disabled (still focusable, announced as busy) and a press does nothing, Enter in a field included.
export function busyButton(label, busyLabel) {
  const b = guardDisabled(h('button', { type: 'submit', class: 'primary stack' }, h('span', { class: 'idle' }, label),
    h('span', { class: 'busy' }, spinnerIcon(), busyLabel)));
  b.setBusy = on => { setOff(b, on); b.classList.toggle('is-busy', on); if (on) b.setAttribute('aria-busy', 'true'); else b.removeAttribute('aria-busy'); };
  return b;
}

// An error banner (role=alert): what happened, then the fix. show(null) hides it.
export function errorBanner() {
  const what = h('p', { class: 'error-what' }), fix = h('p', { class: 'error-fix' });
  const box = h('div', { class: 'error-banner', role: 'alert', hidden: '' }, what, fix);
  box.show = p => { box.hidden = !p; what.textContent = p?.what || ''; fix.textContent = p?.fix || ''; };
  return box;
}

// "Exporting… 12 s": a phase line (role=status, announced on change) plus a waited-time counter that is not
// announced every second. timed(false) hides the counter for phases whose progress shows in a log.
export function statusLine(waitedText) {
  const phase = h('span', { role: 'status' }), clock = h('span', { class: 'job-elapsed' });
  const el = h('div', { class: 'job-status' }, phase, clock);
  let timer = 0, since = 0, shown = '';
  const tick = () => { clock.textContent = since ? ` ${waitedText(Date.now() - since)}` : ''; };
  el.set = (text, timed = false) => {
    if (shown === `${timed}|${text}`) return; // polling repeats a phase: don't make the status line announce it again
    shown = `${timed}|${text}`; phase.textContent = text; clearInterval(timer);
    since = timed ? since || Date.now() : 0; tick(); if (timed) timer = setInterval(tick, 1000);
  };
  el.stop = () => { clearInterval(timer); since = 0; shown = ''; tick(); };
  return el;
}
