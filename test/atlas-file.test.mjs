// atlas.json on disk: atomic replace, the format marker (and files written before it), unknown fields surviving a
// read-modify-write (modes), atlas folder names and the path check of the file servers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ATLAS_FORMAT, writeJsonFile, writeTextFile, checkWritten, checkWrittenText, readAtlasFile, atlasFolderName, isInside, withFormat } from '../src/atlas-file.mjs';
import { writeAtlas } from '../src/atlas-util.mjs';
import { addModes } from '../src/modes.mjs';

const tmp = t => { const d = mkdtempSync(path.join(os.tmpdir(), 'atlas-file-')); t.after(() => rmSync(d, { recursive: true, force: true })); return d; };
const tokens = () => ({ colors: [{ value: '#123456', count: 1 }], fonts: [], fontSizes: [], fontWeights: [], lineHeights: [], letterSpacings: [], spacing: [], radii: [], shadows: [], cssVars: [] });

test('writeJsonFile replaces the file through a temp file in the same folder and leaves no temp file behind', t => {
  const dir = tmp(t), file = path.join(dir, 'atlas.json');
  writeJsonFile(file, { a: 1 });
  writeJsonFile(file, { a: 2, b: [1, 2] }, 2);
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), { a: 2, b: [1, 2] });
  assert.match(readFileSync(file, 'utf8'), /\n {2}"a": 2/, 'indentation as asked');
  assert.deepEqual(readdirSync(dir), ['atlas.json']);
});

test('writeTextFile (the CSS and HTML exports) replaces through a temp file too; a short read-back keeps the old file', t => {
  const dir = tmp(t), file = path.join(dir, 'fictive-tokens.css');
  writeTextFile(file, ':root { --a: 1px; }\n');
  writeTextFile(file, ':root { --a: 2px; }\n');
  assert.equal(readFileSync(file, 'utf8'), ':root { --a: 2px; }\n');
  assert.deepEqual(readdirSync(dir), ['fictive-tokens.css'], 'no temp file left');
  assert.throws(() => writeTextFile(file, ':root { --a: 3px; }\n', (meant, back, f) => checkWrittenText(meant, back.slice(0, 5), f)), /read back differs/);
  assert.equal(readFileSync(file, 'utf8'), ':root { --a: 2px; }\n', 'the old file is kept');
  assert.deepEqual(readdirSync(dir), ['fictive-tokens.css'], 'the temp file was removed');
});

test('checkWritten: a temp file read back short or different is refused before the rename', () => {
  const meant = JSON.stringify({ a: 1, b: [1, 2] });
  assert.doesNotThrow(() => checkWritten(meant, meant, 'atlas.json'));
  assert.throws(() => checkWritten(meant, meant.slice(0, 9), 'atlas.json'), /atlas\.json: the file read back differs/);
  assert.throws(() => checkWritten('{"a":', '{"a":', 'atlas.json'), SyntaxError, 'what was meant must parse too');
});

test('a failed write leaves the old file whole and removes its temp file', t => {
  const dir = tmp(t), file = path.join(dir, 'atlas.json');
  writeJsonFile(file, { kept: true });
  assert.throws(() => writeJsonFile(file, { n: 1n }), /BigInt/); // cannot be serialised
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), { kept: true });
  const blocked = path.join(dir, 'blocked.json'); mkdirSync(blocked); // a folder where the file should go: the rename fails
  assert.throws(() => writeJsonFile(blocked, { x: 1 }));
  assert.deepEqual(readdirSync(dir).sort(), ['atlas.json', 'blocked.json'], 'no temp file left');
});

