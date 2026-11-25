// The jobs' stated limits, each at three sizes (under, at and well over), in the unit a person sees: the upload cap
// in bytes (300 MB in the server; a small cap is passed in so no test streams 300 MB) and the progress log in lines.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { readdirSync, rmSync, statSync } from 'node:fs';
import os from 'node:os';
import { createJobs, appendLog, UPLOAD_MAX, LOG_MAX } from '../src/jobs.mjs';

const uploadDirs = () => readdirSync(os.tmpdir()).filter(d => d.startsWith('atlas-upload-'));

test('the stated limits: uploads up to 300 MB, the last 400 lines of a job log', () => {
  assert.equal(UPLOAD_MAX, 300 * 1024 * 1024);
  assert.equal(LOG_MAX, 400);
});

// an upload stream of `bytes` bytes, in 64 KiB chunks like a request body
const body = bytes => Readable.from((function* () { for (let left = bytes; left > 0; left -= 65536) yield Buffer.alloc(Math.min(left, 65536), 120); })());

test('upload cap: under and at the cap are saved whole; over it is refused with the cap in MB and leaves no temp folder', async () => {
  const cap = 1024 * 1024; // 1 MB: the same code path as the 300 MB default
  const jobs = createJobs({ root: os.tmpdir(), dataDir: os.tmpdir(), uploadMax: cap }); // receive() writes only its own temp folder
  for (const size of [cap - 1, cap]) {
    const { file, tmp } = await jobs.receive(body(size), 'fictive.json');
    try { assert.equal(statSync(file).size, size, `${size} bytes saved whole`); } finally { rmSync(tmp, { recursive: true, force: true }); }
  }
  const before = new Set(uploadDirs());
  await assert.rejects(jobs.receive(body(cap * 10), 'fictive.json'), err => err.status === 400 && /^File is larger than 1 MB\.$/.test(err.message));
  assert.deepEqual(uploadDirs().filter(d => !before.has(d)), [], 'the refused upload left no temp folder');
});

test('job log: under and at 400 lines everything is kept; ten times over keeps the newest 400 in order', () => {
  const lines = n => Array.from({ length: n }, (_, i) => `line ${i + 1}`);
  for (const n of [LOG_MAX - 1, LOG_MAX]) assert.deepEqual(appendLog([], lines(n).join('\n')), lines(n), `${n} lines`);
  const log = [];
  for (const chunk of lines(LOG_MAX * 10)) appendLog(log, `${chunk}\n`); // many small chunks, as a child process writes
  assert.equal(log.length, LOG_MAX);
  assert.deepEqual([log[0], log.at(-1)], [`line ${LOG_MAX * 9 + 1}`, `line ${LOG_MAX * 10}`]);
});

test('job log: empty lines are dropped and the temp folder is taken out of each line', () => {
  assert.deepEqual(appendLog([], 'Importing /tmp/up-1/fictive.json\r\n\r\n  \nDone', LOG_MAX, '/tmp/up-1/'), ['Importing fictive.json', 'Done']);
});
