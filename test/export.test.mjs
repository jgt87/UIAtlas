// Token export: structured W3C JSON (primitives, typography/component aliases, typed source variables), CSS, and a real PDF.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { toDtcg, toCss, exportAtlas, sheetHtml } from '../src/export.mjs';
import { walkTokens } from '../src/tokens-json.mjs';

const atlas = { project: { name: 'Fictive Brand', kind: 'pptx', source: 'fictive.potx', created: '2026-01-01T00:00:00.000Z' },
  tokens: { colors: [{ value: '#10069f', count: 9, label: 'accent1 · primary' }, { value: '#ffffff', count: 4 }, { value: '#ff8800', count: 1, share: 0.02 }],
    fonts: [{ value: 'Fictive Sans', count: 5 }], fontSizes: [{ value: '12pt', count: 3 }, { value: '24pt', count: 1 }], fontWeights: [{ value: '700', count: 1 }],
    spacing: [{ value: '16px', count: 2 }, { value: '8px', count: 5 }], radii: [], shadows: [{ value: '0px 2px 4px #00000033', count: 1 }],
    cssVars: [{ name: '--accent1', value: '#10069f' }, { name: '--bad name', value: 'x' }] }, screens: [] };

test('structured JSON: primitives in the 2025.10 format, names from labels or values, counts in extensions', () => {
  const j = toDtcg(atlas);
  assert.equal(j.color.$type, 'color');
  assert.deepEqual(j.color.accent1.$value, { colorSpace: 'srgb', components: [0.0627, 0.0235, 0.6235], hex: '#10069f' });
  assert.equal(j.color.accent1.$description, 'accent1 · primary');
  assert.equal(j.color.ffffff.$value.hex, '#ffffff');
  assert.equal(j.color.ff8800.$extensions['ui-atlas'].share, 0.02);
  assert.deepEqual(j.font.family['fictive-sans'].$value, 'Fictive Sans');
  assert.deepEqual(j.font.size['12pt'].$value, { value: 16, unit: 'px' }); // pt is not a format unit: converted, original kept
  assert.equal(j.font.size['12pt'].$extensions['ui-atlas'].source, '12pt');
  assert.equal(j.font.weight.bold.$value, 700);
  assert.deepEqual(Object.keys(j.spacing).filter(k => k[0] !== '$'), ['8px', '16px']);
  assert.deepEqual(j.shadow['1'].$value, { color: { colorSpace: 'srgb', components: [0, 0, 0], alpha: 0.2, hex: '#000000' },
    offsetX: { value: 0, unit: 'px' }, offsetY: { value: 2, unit: 'px' }, blur: { value: 4, unit: 'px' }, spread: { value: 0, unit: 'px' } });
  assert.ok(!j.radius, 'empty groups are left out');
});

test('structured JSON: typography and component layers alias the primitives; every alias resolves', () => {
  const el = (role, extra) => ({ role, tag: 'x', bbox: { x: 0, y: 0, w: 1, h: 1 }, color: null, bg: null, fontSize: null, weight: null, radius: null, ...extra });
  const a = { ...atlas, tokens: { ...atlas.tokens, radii: [{ value: '8px', count: 2 }, { value: '50%', count: 1 }] }, screens: [{ id: 's', elements: [
    el('heading', { fontSize: '24pt', weight: '700', font: 'Fictive Sans', color: '#10069f' }), el('heading', { fontSize: '24pt', weight: '700', font: 'Fictive Sans' }),
    el('button', { bg: '#10069f', color: '#ffffff', radius: '8px', fontSize: '12pt', weight: '700', font: 'Fictive Sans' }), el('image', { fontSize: '12pt' })] }] };
  const j = toDtcg(a);
  assert.deepEqual(j.typography.heading.$value, { fontFamily: '{font.family.fictive-sans}', fontSize: '{font.size.24pt}', fontWeight: '{font.weight.bold}' });
  assert.ok(!j.typography.image, 'images carry no typography');
  assert.deepEqual([j.component.button.background.$value, j.component.button.text.$value, j.component.button.radius.$value], ['{color.accent1}', '{color.ffffff}', '{radius.8px}']);
  assert.deepEqual(j.$extensions['ui-atlas'].unrepresentable, ['50%']);
  const paths = new Set([...walkTokens(j)].map(t => t.path.join('.')));
  const aliases = JSON.stringify(j).match(/"\{[^}]+\}"/g).map(s => s.slice(2, -2));
  for (const p of aliases) assert.ok(paths.has(p), `alias {${p}} resolves`);
  const TYPES = new Set(['color', 'dimension', 'fontFamily', 'fontWeight', 'duration', 'cubicBezier', 'number', 'strokeStyle', 'border', 'transition', 'shadow', 'gradient', 'typography']);
  for (const t of walkTokens(j)) assert.ok(TYPES.has(t.type), `${t.path.join('.')} has a valid $type (${t.type})`);
});