test('writeAtlas puts the format marker first; readAtlasFile reads unmarked (format 0) files and refuses newer ones', t => {
  const dir = tmp(t);
  writeAtlas(dir, { project: { name: 'fictive', kind: 'tokens', source: 'fictive.json' }, tokens: tokens(), screens: [] });
  const text = readFileSync(path.join(dir, 'atlas.json'), 'utf8');
  assert.ok(text.startsWith(`{"format":${ATLAS_FORMAT},`), text.slice(0, 40));
  assert.equal(readAtlasFile(path.join(dir, 'atlas.json')).format, 1);

  const old = path.join(dir, 'old'); mkdirSync(old);
  writeFileSync(path.join(old, 'atlas.json'), JSON.stringify({ project: { name: 'old' }, tokens: tokens(), screens: [] }));
  assert.equal(readAtlasFile(path.join(old, 'atlas.json')).format, undefined, 'read as it is');
  const newer = path.join(dir, 'newer'); mkdirSync(newer);
  writeFileSync(path.join(newer, 'atlas.json'), JSON.stringify({ format: ATLAS_FORMAT + 1, project: {} }));
  assert.throws(() => readAtlasFile(path.join(newer, 'atlas.json')), /newer was written by a newer UI Atlas \(format 2\)/);
  writeFileSync(path.join(newer, 'atlas.json'), JSON.stringify({ format: 'one' }));
  assert.throws(() => readAtlasFile(path.join(newer, 'atlas.json')), /unreadable format marker/);
  assert.deepEqual(Object.keys(withFormat({ b: 1, format: 0, a: 2 })), ['format', 'b', 'a']);
});

test('re-importing archives the previous atlas.json unchanged in history/', t => {
  const dir = tmp(t);
  writeFileSync(path.join(dir, 'atlas.json'), JSON.stringify({ project: { name: 'old', created: '2026-01-02T03:04:05.000Z' }, tokens: tokens(), screens: [], future: { kept: 1 } }));
  writeAtlas(dir, { project: { name: 'new', kind: 'tokens', source: 'x.json' }, tokens: tokens(), screens: [] });
  const snap = JSON.parse(readFileSync(path.join(dir, 'history', '2026-01-02T03-04-05.000Z.json'), 'utf8'));
  assert.deepEqual([snap.project.name, snap.future, snap.format], ['old', { kept: 1 }, undefined]);
});

test('modes: a read-modify-write of a format-0 atlas keeps every field it doesn\'t know and adds the marker', async t => {
  const dir = tmp(t), file = path.join(dir, 'atlas.json');
  writeFileSync(file, JSON.stringify({ project: { name: 'fictive', laterField: 'x' }, tokens: tokens(), screens: [], futureSection: { a: [1, 2] } }));
  const atlas = await addModes({ atlasDir: dir, specs: ['dark'], run: async () => ({ tokens: tokens(), contrast: [] }) });
  const back = JSON.parse(readFileSync(file, 'utf8'));
  assert.equal(Object.keys(back)[0], 'format');
  assert.deepEqual([back.format, back.futureSection, back.project.laterField, Object.keys(back.modes)], [1, { a: [1, 2] }, 'x', ['dark']]);
  assert.deepEqual(atlas, back);
  assert.deepEqual(readdirSync(dir), ['atlas.json'], 'no temp file left, no history snapshot for a mode pass');
});

test('atlas folder names: the CLI\'s rule, and names that would leave data/ are refused', () => {
  assert.equal(atlasFolderName('example.com'), 'example.com');
  assert.equal(atlasFolderName('My Site/2'), 'My_Site_2');
  assert.equal(atlasFolderName('  padded name '), 'padded_name', 'outer spaces are dropped (a typed name)');
  assert.equal(atlasFolderName('x'.repeat(120)), 'x'.repeat(120), 'not cut: the folder the CLI writes is the one a job checks');
  for (const bad of ['', '.', '..', '...', '  ']) assert.throws(() => atlasFolderName(bad), /can't be an atlas name/, bad);
});

test('isInside: the base and what lies under it pass; parents and look-alike siblings do not', () => {
  const base = path.join(os.tmpdir(), 'atlas-base', 'data');
  assert.ok(isInside(base, base));
  assert.ok(isInside(base, path.join(base, 'site', 'atlas.json')));
  assert.ok(isInside(base, path.join(base, '..data', 'x')), 'a name that only starts with two dots is inside');
  assert.ok(!isInside(base, path.join(base, '..', 'data-old', 'secret.txt')), 'sibling data-old');
  assert.ok(!isInside(base, base + '-old'), 'sibling by string prefix');
  assert.ok(!isInside(base, path.dirname(base)));
  assert.ok(!isInside(base, path.parse(base).root));
});
