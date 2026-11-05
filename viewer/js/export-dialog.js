// "Export": run an export of the current atlas on the server and offer the files as downloads.
import { h } from './dom.js';

const FORMATS = [['pdf', 'PDF token sheet', 'printable A4'], ['json', 'JSON', 'W3C design tokens'], ['css', 'CSS', 'custom properties'], ['html', 'HTML + CSS', 'token page with its stylesheet']];
let dialog;

export function openExport(atlasName) {
  dialog ||= document.body.appendChild(h('dialog', { class: 'screen-modal new-item', 'aria-labelledby': 'export-title' }));
  let busy = false;
  dialog.onclick = e => { if (e.target === dialog && !busy) dialog.close(); };
  const boxes = FORMATS.map(([k, label, hint]) => { const box = h('input', { type: 'checkbox', value: k, checked: '' });
    return { k, box, row: h('label', { class: 'check format' }, box, h('span', {}, h('b', {}, label), h('small', {}, ` ${hint}`))) }; });
  const status = h('div', { class: 'job-status', role: 'status' }), files = h('div', { class: 'downloads' }), go = h('button', { type: 'submit', class: 'primary' }, 'Export');
  const form = h('form', { class: 'modal-body new-form', onsubmit: async e => { e.preventDefault(); if (busy) return;
    const formats = boxes.filter(b => b.box.checked).map(b => b.k); if (!formats.length) return (status.textContent = 'Choose at least one format.');
    busy = true; go.disabled = true; files.replaceChildren(); status.textContent = 'Exporting…';
    try {
      const res = await fetch('/api/jobs', { method: 'POST', headers: { 'X-UI-Atlas': '1', 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'export', atlas: atlasName, formats }) });
      let job = await res.json(); if (!res.ok) throw new Error(job.error || 'Could not start.');
      while (job.status === 'queued' || job.status === 'running') { await new Promise(r => setTimeout(r, 700)); job = await (await fetch(`/api/jobs/${job.id}`)).json(); }
      if (job.status !== 'done') throw new Error(job.error || 'The export failed.');
      status.textContent = 'Ready — exports contain design tokens only.';
      files.replaceChildren(...job.files.map(f => h('a', { class: 'download', href: `${f}?download`, download: '' }, h('span', {}, '↓'), f.split('/').pop())),
        ...job.files.filter(f => f.endsWith('.html')).map(f => h('a', { class: 'download open', href: f, target: '_blank', rel: 'noopener' }, h('span', {}, '↗'), 'Open the HTML page')));
    } catch (err) { status.textContent = err.message.replace(/^Error:\s*/, ''); }
    finally { busy = false; go.disabled = false; } } },
    h('p', { class: 'export-for' }, 'Atlas: ', h('b', {}, atlasName)), ...boxes.map(b => b.row), h('div', { class: 'form-actions' }, status, go), files);
  dialog.replaceChildren(h('div', { class: 'modal-panel' },
    h('header', { class: 'modal-head' }, h('h2', { id: 'export-title' }, 'Export design tokens'), h('button', { class: 'modal-close', type: 'button', 'aria-label': 'Close', onclick: () => !busy && dialog.close() }, '×')), form));
  dialog.showModal(); go.focus();
}
