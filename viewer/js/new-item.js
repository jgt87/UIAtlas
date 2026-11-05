// "+ New": start an extraction from the viewer. URLs are posted as a job; files are uploaded and imported. Progress is
// polled from the server; when the job finishes, onDone(atlasName) selects the new atlas.
import { h } from './dom.js';

const HEADERS = { 'X-UI-Atlas': '1' }; // the server only starts work for requests carrying this (see src/serve.mjs)
const ACCEPT = '.pptx,.potx,.pptm,.ppsx,.pdf,.sketch,.json,.png,.jpg,.jpeg,.webp,.gif,.avif,.bmp,.svg,.html,.htm,.zip';
let dialog;

export function openNewItem(onDone) {
  dialog ||= document.body.appendChild(h('dialog', { class: 'screen-modal new-item', 'aria-labelledby': 'new-item-title' }));
  dialog.onclick = e => { if (e.target === dialog && !busy) dialog.close(); };
  let kind = 'extract', file = null, busy = false;
  const field = (label, input, hint) => h('label', { class: 'field' }, h('span', {}, label), input, hint ? h('small', {}, hint) : null);
  const url = h('input', { type: 'url', placeholder: 'https://example.com', required: '' }), name = h('input', { type: 'text', placeholder: 'default: the host or file name' });
  const pages = h('input', { type: 'number', min: '1', max: '500', placeholder: '1' }), modes = h('input', { type: 'text', placeholder: 'e.g. dark, mobile, html:data-theme=dark' });
  const shots = h('input', { type: 'checkbox' }), log = h('pre', { class: 'job-log', hidden: '' }), status = h('div', { class: 'job-status', role: 'status' });
  const fileLabel = h('span', {}, 'Drop a file here or click to choose'), picker = h('input', { type: 'file', accept: ACCEPT, hidden: '' });
  const drop = h('div', { class: 'drop', tabindex: '0', role: 'button', onclick: () => picker.click(), onkeydown: e => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), picker.click()) },
    fileLabel, h('small', {}, 'PowerPoint, PDF, Sketch, design-token JSON, images, HTML/SVG, template .zip'), picker);
  const choose = f => { file = f || null; fileLabel.textContent = file ? `${file.name} (${(file.size / 1048576).toFixed(1)} MB)` : 'Drop a file here or click to choose'; };
  picker.onchange = () => choose(picker.files[0]);
  drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); }; drop.ondragleave = () => drop.classList.remove('over');
  drop.ondrop = e => { e.preventDefault(); drop.classList.remove('over'); choose(e.dataTransfer.files[0]); };
  const tabs = [['extract', 'Website'], ['storybook', 'Storybook'], ['import', 'File']].map(([k, label]) => h('button', { type: 'button', class: 'pill', 'data-k': k, onclick: () => { kind = k; show(); } }, label));
  const urlField = field('URL', url), fileField = drop, pagesField = field('Pages', pages, 'How many pages (website) or stories (Storybook) to measure');
  const modesField = field('Modes', modes, 'Optional extra passes, comma-separated'), go = h('button', { type: 'submit', class: 'primary' }, 'Start');
  const show = () => { for (const t of tabs) t.classList.toggle('on', t.dataset.k === kind);
    urlField.hidden = kind === 'import'; fileField.hidden = kind !== 'import'; modesField.hidden = kind === 'import'; url.required = kind !== 'import'; };
  const form = h('form', { class: 'modal-body new-form', onsubmit: async e => { e.preventDefault(); if (busy) return;
    if (kind === 'import' && !file) return (status.textContent = 'Choose a file first.');
    busy = true; go.disabled = true; status.textContent = kind === 'import' ? 'Uploading…' : 'Starting…'; log.hidden = false; log.textContent = '';
    try {
      const opts = { name: name.value.trim(), pages: pages.value, modes: modes.value.trim(), screenshots: shots.checked };
      const res = kind === 'import'
        ? await fetch(`/api/upload?${new URLSearchParams({ filename: file.name, name: opts.name, pages: opts.pages, screenshots: opts.screenshots ? '1' : '' })}`, { method: 'POST', headers: HEADERS, body: file })
        : await fetch('/api/jobs', { method: 'POST', headers: { ...HEADERS, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: kind, url: url.value.trim(), ...opts }) });
      let job = await res.json(); if (!res.ok) throw new Error(job.error || 'Could not start.');
      while (job.status === 'queued' || job.status === 'running') {
        status.textContent = job.status === 'queued' ? 'Waiting for the job before it…' : `Measuring ${job.label}…`; log.textContent = job.log.join('\n'); log.scrollTop = log.scrollHeight;
        await new Promise(r => setTimeout(r, 1000)); job = await (await fetch(`/api/jobs/${job.id}`)).json();
      }
      log.textContent = job.log.join('\n');
      if (job.status !== 'done') throw new Error(job.error || 'The job failed.');
      status.textContent = 'Done.'; await onDone(job.atlas); setTimeout(() => dialog.close(), 600);
    } catch (err) { status.textContent = err.message.replace(/^Error:\s*/, ''); }
    finally { busy = false; go.disabled = false; } } },
    h('div', { class: 'modes' }, tabs), urlField, fileField, field('Name', name), pagesField, modesField,
    h('label', { class: 'check' }, shots, ' Keep screenshots (text content is never stored either way)'),
    h('div', { class: 'form-actions' }, status, go), log);
  dialog.replaceChildren(h('div', { class: 'modal-panel' },
    h('header', { class: 'modal-head' }, h('h2', { id: 'new-item-title' }, 'New atlas'), h('button', { class: 'modal-close', type: 'button', 'aria-label': 'Close', onclick: () => !busy && dialog.close() }, '×')), form));
  show(); dialog.showModal(); (kind === 'import' ? drop : url).focus();
}
