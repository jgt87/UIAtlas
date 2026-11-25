// "+ New": start an extraction from the viewer. URLs are posted as a job; files are uploaded and imported. Progress is
// polled from the server; when the job finishes, onDone(atlasName) selects the new atlas. The form is built once and
// kept, so reopening it during or after a job shows that job and everything typed. Rules: new-item-model.js.
import { h } from './dom.js';
import { segmented } from './segmented.js';
import { UPLOAD_ACCEPT, UPLOAD_KINDS_TEXT } from './shared.js';
import { modal, busyButton, errorBanner, statusLine } from './dialog.js';
import { COMMON_MODES, MODES_HINT, modesValue, validate, jobRequest } from './new-item-model.js';
import { runJob, describe, fileSize, waited, Problem, clean } from './job-model.js';
import { pause, postJson, postFile, pollJob } from './requests.js';

const KINDS = [['extract', 'Website'], ['storybook', 'Storybook'], ['import', 'File']];
const DROP_TEXT = 'Drop a file here or click to choose';
export const NEW_ITEM_DIALOG = 'new-item-dialog'; // the id the "+ New" button's aria-controls names
let ui = null, onDone = () => {};

const field = (label, input, hint) => h('label', { class: 'field' }, h('span', {}, label), input, hint ? h('small', {}, hint) : null);
const send = req => req.file ? postFile(req.path, req.file) : postJson(req.path, req.json);

function dropZone(st) {
  const label = h('span', { class: 'drop-label' }, DROP_TEXT), picker = h('input', { type: 'file', accept: UPLOAD_ACCEPT, hidden: '', tabindex: '-1' });
  const choose = f => { st.file = f || null; label.textContent = st.file ? `${st.file.name} (${fileSize(st.file.size)})` : DROP_TEXT; };
  const drop = h('button', { type: 'button', class: 'drop', onclick: () => picker.click() },
    label, h('small', {}, UPLOAD_KINDS_TEXT));
  picker.onchange = () => choose(picker.files[0]);
  drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); };
  drop.ondragleave = () => drop.classList.remove('over');
  drop.ondrop = e => { e.preventDefault(); drop.classList.remove('over'); choose(e.dataTransfer.files[0]); };
  return { el: h('div', { class: 'drop-field' }, drop, picker), drop };
}

function modesFieldset() {
  const boxes = COMMON_MODES.map(([m, label]) => ({ m, label, box: h('input', { type: 'checkbox', value: m }) }));
  const custom = h('input', { type: 'text', placeholder: 'e.g. html:data-theme=dark' });
  const el = h('fieldset', { class: 'fieldset' }, h('legend', {}, 'Modes'), h('small', {}, 'Optional extra passes; each keeps its own tokens'),
    h('div', { class: 'check-row' }, boxes.map(b => h('label', { class: 'check' }, b.box, ` ${b.label}`))), field('Other modes', custom, MODES_HINT));
  return { el, custom, value: () => modesValue(boxes.filter(b => b.box.checked).map(b => b.m), custom.value) };
}

// "An atlas named … already exists": asked in place of the form's buttons, never as a second dialog
function confirmPanel(onReplace, onCancel) {
  const text = h('p', { id: 'new-item-confirm' }), cancel = h('button', { type: 'button', class: 'ghost-btn', onclick: onCancel }, 'Cancel');
  const el = h('div', { class: 'confirm', role: 'group', 'aria-labelledby': 'new-item-confirm', hidden: '' }, text,
    h('div', { class: 'confirm-actions' }, cancel, h('button', { type: 'button', class: 'primary', onclick: onReplace }, 'Replace')));
  el.ask = name => { text.textContent = `An atlas named ${name} already exists. Replace it? Its screens are cleared.`; el.hidden = false; cancel.focus(); };
  return el;
}

function fields(st) {
  const url = h('input', { type: 'url', placeholder: 'https://example.com', autocomplete: 'url' });
  const name = h('input', { type: 'text', placeholder: 'default: the host or file name' });
  const pages = h('input', { type: 'number', min: '1', max: '500', placeholder: '1' });
  const shots = h('input', { type: 'checkbox' });
  return { url, name, pages, shots, drop: dropZone(st), modes: modesFieldset(), urlField: field('URL', url),
    more: h('details', { class: 'more' }, h('summary', {}, 'More options')) };
}

