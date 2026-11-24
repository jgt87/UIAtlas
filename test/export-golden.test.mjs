// Golden test: a committed fixture atlas (test/fixtures/golden/atlas, invented values) exported to JSON, CSS and HTML
// must match the committed files in test/fixtures/golden/expected byte for byte, so a refactor of the export or of
// src/tokens-json.mjs is proven output-identical. An intended change of the output updates them:
//   UPDATE_GOLDEN=1 node --test test/export-golden.test.mjs     (then review the diff of test/fixtures/golden/expected)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exportAtlas } from '../src/export.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const atlasDir = path.join(here, 'fixtures', 'golden', 'atlas'), expectedDir = path.join(here, 'fixtures', 'golden', 'expected');
const EXPORTED = '2026-02-01T00:00:00.000Z'; // the export time written into the JSON: fixed, so the output is reproducible

test('JSON, CSS and HTML exports of the fixture atlas match the golden files', async t => {
  const out = mkdtempSync(path.join(os.tmpdir(), 'atlas-golden-')); t.after(() => rmSync(out, { recursive: true, force: true }));
  const files = await exportAtlas({ atlasDir, outDir: out, formats: ['json', 'css', 'html'], exported: EXPORTED });
  const names = files.map(f => path.basename(f)).sort();
  assert.deepEqual(names, ['golden-fixture-tokens.css', 'golden-fixture-tokens.html', 'golden-fixture.tokens.json']);
  if (process.env.UPDATE_GOLDEN) for (const n of names) writeFileSync(path.join(expectedDir, n), readFileSync(path.join(out, n)));
  assert.deepEqual(readdirSync(expectedDir).sort(), names, 'one golden file per export, nothing stale');
  for (const n of names) assert.equal(readFileSync(path.join(out, n), 'utf8'), readFileSync(path.join(expectedDir, n), 'utf8'), `${n} differs from its golden file`);
});

test('the golden files hold no source name, URL or copy from the fixture', () => {
  for (const n of readdirSync(expectedDir)) {
    const text = readFileSync(path.join(expectedDir, n), 'utf8');
    for (const s of ['Golden Fixture', 'golden.example.test', 'Invented sale copy', 'Invented values']) assert.ok(!text.includes(s), `${n} contains "${s}"`);
  }
});