test('structured JSON: source variables are typed — colours alias the palette, unitless numbers stay numbers', () => {
  const a = { ...atlas, tokens: { ...atlas.tokens, cssVars: [{ name: '--brand', value: '#10069F' }, { name: '--focus', value: '#fff' }, { name: '--gap', value: '1.5rem' },
    { name: '--heading-weight', value: '600' }, { name: '--line-height', value: '1.4' }, { name: '--scheme', value: 'light' }] } };
  const s = toDtcg(a).source;
  assert.deepEqual(s.brand, { $type: 'color', $value: '{color.accent1}' });
  assert.equal(s.focus.$value, '{color.ffffff}');
  assert.deepEqual(s.gap, { $type: 'dimension', $value: { value: 1.5, unit: 'rem' } });
  assert.deepEqual(s['heading-weight'], { $type: 'fontWeight', $value: 600 });
  assert.deepEqual(s['line-height'], { $type: 'number', $value: 1.4 });
  assert.deepEqual(s.$extensions['ui-atlas'].untyped, { '--scheme': 'light' });
});

test('CSS: generated from the same structure; aliases become var() references', () => {
  const css = toCss({ ...atlas, tokens: { ...atlas.tokens, cssVars: [{ name: '--accent1', value: '#10069f' }] } });
  assert.match(css, /--color-accent1: #10069f;/);
  assert.match(css, /--font-family-fictive-sans: "Fictive Sans";/);
  assert.match(css, /--font-size-12pt: 16px;/);
  assert.match(css, /--source-accent1: var\(--color-accent1\);/);
  assert.match(css, /--shadow-1: 0px 2px 4px 0px #00000033;/);
});

test('exportAtlas writes all three files, and the PDF is a PDF', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'atlas-test-')), atlasDir = path.join(dir, 'fictive');
  mkdirSync(atlasDir); writeFileSync(path.join(atlasDir, 'atlas.json'), JSON.stringify(atlas));
  const files = await exportAtlas({ atlasDir });
  assert.equal(files.length, 3);
  for (const f of files) assert.ok(existsSync(f) && f.startsWith(path.join(atlasDir, 'exports')), f);
  assert.equal(readFileSync(files.find(f => f.endsWith('.pdf'))).subarray(0, 5).toString(), '%PDF-');
});

test('exports hold design tokens only: no source name, file name or quoted copy', () => {
  const withCopy = { ...atlas, tokens: { ...atlas.tokens, cssVars: [...atlas.tokens.cssVars, { name: '--promo', value: '"Spring sale"' }] } };
  for (const out of [sheetHtml(withCopy), JSON.stringify(toDtcg(withCopy)), toCss(withCopy)])
    for (const s of ['Fictive Brand', 'fictive.potx', 'Spring sale', 'PowerPoint']) assert.ok(!out.includes(s), s);
});
