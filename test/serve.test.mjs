// The viewer server: only its own page can start jobs; a started job runs the CLI and reports the new atlas; a taken
// atlas name is not replaced without asking; malformed or escaping paths are refused; a job that can't start fails
// on its own without taking the server down.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, existsSync, writeFileSync, realpathSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '../src/serve.mjs';
import { API_HEADER } from '../viewer/js/shared.js';
import { tempProgram } from './helpers/temp-program.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let nextPort = 4400 + Math.floor(Math.random() * 300);
const H = { [API_HEADER]: '1' }, JSON_H = { ...H, 'Content-Type': 'application/json' };
// temp paths as given and as the OS resolves them (Windows may hand out 8.3 short names)
const tmpForms = dir => [...new Set([dir, realpathSync.native(dir)].flatMap(d => [d, d.replace(/\\/g, '/')]))];

// program: a temp copy of the whole program (helpers/temp-program.mjs), for a test whose job runs the CLI: the CLI
// writes to data/ beside its own bin/, so the server's data folder is the copy's and the real data/ is never touched.
async function start(t, { program, ...options } = {}) {
  const port = nextPort++, dataDir = program ? program.dataDir : mkdtempSync(path.join(os.tmpdir(), 'atlas-serve-'));
  const server = serve({ root: program ? program.base : root, dataDir, port, ...options });
  t.after(() => { server.close(); if (program) program.remove(); else rmSync(dataDir, { recursive: true, force: true }); });
  await new Promise(r => server.once('listening', r));
  const base = `http://127.0.0.1:${port}`;
  return { base, dataDir, port, post: (p, body, headers = H) => fetch(base + p, { method: 'POST', headers, body }) };
}
const until = async (base, job) => {
  for (let i = 0; i < 80 && (job.status === 'queued' || job.status === 'running'); i++) { await new Promise(r => setTimeout(r, 250)); job = await (await fetch(`${base}/api/jobs/${job.id}`)).json(); }
  return job;
};
const atlasIn = (dataDir, name) => { mkdirSync(path.join(dataDir, name), { recursive: true }); writeFileSync(path.join(dataDir, name, 'atlas.json'), '{"format":1,"project":{},"tokens":{},"screens":[]}'); };

test('jobs: refused without the viewer header, a foreign Host or Origin; an upload is imported and its temp copy removed', async t => {
  const { base, post, dataDir } = await start(t, { program: tempProgram() });
  assert.equal((await post('/api/jobs', '{}', {})).status, 403, 'no header');
  assert.equal((await post('/api/jobs', '{}', { ...H, Origin: 'https://elsewhere.test' })).status, 403, 'foreign origin');
  assert.equal((await post('/api/upload?filename=x.exe', 'x')).status, 400, 'file type');
  const bad = await post('/api/jobs', JSON.stringify({ type: 'extract', url: 'file:///etc/passwd' }), JSON_H);
  assert.match((await bad.json()).error, /http/);
  // a real import through the CLI (tokens adapter: no browser needed), into the temp program's data/
  const name = 'fictive-upload';
  const job = await until(base, await (await post(`/api/upload?filename=t.json&name=${name}`, JSON.stringify({ color: { $type: 'color', brand: { $value: '#123456' } } }))).json());
  assert.equal(job.status, 'done', job.log.join('\n'));
  assert.equal(job.atlas, name);
  assert.ok(existsSync(path.join(dataDir, name, 'atlas.json')));
  for (const form of tmpForms(os.tmpdir())) assert.ok(!job.log.some(l => l.includes(form)), `no temp paths in the log (${form})`);
});

test('jobs: Origin look-alikes are refused like any foreign origin', async t => {
  const { post, port } = await start(t);
  const body = JSON.stringify({ type: 'export', atlas: 'none', formats: ['json'] });
  for (const origin of ['http://localhost.evil.example', `http://localhost.evil.example:${port}`, 'http://127.0.0.1.evil.example', `http://127.0.0.1.evil.example:${port}`,
    'http://localhost@evil.example', `http://localhost:${port}@evil.example`, 'https://localhost', `https://localhost:${port}`, `https://127.0.0.1:${port}`, 'null'])
    assert.equal((await post('/api/jobs', body, { ...JSON_H, Origin: origin })).status, 403, origin);
  assert.equal((await post('/api/jobs', body, { ...JSON_H, Origin: `http://127.0.0.1:${port}` })).status, 400, 'the page itself gets through (to "No such atlas")');
});

