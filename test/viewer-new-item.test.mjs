// The "+ New" and Export dialogs without the DOM: form rules (viewer/js/new-item-model.js) and the job runner
// with its 409 "already exists" answer (viewer/js/job-model.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { validate, modesValue, badModePart, jobRequest } from '../viewer/js/new-item-model.js';
import { runJob, describe, conflictOf, waited, fileSize, Problem, NBSP } from '../viewer/js/job-model.js';

const site = { kind: 'extract', url: 'https://example.com', pages: '', custom: '' };

test('a website needs a full http(s) URL', () => {
  assert.equal(validate(site), null);
  assert.equal(validate({ ...site, url: ' ' }).field, 'url');
  assert.equal(validate({ ...site, url: 'example.com' }).field, 'url');
  assert.equal(validate({ ...site, url: 'ftp://example.com' }).field, 'url');
});

test('a file import needs a file of a type the server takes, and no URL', () => {
  const file = { kind: 'import', url: '', file: { name: 'deck.pptx' }, pages: '' };
  assert.equal(validate(file), null);
  assert.equal(validate({ ...file, file: null }).field, 'file');
  assert.equal(validate({ ...file, file: { name: 'notes.docx' } }).field, 'file');
});

test('pages are a whole number from 1 to 500, or empty', () => {
  for (const pages of ['', '1', '500']) assert.equal(validate({ ...site, pages }), null, pages);
  for (const pages of ['0', '501', '2.5', 'x']) assert.equal(validate({ ...site, pages }).field, 'pages', pages);
});

test('modes follow parseMode: known words, sizes, attributes and globals joined with +', () => {
  for (const m of ['dark', 'dark+mobile', '1024x768', 'html:data-theme=dark', 'theme=g100']) assert.equal(badModePart(m), undefined, m);
  assert.equal(badModePart('dark+sepia'), 'sepia');
  assert.equal(validate({ ...site, custom: 'light, sepia' }).field, 'modes');
  assert.equal(modesValue(['dark', 'mobile'], 'dark, html:data-theme=dark'), 'dark,mobile,html:data-theme=dark');
  assert.equal(modesValue([], ''), '');
});

test('every problem says what happened and how to fix it', () => {
  const p = validate({ ...site, url: '' });
  assert.ok(p.what && p.fix);
});

test('the request: JSON for a URL, the raw file for an upload; replace only when asked', () => {
  const url = jobRequest({ ...site, name: ' shop ', modes: 'dark', screenshots: true });
  assert.equal(url.path, '/api/jobs');
  assert.deepEqual(url.json, { type: 'extract', url: 'https://example.com', name: 'shop', pages: '', modes: 'dark', screenshots: true });
  assert.equal(jobRequest({ ...site, replace: true }).json.replace, true);
  const file = { name: 'deck.pptx' }, up = jobRequest({ kind: 'import', file, replace: true });
  assert.equal(up.file, file);
  const q = new URL(up.path, 'http://x').searchParams;
  assert.equal(q.get('filename'), 'deck.pptx');
  assert.equal(q.get('replace'), '1');
  assert.equal(new URL(jobRequest({ kind: 'import', file }).path, 'http://x').searchParams.has('replace'), false);
});

test('a 409 "exists" answer is a question, not a failure, and starts nothing', async () => {
  assert.deepEqual(conflictOf(409, { error: 'x', exists: true, name: 'shop' }), { name: 'shop' });
  assert.equal(conflictOf(409, { error: 'x' }), null);
  let polled = false;
  const r = await runJob({ send: async () => ({ status: 409, body: { exists: true, name: 'shop' } }), poll: async () => { polled = true; }, sleep: async () => {} });
  assert.deepEqual(r, { conflict: { name: 'shop' } });
  assert.equal(polled, false);
});

test('a job is polled until it stops, and every state is reported', async () => {
  const states = ['running', 'done'], seen = [];
  const r = await runJob({ send: async () => ({ status: 202, body: { id: 'j1', status: 'queued' } }),
    poll: async id => ({ id, status: states.shift() }), sleep: async () => {}, onUpdate: j => seen.push(j.status) });
  assert.equal(r.job.status, 'done');
  assert.deepEqual(seen, ['queued', 'running', 'done']);
});

test('a refused request and an unreachable server become what happened + the fix', async () => {
  await assert.rejects(runJob({ send: async () => ({ status: 400, body: { error: 'Error: No such atlas.' } }), poll: null, sleep: null }),
    e => e instanceof Problem && e.what === 'No such atlas.' && !!e.fix);
  const offline = describe(new TypeError('Failed to fetch'), 'x');
  assert.match(offline.what, /did not answer/);
  assert.match(offline.fix, /atlas serve/);
  assert.deepEqual(describe(new Error('Error: boom'), 'retry'), { what: 'boom', fix: 'retry' });
});

test('numbers and units are joined with a no-break space', () => {
  assert.equal(waited(12_400), `12${NBSP}s`);
  assert.equal(fileSize(1048576 * 2.5), `2.5${NBSP}MB`);
});