function build() {
  const st = { kind: 'extract', file: null, busy: false };
  const m = modal({ id: NEW_ITEM_DIALOG, cls: 'screen-modal new-item', titleId: 'new-item-title', descId: 'new-item-desc', isBusy: () => st.busy });
  const f = fields(st), go = busyButton('Create atlas', 'Creating…'), error = errorBanner(), status = statusLine(waited);
  const log = h('pre', { class: 'job-log', hidden: '' }), actions = h('footer', { class: 'form-actions modal-foot' }, status, go);
  const self = { st, m, f, go, error, status, log, actions };
  self.confirm = confirmPanel(() => { closeConfirm(self); submit(self, true); }, () => { closeConfirm(self); go.focus(); });
  f.more.append(field('Name', f.name), field('Pages', f.pages, 'How many pages (website) or stories (Storybook) to measure'), f.modes.el);
  const kinds = segmented({ label: 'Source', items: KINDS, value: st.kind, onSelect: k => { st.kind = k; error.show(null); show(self); } });
  // the body scrolls; the replace question and the footer (status, Create atlas) sit outside it, so they stay in view
  const form = h('form', { class: 'modal-form', novalidate: '', onsubmit: e => { e.preventDefault(); submit(self); } },
    h('div', { class: 'modal-body new-form' },
      h('p', { class: 'modal-desc', id: 'new-item-desc' }, 'Measure a website or Storybook by its URL, or import a file. Text content is never stored.'),
      kinds, f.urlField, f.drop.el,
      h('label', { class: 'check' }, f.shots, ' Keep screenshots'), f.more, error, log),
    self.confirm, actions);
  m.dialog.append(h('div', { class: 'modal-panel' }, m.head(h('h2', { id: 'new-item-title' }, 'New atlas')), form));
  show(self);
  return self;
}

function show({ st, f }) {
  f.urlField.hidden = st.kind === 'import'; f.drop.el.hidden = st.kind !== 'import'; f.modes.el.hidden = st.kind === 'import';
}

const closeConfirm = self => { self.confirm.hidden = true; self.actions.hidden = false; };
const values = ({ st, f }) => ({ kind: st.kind, url: f.url.value, file: st.file, name: f.name.value, pages: f.pages.value,
  custom: f.modes.custom.value, modes: f.modes.value(), screenshots: f.shots.checked });

function focusField({ f }, field) {
  if (field === 'pages' || field === 'modes') f.more.open = true;
  ({ url: f.url, file: f.drop.drop, pages: f.pages, modes: f.modes.custom }[field])?.focus();
}

function setBusy(self, on) {
  self.st.busy = on; self.go.setBusy(on); self.m.lock(on);
  if (!on) self.status.stop();
}

function showJob({ status, log }, job) {
  if (job.status === 'queued') status.set('Waiting for the job before it…', true);
  else if (job.status === 'running') status.set(`Measuring ${job.label}…`, !job.log.length);
  log.textContent = job.log.join('\n'); log.hidden = !job.log.length; log.scrollTop = log.scrollHeight;
}

async function finish(self, job) {
  if (job.status !== 'done') throw new Problem(clean(job.error) || 'The job failed.', 'The log below says why. Change the source or the options, then create the atlas again.');
  self.status.set('Atlas created.');
  await onDone(job.atlas);
  setTimeout(() => self.m.close(), 600);
}

async function submit(self, replace = false) {
  if (self.st.busy) return;
  const input = values(self), bad = validate(input);
  self.error.show(bad);
  if (bad) return focusField(self, bad.field);
  setBusy(self, true); self.log.textContent = ''; self.log.hidden = true;
  self.status.set(input.kind === 'import' ? 'Uploading…' : 'Starting…', true);
  try {
    const r = await runJob({ send: () => send(jobRequest({ ...input, replace })), poll: pollJob, sleep: () => pause(1000), onUpdate: job => showJob(self, job) });
    if (r.conflict) { self.status.set(''); self.actions.hidden = true; return self.confirm.ask(r.conflict.name || input.name.trim()); }
    await finish(self, r.job);
  } catch (err) { self.status.set(''); self.error.show(describe(err, 'Try again.')); }
  finally { setBusy(self, false); }
}

// Built at start-up, closed, so the dialog the "+ New" button's aria-controls names always exists.
export const mountNewItem = () => { ui ||= build(); };

export function openNewItem(done) {
  onDone = done;
  mountNewItem();
  ui.m.open(ui.st.busy ? null : ui.st.kind === 'import' ? ui.f.drop.drop : ui.f.url);
}