test('jobs: a taken atlas name answers 409 unless the request says replace', async t => {
  const { post, dataDir } = await start(t);
  atlasIn(dataDir, 'taken'); atlasIn(dataDir, 'example.com');
  const conflict = async res => { assert.equal(res.status, 409); return res.json(); };
  assert.deepEqual(await conflict(await post('/api/jobs', JSON.stringify({ type: 'extract', url: 'https://example.com/a', name: 'taken' }), JSON_H)),
    { error: 'An atlas named taken already exists.', exists: true, name: 'taken' });
  assert.equal((await conflict(await post('/api/jobs', JSON.stringify({ type: 'storybook', url: 'https://example.com/' }), JSON_H))).name, 'example.com', 'the default name is the host');
  assert.equal((await conflict(await post('/api/upload?filename=x.json&name=taken', '{}'))).name, 'taken');
  assert.equal((await conflict(await post('/api/upload?filename=taken.json', '{}'))).name, 'taken', 'the default name is the file name');
  assert.ok(existsSync(path.join(dataDir, 'taken', 'atlas.json')), 'the existing atlas is untouched');
  const badName = await post('/api/jobs', JSON.stringify({ type: 'extract', url: 'https://example.com', name: '..' }), JSON_H);
  assert.equal(badName.status, 400); assert.match((await badName.json()).error, /^name: a name needs a letter or digit/);
  const badPages = await post('/api/upload?filename=a.json&pages=lots', '{}');
  assert.equal(badPages.status, 400); assert.match((await badPages.json()).error, /^pages: expected a whole number from 1 to 500, e\.g\. 5 \(got "lots"\)$/);
});

test('jobs: with replace a taken name is accepted; a job whose program cannot start fails and the server lives on', async t => {
  const { base, post, dataDir } = await start(t, { node: path.join(os.tmpdir(), 'atlas-no-such-program', 'node-missing.exe') });
  atlasIn(dataDir, 'taken');
  const res = await post('/api/jobs', JSON.stringify({ type: 'extract', url: 'https://example.com', name: 'taken', replace: true }), JSON_H);
  assert.equal(res.status, 202);
  const job = await until(base, await res.json());
  assert.equal(job.status, 'failed');
  assert.match(job.error, /^Error: The job could not run \(ENOENT\)\.$/);
  assert.ok(!job.error.includes('atlas-no-such-program'), 'no local path in the message');
  const upload = await post('/api/upload?filename=taken.json&replace=1', '{}');
  assert.equal(upload.status, 202, 'replace=1 on an upload');
  assert.equal((await until(base, await upload.json())).status, 'failed');
  assert.equal((await fetch(`${base}/api/atlases`)).status, 200, 'the server still answers');
});

test('paths: malformed encoding is a 400, and nothing outside data/ or viewer/ is served (look-alike siblings included)', async t => {
  const { base, dataDir } = await start(t);
  for (const p of ['/%E0', '/data/%E0%A4%A', '/api/jobs/%ZZ']) assert.equal((await fetch(base + p)).status, 400, p);
  assert.equal((await fetch(`${base}/api/atlases`)).status, 200, 'the server survived');
  const sibling = `${dataDir}-old`; mkdirSync(sibling); writeFileSync(path.join(sibling, 'secret.txt'), 'not for the viewer'); t.after(() => rmSync(sibling, { recursive: true, force: true }));
  assert.equal((await fetch(`${base}/data/..%2F${path.basename(sibling)}%2Fsecret.txt`)).status, 403, 'sibling folder data-old');
  assert.equal((await fetch(`${base}/..%2Fpackage.json`)).status, 403, 'above viewer/');
  atlasIn(dataDir, 'mine');
  assert.equal((await fetch(`${base}/data/mine/atlas.json`)).status, 200);
  assert.equal((await fetch(`${base}/`)).status, 200);
});
