// Background jobs for the viewer's "+ New": each job runs the CLI (bin/atlas.mjs) as a child process — the same code
// path as the command line — one at a time, with its output kept as a progress log. Uploaded files live in a temp
// folder for the duration of their import and are deleted afterwards.
// A job that would make an atlas whose name is taken is refused (409) unless the request says replace: the CLI
// itself replaces, so this is where an existing atlas is protected.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, createWriteStream } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { EXPORT_FORMAT_IDS, UPLOAD_EXTENSIONS, UPLOAD_KINDS_TEXT, isUploadName, urlKind } from '../viewer/js/shared.js';
import { validate } from './validate.mjs';
import { parseMode } from './modes.mjs';
import { atlasExists, atlasFolderName } from './atlas-file.mjs';

// The largest upload (bytes) and the longest progress log kept per job (lines). createJobs() takes others for tests.
export const UPLOAD_MAX = 300 * 1024 * 1024;
export const LOG_MAX = 400;
const megabytes = bytes => `${Math.round(bytes / 1024 / 1024 * 10) / 10} MB`; // 300 MB, as the 400 answer says it
// One chunk of a job's output into its log: one entry per non-empty line, `strip` (the temp folder) taken out, and
// only the last `max` lines kept.
export function appendLog(log, chunk, max = LOG_MAX, strip = '\0') {
  for (const line of String(chunk).split(/\r?\n/)) if (line.trim()) log.push(line.replace(strip, ''));
  if (log.length > max) log.splice(0, log.length - max);
  return log;
}
// the name an uploaded file is saved under (and, without a name, what the CLI names the atlas after)
const uploadName = filename => path.basename(String(filename || '')).replace(/[^\w .()-]/g, '_');
const MODE = /^[\w:=+.-]+$/;
const badRequest = message => Object.assign(new Error(message), { status: 400 });

// An atlas name answers 409 with this body when it is taken and the request didn't ask to replace it.
export class ConflictError extends Error {
  constructor(name) { super(`An atlas named ${name} already exists.`); this.status = 409; this.body = { error: this.message, exists: true, name }; }
}

// --- What a request may hold (src/validate.mjs). Text fields come from a form, so coercion is on. ---
function modesProblem(text) {
  for (const m of text.split(',').map(s => s.trim()).filter(Boolean)) {
    if (!MODE.test(m)) return `"${m}" is not a mode; modes look like dark, mobile, html:data-theme=dark`;
    try { parseMode(m); } catch (e) { return e.message; }
  }
  return null;
}
// the same test as the viewer's form (shared.js urlKind), worded for the API
const URL_PROBLEM = { http: null, other: 'only http(s) URLs can be measured, e.g. https://example.com', invalid: 'expected a full URL, e.g. https://example.com' };
const urlProblem = text => URL_PROBLEM[urlKind(text)];
const NAME = { type: 'string', maxLength: 80, example: 'example-site', check: v => /^[\s.]*$/.test(v) ? 'a name needs a letter or digit, e.g. example-site' : null };
const OPTIONS = {
  name: NAME,
  pages: { type: 'integer', min: 1, max: 500, example: 5 },
  modes: { type: 'string', maxLength: 300, example: 'dark, mobile', check: modesProblem },
  screenshots: { type: 'boolean' },
  replace: { type: 'boolean' },
};
const TYPE = { type: 'string', required: true };
const URL_JOB = { type: TYPE, url: { type: 'string', required: true, maxLength: 2048, hint: 'a full http(s) URL', example: 'https://example.com', check: urlProblem }, ...OPTIONS };
export const UPLOAD_QUERY = {
  filename: { type: 'string', required: true, maxLength: 200, example: 'brand-guide.pdf',
    check: v => isUploadName(uploadName(v)) ? null : `that file type can't be imported; use one of ${UPLOAD_EXTENSIONS.map(e => '.' + e).join(' ')}` },
  ...OPTIONS,
};

// CLI options of a measuring/import job; only validated values are passed on, nothing reaches a shell
function optionArgs(o) {
  const a = [];
  if (o.name) a.push('--name', atlasFolderName(o.name));
  if (o.pages) a.push('--pages', String(o.pages));
  const modes = (o.modes || '').split(',').map(m => m.trim()).filter(Boolean); if (modes.length) a.push('--modes', modes.join(','));
  if (o.screenshots) a.push('--screenshots');
  return a;
}
const hostOf = url => new URL(url).hostname;
// One entry per job type: its schema, its CLI arguments, the atlas it writes (null: none) and its label.
const JOB_TYPES = {
  extract: { schema: URL_JOB, args: o => ['extract', new URL(o.url).href, ...optionArgs(o)], target: o => o.name || hostOf(o.url), label: o => o.url },
  storybook: { schema: URL_JOB, args: o => ['storybook', new URL(o.url).href, ...optionArgs(o)], target: o => o.name || hostOf(o.url), label: o => o.url },
  import: { schema: { type: TYPE, ...OPTIONS }, needsFile: true, args: (o, file) => ['import', file, ...optionArgs(o)],
    target: (o, file) => o.name || path.basename(file).replace(/\.[^.]+$/, ''), label: (o, file) => path.basename(file) },
  export: {
    schema: { type: TYPE, atlas: { ...NAME, required: true }, formats: { type: 'array', required: true, items: { type: 'string', enum: EXPORT_FORMAT_IDS }, minItems: 1, example: ['json', 'css'] } },
    args: o => ['export', atlasFolderName(o.atlas), '--format', o.formats.join(',')], target: () => null, label: o => `export of ${o.atlas}`,
  },
};

