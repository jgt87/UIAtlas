// "Export": run an export of the current atlas on the server and offer the files as downloads. While an export runs,
// reopening the dialog shows that export instead of a new form. The dialog is built once and kept, so its status line
// and error banner (live regions) stay mounted: opening it for an atlas only resets their text and the form.
import { h } from './dom.js';
import { EXPORT_FORMATS } from './shared.js';
import { modal, busyButton, errorBanner, statusLine } from './dialog.js';
import { runJob, describe, waited, Problem, clean } from './job-model.js';
import { pause, postJson, pollJob } from './requests.js';

export const EXPORT_DIALOG = 'export-dialog'; // the id the Export button's aria-controls names
let ui = null;

const downloads = files => [
  ...files.map(f => h('a', { class: 'download', href: `${f}?download`, download: '' }, h('span', { 'aria-hidden': 'true' }, '↓'), f.split('/').pop())),
  ...files.filter(f => f.endsWith('.html')).map(f => h('a', { class: 'download open', href: f, target: '_blank', rel: 'noopener' }, h('span', { 'aria-hidden': 'true' }, '↗'), 'Open the HTML page'))];

const setBusy = (self, on) => { self.st.busy = on; self.go.setBusy(on); self.m.lock(on); if (!on) self.status.stop(); };

async function submit(self) {
  if (self.st.busy) return;
  const formats = self.boxes.filter(b => b.box.checked).map(b => b.k);
  if (!formats.length) return self.error.show({ what: 'No format chosen.', fix: 'Tick at least one format above.' });
  self.error.show(null); self.files.replaceChildren(); setBusy(self, true);
  self.status.set('Exporting…', true);
  try {
    const { job } = await runJob({ send: () => postJson('/api/jobs', { type: 'export', atlas: self.atlasName, formats }), poll: pollJob, sleep: () => pause(700) });
    if (job?.status !== 'done') throw new Problem(clean(job?.error) || 'The export failed.', 'Try again; if it fails again, run `atlas export` in a terminal to see the full message.');
    self.status.set('Exported.'); // one name through the flow: Export → Exporting… → Exported.
    self.files.replaceChildren(...downloads(job.files));
  } catch (err) { self.status.set(''); self.error.show(describe(err, 'Try again.')); }
  finally { setBusy(self, false); }
}

function build() {
  const st = { busy: false };
  const m = modal({ id: EXPORT_DIALOG, cls: 'screen-modal new-item', titleId: 'export-title', descId: 'export-desc', isBusy: () => st.busy });
  const boxes = EXPORT_FORMATS.map(([k, label, hint]) => { const box = h('input', { type: 'checkbox', value: k });
    return { k, box, row: h('label', { class: 'check format' }, box, h('span', {}, h('b', {}, label), h('small', {}, ` ${hint}`))) }; });
  const self = { st, m, atlasName: '', nameEl: h('b'), boxes, go: busyButton('Export', 'Exporting…'), error: errorBanner(), status: statusLine(waited), files: h('div', { class: 'downloads' }) };
  // the body scrolls; the footer with the status and Export sits outside it, so it stays in view
  const form = h('form', { class: 'modal-form', onsubmit: e => { e.preventDefault(); submit(self); } },
    h('div', { class: 'modal-body new-form' },
      h('p', { class: 'modal-desc', id: 'export-desc' }, 'Atlas ', self.nameEl, '. Exports hold design tokens only: no source name, screenshots or text.'),
      h('fieldset', { class: 'fieldset formats' }, h('legend', {}, 'Formats'), boxes.map(b => b.row)),
      self.error, self.files),
    h('footer', { class: 'form-actions modal-foot' }, self.status, self.go));
  m.dialog.append(h('div', { class: 'modal-panel' }, m.head(h('h2', { id: 'export-title' }, 'Export design tokens')), form));
  return self;
}

// A fresh form for this atlas: every format ticked, no message, no earlier downloads.
function reset(self, atlasName) {
  self.atlasName = atlasName; self.nameEl.textContent = atlasName;
  for (const b of self.boxes) b.box.checked = true;
  self.error.show(null); self.status.set(''); self.files.replaceChildren();
}

// Built at start-up, closed, so the dialog the Export button's aria-controls names always exists.
export const mountExport = () => { ui ||= build(); };

export function openExport(atlasName) {
  mountExport();
  if (!ui.st.busy) reset(ui, atlasName);
  ui.m.open(ui.st.busy ? null : ui.boxes[0].box);
}
