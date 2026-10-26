// Atlas comparison: colour matching in CIEDE2000, unit-normalised dimensions, near-duplicates, score, history snapshots.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { compareAtlases, formatReport, latestSnapshot, deltaE2000, colorDistance } from '../src/compare.mjs';

const atlas = (name, kind, tokens) => ({ project: { name, kind, created: '2026-01-01T00:00:00.000Z' }, tokens, screens: [] });
const brand = atlas('Fictive Brand', 'tokens', {
  colors: [{ value: '#1a2b8c', count: 1 }, { value: '#ffffff', count: 1 }, { value: '#e0e0e0', count: 1 }, { value: '#ff6a13', count: 1 }],
  fonts: [{ value: 'Fictive Sans', count: 1 }], fontSizes: [{ value: '12pt', count: 1 }, { value: '1.5rem', count: 1 }],
  fontWeights: [{ value: '400', count: 1 }, { value: 'bold', count: 1 }], spacing: [{ value: '8px', count: 1 }, { value: '1rem', count: 1 }],
  radii: [{ value: '4px', count: 1 }, { value: '50%', count: 1 }], shadows: [], cssVars: [],
  lineHeights: [{ value: '1.5', count: 1 }], letterSpacings: [{ value: '0.5px', count: 1 }] });
const site = atlas('example.test', 'web', {
  colors: [{ value: '#1a2b8c', count: 40, usage: { text: 30, background: 10, border: 0, fill: 0 } }, { value: '#FFFFFF', count: 30 },
    { value: '#e2e2e2', count: 10 }, { value: '#00a651', count: 8, usage: { text: 0, background: 8, border: 0, fill: 0 } }, { value: '#1a2b8c80', count: 2 }],
  fonts: [{ value: 'fictive sans, Arial, sans-serif', count: 50 }, { value: 'Comic Mono', count: 2 }],
  fontSizes: [{ value: '16px', count: 30 }, { value: '24px', count: 10 }, { value: '15px', count: 3 }],
  fontWeights: [{ value: '700', count: 5 }, { value: '400', count: 20 }, { value: '300', count: 1 }],
  spacing: [{ value: '16px', count: 9 }, { value: '0.5rem', count: 4 }, { value: '12px', count: 2 }],
  radii: [{ value: '50%', count: 3 }, { value: '8px 8px 0px 0px', count: 1 }], shadows: [], cssVars: [] });

test('CIEDE2000 matches the published reference pairs', () => {
  assert.equal(Math.round(deltaE2000({ L: 50, a: 2.6772, b: -79.7751 }, { L: 50, a: 0, b: -82.7485 }) * 1e4) / 1e4, 2.0425);
  assert.equal(Math.round(deltaE2000({ L: 50, a: 2.5, b: 0 }, { L: 73, a: 25, b: -18 }) * 1e4) / 1e4, 27.1492);
  assert.ok(colorDistance('#e0e0e0', '#e2e2e2') < 1 && colorDistance('#e0e0e0', '#e8e8e8') < 3 && colorDistance('#e0e0e0', '#f0f0f0') > 3);
});

test('colours: exact, near, off-brand with nearest, alpha, usage kept', () => {
  const r = compareAtlases(site, brand);
  const m = Object.fromEntries(r.colors.matched.map(x => [x.value, x]));
  assert.equal(m['#1a2b8c'].exact, true);
  assert.equal(m['#FFFFFF'].exact, true, 'case-insensitive hex');
  assert.equal(m['#e2e2e2'].exact, false); assert.equal(m['#e2e2e2'].ref, '#e0e0e0'); assert.ok(m['#e2e2e2'].deltaE > 0 && m['#e2e2e2'].deltaE < 1);
  assert.deepEqual(r.colors.offBrand.map(x => x.value), ['#00a651', '#1a2b8c80'], 'sorted by count; translucent is not the opaque brand colour');
  assert.equal(r.colors.offBrand[0].usage.background, 8);
  assert.ok(r.colors.offBrand[0].nearest.value && r.colors.offBrand[0].nearest.deltaE > 3);
  assert.equal(r.colors.offBrand[1].nearest.value, '#1a2b8c');
  assert.deepEqual(r.colors.unused, [{ value: '#ff6a13' }]);
  assert.equal(compareAtlases(site, brand, { deltaE: 0.1 }).colors.matched.find(x => x.value === '#e2e2e2'), undefined, 'threshold is honoured');
});

