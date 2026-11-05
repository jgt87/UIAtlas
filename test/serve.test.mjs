// The viewer server: only its own page can start jobs; a started job runs the CLI and reports the new atlas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '../src/serve.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('jobs: refused without the viewer header, a foreign Host or Origin; an upload is imported and its temp copy removed', async t => {
  const dataDir = mkdtempSync(path.join(os.tmpdir(), 'atlas-serve-')), port = 4400 + Math.floor(Math.random() * 400);
  const server = serve({ root, dataDir, port }); t.after(() => { server.close(); rmSync(dataDir, { recursive: true, force: true }); });
  await new Promise(r => server.once('listening', r));
  const base = `http://127.0.0.1:${port}`, H = { 'X-UI-Atlas': '1' };
  const post = (p, body, headers = H) => fetch(base + p, { method: 'POST', headers, body });
  assert.equal((await post('/api/jobs', '{}', {})).status, 403, 'no header');
  assert.equal((await post('/api/jobs', '{}', { ...H, Origin: 'https://elsewhere.test' })).status, 403, 'foreign origin');
  assert.equal((await post('/api/upload?filename=x.exe', 'x')).status, 400, 'file type');
  const bad = await post('/api/jobs', JSON.stringify({ type: 'extract', url: 'file:///etc/passwd' }), { ...H, 'Content-Type': 'application/json' });
  assert.match((await bad.json()).error, /http/);
  // a real import through the CLI (tokens adapter: no browser needed); the job writes into the real data/ folder,
  // so it gets a unique name and is removed afterwards
  const name = `zz-serve-test-${port}`; t.after(() => rmSync(path.join(root, 'data', name), { recursive: true, force: true }));
  let job = await (await post(`/api/upload?filename=t.json&name=${name}`, JSON.stringify({ color: { $type: 'color', brand: { $value: '#123456' } } }))).json();
  for (let i = 0; i < 60 && (job.status === 'queued' || job.status === 'running'); i++) { await new Promise(r => setTimeout(r, 250)); job = await (await fetch(`${base}/api/jobs/${job.id}`)).json(); }
  assert.equal(job.status, 'done', job.log.join('\n'));
  assert.equal(job.atlas, name);
  assert.ok(existsSync(path.join(root, 'data', name, 'atlas.json')));
  assert.ok(!job.log.some(l => l.includes(os.tmpdir())), 'no temp paths in the log');
});