export function createJobs({ root, dataDir = path.join(root, 'data'), node = process.execPath, uploadMax = UPLOAD_MAX, logMax = LOG_MAX }) {
  const jobs = new Map(), queue = [];
  let running = null;

  const conflictCheck = (name, replace) => { const folder = atlasFolderName(name); if (!replace && atlasExists(dataDir, folder)) throw new ConflictError(folder); };
  // Validated request -> { args, label }, or a throw: 400 for a bad field, 409 for a taken name without replace.
  function plan(req, file) {
    const kind = JOB_TYPES[req?.type];
    if (!kind) throw badRequest(`type: expected one of ${Object.keys(JOB_TYPES).join(', ')} (got ${JSON.stringify(req?.type ?? null)})`);
    if (kind.needsFile && !file) throw badRequest('Files are imported through POST /api/upload.');
    const o = validate(kind.schema, req, { coerce: true });
    if (req.type === 'export' && !atlasExists(dataDir, o.atlas)) throw badRequest('No such atlas.');
    const target = kind.target(o, file);
    if (target) conflictCheck(target, o.replace);
    return { args: kind.args(o, file), label: kind.label(o, file) };
  }

  function finish(job, code, err) {
    if (job.status !== 'running') return; // a failed spawn can report both 'error' and 'close'
    job.status = code === 0 ? 'done' : 'failed'; job.finished = Date.now();
    // the atlas the CLI wrote: "... -> data/<name>"
    const m = job.log.map(l => /-> data\/([^\s]+)/.exec(l)).find(Boolean); if (m) job.atlas = m[1];
    // export jobs: the files written ("  data\<atlas>\exports\<file>") become download paths under /data
    job.files = job.log.map(l => /data[\\/]([^\\/\s]+)[\\/]exports[\\/](.+)$/.exec(l.trim())).filter(Boolean).map(x => `/data/${x[1]}/exports/${x[2]}`);
    if (err) job.log.push(job.error = `Error: The job could not run (${err.code || 'the program did not start'}).`); // the code only: messages can hold local paths
    else if (code !== 0) job.error = job.log.filter(l => /^Error:/.test(l)).pop() || 'The job failed.';
    if (job.tmp) rmSync(job.tmp, { recursive: true, force: true });
    running = null; if (queue.length) start(queue.shift());
  }

  function start(job) {
    running = job; job.status = 'running'; job.started = Date.now();
    let child;
    try { child = spawn(node, [path.join(root, 'bin', 'atlas.mjs'), ...job.args], { cwd: root, windowsHide: true }); } catch (e) { return finish(job, null, e); }
    const take = chunk => appendLog(job.log, chunk, logMax, job.tmp || '\0');
    child.stdout?.on('data', take); child.stderr?.on('data', take);
    child.on('error', e => finish(job, null, e)); // without an 'error' listener a failed spawn ends the whole server
    child.on('close', code => finish(job, code));
  }

  function add(req, file, tmp) {
    const { args, label } = plan(req, file);
    const job = { id: crypto.randomUUID(), status: 'queued', log: [], created: Date.now(), args, tmp, label };
    jobs.set(job.id, job);
    if (running) queue.push(job); else start(job);
    return job;
  }

  // The upload query, checked before any byte is saved: its options, and 409 when its atlas name is taken.
  function checkUpload(query) {
    const o = validate(UPLOAD_QUERY, query, { coerce: true });
    conflictCheck(o.name || uploadName(o.filename).replace(/\.[^.]+$/, ''), o.replace);
    return o;
  }

  // Stream an upload into its own temp folder; resolves to the saved file path.
  function receive(reqStream, filename) {
    const clean = uploadName(filename);
    if (!isUploadName(clean)) return Promise.reject(badRequest(`That file type can’t be imported (${UPLOAD_KINDS_TEXT}).`));
    const tmp = mkdtempSync(path.join(os.tmpdir(), 'atlas-upload-')), file = path.join(tmp, clean);
    return new Promise((ok, fail) => {
      let size = 0; const out = createWriteStream(file);
      reqStream.on('data', c => { size += c.length; if (size > uploadMax) { reqStream.destroy(); out.destroy(); rmSync(tmp, { recursive: true, force: true }); fail(badRequest(`File is larger than ${megabytes(uploadMax)}.`)); } });
      reqStream.pipe(out); out.on('finish', () => ok({ file, tmp })); out.on('error', e => { rmSync(tmp, { recursive: true, force: true }); fail(e); });
    });
  }

  const view = j => ({ id: j.id, status: j.status, label: j.label, log: j.log.slice(-60), atlas: j.atlas || null, files: j.files || [], error: j.error || null, created: j.created, finished: j.finished || null });
  return { add, receive, checkUpload, get: id => jobs.get(id) && view(jobs.get(id)), list: () => [...jobs.values()].slice(-20).map(view) };
}