test('near-duplicates within the target', () => {
  const t = atlas('t', 'web', { colors: [{ value: '#e0e0e0', count: 3 }, { value: '#e2e2e2', count: 2 }, { value: '#e8e8e8', count: 1 }, { value: '#e0e0e0', count: 1 }, { value: '#222222', count: 1 }] });
  const d = compareAtlases(t, brand).colors.nearDuplicates;
  assert.ok(d.some(x => x.a === '#e0e0e0' && x.b === '#e2e2e2'));
  assert.ok(d.some(x => x.a === '#e0e0e0' && x.b === '#e8e8e8'));
  assert.ok(!d.some(x => x.a === x.b), 'identical values are not near-duplicates');
  assert.ok(!d.some(x => x.b === '#222222' || x.a === '#222222'));
  assert.ok(d.every((x, i) => !i || d[i - 1].deltaE <= x.deltaE), 'closest first');
});

test('dimensions, fonts and weights are normalised before comparing', () => {
  const r = compareAtlases(site, brand);
  const ref = (k, v) => r[k].matched.find(x => x.value === v)?.ref;
  assert.equal(ref('fontSizes', '16px'), '12pt'); assert.equal(ref('fontSizes', '24px'), '1.5rem');
  assert.deepEqual(r.fontSizes.missing, [{ value: '15px', count: 3, nearest: { value: '12pt', diff: 1 } }]);
  assert.equal(ref('spacing', '16px'), '1rem'); assert.equal(ref('spacing', '0.5rem'), '8px');
  assert.equal(ref('radii', '50%'), '50%'); assert.equal(r.radii.missing[0].value, '8px 8px 0px 0px');
  assert.equal(ref('fonts', 'fictive sans, Arial, sans-serif'), 'Fictive Sans'); assert.equal(r.fonts.missing[0].value, 'Comic Mono');
  assert.equal(ref('fontWeights', '700'), 'bold'); assert.equal(r.fontWeights.missing[0].value, '300');
  assert.deepEqual(r.lineHeights, { matched: [], missing: [], unused: [{ value: '1.5' }] });
});

test('older atlases without optional lists or usage do not crash; score is usage-weighted', () => {
  const old = atlas('old', 'web', { colors: [{ value: '#1a2b8c', count: 3 }, { value: '#00a651', count: 1 }], fonts: [{ value: 'Fictive Sans', count: 4 }] });
  const r = compareAtlases(old, { project: { name: 'bare' } });
  assert.equal(r.summary.score, 0); assert.equal(r.colors.offBrand[0].nearest, null);
  const s = compareAtlases(old, brand);
  assert.equal(s.summary.score, 0.88, '7 of 8 counted usages match'); // 3 colour + 4 font of 3+1+4
  assert.equal(s.summary.scores.colors, 0.75); assert.equal(s.summary.scores.lineHeights, null);
  assert.equal(compareAtlases(brand, brand).summary.score, 1);
  assert.equal(compareAtlases(atlas('e', 'web', {}), brand).summary.score, 1, 'nothing used, nothing off-brand');
});

test('formatReport is a short plain-text summary of names and token values', () => {
  const r = compareAtlases(site, brand), txt = formatReport(r);
  assert.match(txt, /^example\.test \(web\) vs Fictive Brand \(tokens\)/);
  assert.match(txt, /Score: \d+%/); assert.match(txt, /off-brand #00a651 x8 -> nearest/); assert.match(txt, /fontSizes: .*15px \(~12pt\)/);
  assert.ok(txt.split('\n').length < 25);
  assert.equal(JSON.parse(JSON.stringify(r)).target.name, 'example.test', 'report is plain JSON');
});

test('latestSnapshot returns the newest history file or null', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'atlas-compare-'));
  assert.equal(latestSnapshot(dir), null);
  mkdirSync(path.join(dir, 'history'));
  assert.equal(latestSnapshot(dir), null);
  const put = (ts, name) => writeFileSync(path.join(dir, 'history', ts.replace(/:/g, '-') + '.json'), JSON.stringify(atlas(name, 'web', {})));
  put('2026-03-01T09:00:00.000Z', 'march'); put('2026-10-02T17:45:12.000Z', 'october'); put('2026-07-15T23:59:59.999Z', 'july');
  writeFileSync(path.join(dir, 'history', 'notes.txt'), 'x');
  assert.equal(latestSnapshot(dir).project.name, 'october');
});
