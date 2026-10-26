// Token export: W3C JSON naming/types, CSS variables, and a real PDF from the token sheet.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { toDtcg, toCss, exportAtlas } from '../src/export.mjs';

const atlas = { project: { name: 'Fictive Brand', kind: 'pptx', source: 'fictive.potx', created: '2026-01-01T00:00:00.000Z' },
  tokens: { colors: [{ value: '#10069f', count: 9, label: 'accent1 · primary' }, { value: '#ffffff', count: 4 }, { value: '#ff8800', count: 1, share: 0.02 }],
    fonts: [{ value: 'Fictive Sans', count: 5 }], fontSizes: [{ value: '12pt', count: 3 }, { value: '24pt', count: 1 }], fontWeights: [{ value: '700', count: 1 }],
    spacing: [{ value: '16px', count: 2 }, { value: '8px', count: 5 }], radii: [], shadows: [{ value: '0px 2px 4px #00000033', count: 1 }],
    cssVars: [{ name: '--accent1', value: '#10069f' }, { name: '--bad name', value: 'x' }] }, screens: [] };

test('W3C JSON: typed groups, names from labels or positions, counts kept in extensions', () => {
  const j = toDtcg(atlas);
  assert.equal(j.color.$type, 'color');
  assert.equal(j.color.accent1.$value, '#10069f');
  assert.equal(j.color['2'].$value, '#ffffff');
  assert.equal(j.color['3'].$extensions['ui-atlas'].share, 0.02);
  assert.deepEqual(Object.keys(j['font-size']).filter(k => k[0] !== '$').map(k => j['font-size'][k].$value), ['24pt', '12pt']);
  assert.deepEqual(Object.keys(j.spacing).filter(k => k[0] !== '$').map(k => j.spacing[k].$value), ['8px', '16px']);
  assert.equal(j['font-weight']['1'].$value, 700);
  assert.ok(!j.radius, 'empty groups are left out');
});

test('CSS: generated variables, quoted font names, only valid source variables', () => {
  const css = toCss(atlas);
  assert.match(css, /--color-accent1: #10069f;/);
  assert.match(css, /--font-family-1: "Fictive Sans";/);
  assert.match(css, /--accent1: #10069f;/);
  assert.doesNotMatch(css, /bad name/);
});

test('exportAtlas writes all three files, and the PDF is a PDF', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'atlas-test-')), atlasDir = path.join(dir, 'fictive');
  mkdirSync(atlasDir); writeFileSync(path.join(atlasDir, 'atlas.json'), JSON.stringify(atlas));
  const files = await exportAtlas({ atlasDir });
  assert.equal(files.length, 3);
  for (const f of files) assert.ok(existsSync(f) && f.startsWith(path.join(atlasDir, 'exports')), f);
  assert.equal(readFileSync(files.find(f => f.endsWith('.pdf'))).subarray(0, 5).toString(), '%PDF-');
});
