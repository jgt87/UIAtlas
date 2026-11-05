// Background jobs for the viewer's "+ New": each job runs the CLI (bin/atlas.mjs) as a child process — the same code
// path as the command line — one at a time, with its output kept as a progress log. Uploaded files live in a temp
// folder for the duration of their import and are deleted afterwards.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, createWriteStream, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const UPLOAD_MAX = 300 * 1024 * 1024;
export const UPLOAD_TYPES = /\.(pptx|potx|pptm|ppsx|pdf|sketch|json|png|jpe?g|webp|gif|avif|bmp|svg|html?|zip)$/i;
const safeName = s => String(s || '').trim().replace(/[^a-z0-9.-]/gi, '_').slice(0, 80);
const MODE = /^[\w:=+.-]+$/;

export function createJobs({ root, dataDir = path.join(root, 'data') }) {
  const jobs = new Map(), queue = [];
  let running = null;

  // Validated request -> CLI arguments. Only known fields are passed on; nothing from the client reaches a shell.
  function argsFor(req, file) {
    const a = [];
    if (req.type === 'extract' || req.type === 'storybook') {
      let u; try { u = new URL(req.url); } catch { throw new Error('Enter a full URL, e.g. https://example.com'); }
      if (!/^https?:$/.test(u.protocol)) throw new Error('Only http(s) URLs can be measured.');
      a.push(req.type, u.href);
    } else if (req.type === 'import') a.push('import', file);
    else if (req.type === 'export') {
      const atlas = safeName(req.atlas), formats = [].concat(req.formats || []).filter(f => ['pdf', 'json', 'css', 'html'].includes(f));
      if (!atlas || !existsSync(path.join(dataDir, atlas, 'atlas.json'))) throw new Error('No such atlas.');
      if (!formats.length) throw new Error('Choose at least one format.');
      return ['export', atlas, '--format', formats.join(',')];
    } else throw new Error('Unknown job type.');
    const name = safeName(req.name); if (name) a.push('--name', name);
    const pages = Number(req.pages); if (pages >= 1 && pages <= 500) a.push('--pages', String(Math.round(pages)));
    const modes = String(req.modes || '').split(',').map(m => m.trim()).filter(Boolean);
    if (modes.length) { if (!modes.every(m => MODE.test(m))) throw new Error('Modes look like: dark, mobile, html:data-theme=dark'); a.push('--modes', modes.join(',')); }
    if (req.screenshots) a.push('--screenshots');
    return a;
  }

  function start(job) {
    running = job; job.status = 'running'; job.started = Date.now();
    const child = spawn(process.execPath, [path.join(root, 'bin', 'atlas.mjs'), ...job.args], { cwd: root, windowsHide: true });
    const take = chunk => { for (const line of String(chunk).split(/\r?\n/)) if (line.trim()) job.log.push(line.replace(job.tmp || '\0', '')); if (job.log.length > 400) job.log.splice(0, job.log.length - 400); };
    child.stdout.on('data', take); child.stderr.on('data', take);
    child.on('close', code => {
      job.status = code === 0 ? 'done' : 'failed'; job.finished = Date.now();
      // the atlas the CLI wrote: "... -> data/<name>"
      const m = job.log.map(l => /-> data\/([^\s]+)/.exec(l)).find(Boolean); if (m) job.atlas = m[1];
      // export jobs: the files written ("  data\<atlas>\exports\<file>") become download paths under /data
      job.files = job.log.map(l => /data[\\/]([^\\/\s]+)[\\/]exports[\\/](.+)$/.exec(l.trim())).filter(Boolean).map(x => `/data/${x[1]}/exports/${x[2]}`);
      if (code !== 0) job.error = job.log.filter(l => /^Error:/.test(l)).pop() || 'The job failed.';
      if (job.tmp) rmSync(job.tmp, { recursive: true, force: true });
      running = null; if (queue.length) start(queue.shift());
    });
  }

  function add(req, file, tmp) {
    const job = { id: crypto.randomUUID(), status: 'queued', log: [], created: Date.now(), args: argsFor(req, file), tmp, label: req.type === 'import' ? path.basename(file) : req.type === 'export' ? `export of ${req.atlas}` : req.url };
    jobs.set(job.id, job);
    if (running) queue.push(job); else start(job);
    return job;
  }

  // Stream an upload into its own temp folder; resolves to the saved file path.
  function receive(reqStream, filename) {
    const clean = path.basename(String(filename || '')).replace(/[^\w .()-]/g, '_');
    if (!UPLOAD_TYPES.test(clean)) return Promise.reject(new Error('That file type can’t be imported (PowerPoint, PDF, Sketch, token JSON, images, HTML/SVG or a template .zip).'));
    const tmp = mkdtempSync(path.join(os.tmpdir(), 'atlas-upload-')), file = path.join(tmp, clean);
    return new Promise((ok, fail) => {
      let size = 0; const out = createWriteStream(file);
      reqStream.on('data', c => { size += c.length; if (size > UPLOAD_MAX) { reqStream.destroy(); out.destroy(); rmSync(tmp, { recursive: true, force: true }); fail(new Error('File is larger than 300 MB.')); } });
      reqStream.pipe(out); out.on('finish', () => ok({ file, tmp })); out.on('error', e => { rmSync(tmp, { recursive: true, force: true }); fail(e); });
    });
  }

  const view = j => ({ id: j.id, status: j.status, label: j.label, log: j.log.slice(-60), atlas: j.atlas || null, files: j.files || [], error: j.error || null, created: j.created, finished: j.finished || null });
  return { add, receive, get: id => jobs.get(id) && view(jobs.get(id)), list: () => [...jobs.values()].slice(-20).map(view) };
}
