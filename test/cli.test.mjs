// The CLI: making an atlas under a taken name replaces it and says so; option values are checked before anything
// runs, with the option, what it expects and an example.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { tempProgram } from './helpers/temp-program.mjs';

// The CLI writes to data/ beside its own bin/, so every run here is of a temp copy of the program (helpers/temp-program.mjs)
// and never touches the real data/.
const cliIn = (base, ...args) => spawnSync(process.execPath, [path.join(base, 'bin', 'atlas.mjs'), ...args], { cwd: base, encoding: 'utf8' });

test('import into a taken name replaces the atlas, says so, and keeps the previous one in history/', t => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'atlas-cli-')), { base, dataDir, remove } = tempProgram(), name = 'fictive-cli', atlasDir = path.join(dataDir, name);
  t.after(() => { rmSync(dir, { recursive: true, force: true }); remove(); });
  const src = path.join(dir, 'fictive.tokens.json');
  writeFileSync(src, JSON.stringify({ color: { $type: 'color', brand: { $value: '#2b5f8c' } } }));
  const first = cliIn(base, 'import', src, '--name', name);
  assert.equal(first.status, 0, first.stderr);
  assert.doesNotMatch(first.stdout, /Replacing/);
  assert.equal(JSON.parse(readFileSync(path.join(atlasDir, 'atlas.json'), 'utf8')).format, 1);
  const second = cliIn(base, 'import', src, '--name', name);
  assert.equal(second.status, 0, second.stderr);
  assert.match(second.stdout, new RegExp(`Replacing the existing atlas data/${name} \\(its previous atlas\\.json is kept in history/\\)\\.`));
  assert.ok(existsSync(path.join(atlasDir, 'history')), 'previous atlas archived');
});

test('option values are validated with the option, the expectation and an example', t => {
  // refused before anything runs; still a temp copy, so a regression can't measure into the real data/
  const { base, remove } = tempProgram(); t.after(remove);
  const run = (...args) => { const r = cliIn(base, ...args); assert.equal(r.status, 1, r.stdout); return r.stderr.trim(); };
  assert.equal(run('extract', 'https://example.com', '--pages', 'lots'), 'Error: --pages: expected a whole number from 1 to 10000, e.g. 5 (got "lots")');
  assert.equal(run('serve', '--port', '70000'), 'Error: --port: expected a whole number from 1 to 65535, e.g. 4300 (got 70000)');
  assert.match(run('export', 'anything', '--format', 'json,docx'), /^Error: --format\[1\]: expected one of pdf, json, css, html \(got "docx"\)$/);
  assert.match(run('import', 'x', '--kind', 'word'), /^Error: --kind: expected one of pptx, retheme, storybook, image, tokens, sketch, pdf, html \(got "word"\)$/);
  assert.match(run('extract', 'https://example.com', '--name', '..'), /^Error: "\.\." can't be an atlas name/, 'refused before anything is measured');
});
