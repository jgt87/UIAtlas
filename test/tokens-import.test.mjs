import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { importTokens } from '../src/tokens-import.mjs';

const fx = name => path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'tokens', name);
const run = async name => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-tokens-'));
  try {
    const atlas = await importTokens({ source: fx(name), outDir });
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(outDir, 'atlas.json'), 'utf8')), atlas);
    return atlas;
  } finally { fs.rmSync(outDir, { recursive: true, force: true }); }
};
const vals = list => list.map(t => t.value);
const tok = (list, value) => list.find(t => t.value === value);
const vars = atlas => Object.fromEntries(atlas.tokens.cssVars.map(v => [v.name, v.value]));

test('DTCG: inherited types, colour objects, aliases, shadows, typography, cycles', async () => {
  const a = await run('dtcg.tokens.json'), t = a.tokens, v = vars(a);
  assert.equal(a.project.kind, 'tokens');
  assert.equal(a.project.format, 'dtcg');
  assert.equal(a.project.source, 'dtcg.tokens.json');
  assert.deepEqual(a.screens, []);
  assert.equal(tok(t.colors, '#2b5f8c').count, 2);
  assert.equal(tok(t.colors, '#2b5f8c').label, 'color.brand, color.link');
  assert.ok(tok(t.colors, '#ff8000'), 'srgb components converted');
  assert.ok(tok(t.colors, '#00000080'), 'alpha kept');
  assert.ok(tok(t.colors, '#123456'), 'hex preferred over components');
  assert.equal(v['--color-vivid'], 'color(oklch 0.7 0.1 200)');
  assert.deepEqual(vals(t.spacing), ['4px', '8px']);
  assert.deepEqual(vals(t.radii), ['6px']);
  assert.equal(v['--size-icon'], '24px');
  assert.ok(!vals(t.spacing).includes('24px'), 'plain dimension stays out of spacing');
  assert.deepEqual(vals(t.shadows), ['0px 2px 4px 0px #00000080, inset 0px 1px 0px 0px #00000033']);
  assert.equal(tok(t.fonts, 'Fictive Sans').count, 2);
  assert.equal(tok(t.fontWeights, '700').count, 2);
  assert.deepEqual(vals(t.fontSizes), ['15px']);
  assert.equal(v['--typography-body'], '700 15px/1.5 "Fictive Sans", Helvetica, sans-serif');
  assert.equal(v['--loop-a'], '{loop.b}');
  assert.match(a.project.notes.join(' '), /2 unresolved aliases.*loop\.a/);
});

test('Tokens Studio: sets, cross-set aliases, box shadows, typography, unresolved alias', async () => {
  const a = await run('studio.json'), t = a.tokens, v = vars(a);
  assert.equal(a.project.format, 'tokens-studio');
  assert.equal(tok(t.colors, '#1a9e8f').label, 'core.colors.teal, theme.button.bg');
  assert.ok(tok(t.colors, '#f0dcb4'));
  assert.deepEqual(vals(t.spacing), ['24px', '12px']);
  assert.equal(v['--core-sizing-avatar'], '40px');
  assert.deepEqual(vals(t.radii), ['999px']);
  assert.deepEqual(vals(t.shadows), ['inset 0px 4px 8px 0px #f0dcb4']);
  assert.equal(tok(t.fonts, 'Imaginary Serif').count, 2);
  assert.equal(tok(t.fontWeights, '600').count, 2);
  assert.equal(tok(t.fontSizes, '14px').count, 2);
  assert.equal(v['--theme-button-broken'], '{colors.missing}');
  assert.equal(t.colors.length, 2, 'unresolved alias skipped from typed tokens');
  assert.ok(!t.cssVars.some(c => c.name.includes('themes') || c.name.includes('metadata')));
});

test('Style Dictionary: types inferred from path, {x.value} aliases', async () => {
  const a = await run('style-dictionary.json'), t = a.tokens, v = vars(a);
  assert.equal(a.project.format, 'style-dictionary');
  assert.equal(tok(t.colors, '#6b2d5c').label, 'color.base.plum, color.font.primary');
  assert.deepEqual(vals(t.fontSizes), ['0.75rem', '20px']);
  assert.deepEqual(vals(t.fonts), ['Pretend Grotesk']);
  assert.deepEqual(vals(t.fontWeights), ['900']);
  assert.deepEqual(vals(t.spacing), ['8px']);
  assert.deepEqual(vals(t.radii), ['2px']);
  assert.deepEqual(vals(t.shadows), ['0 1px 2px #0003']);
  assert.equal(v['--size-border-thin'], '1px');
});

test('Tokens Studio multi-file folder: files are sets, aliases cross files', async () => {
  const a = await run('studio-multi'), t = a.tokens;
  assert.equal(a.project.name, 'studio-multi');
  assert.equal(a.project.format, 'tokens-studio');
  assert.equal(tok(t.colors, '#101820').label, 'global.palette.ink, theme/dark.surface.text');
  assert.equal(vars(a)['--theme-dark-surface-text'], '#101820');
});

test('folder of mixed formats is merged at the root', async () => {
  const a = await run('mixed'), t = a.tokens;
  assert.equal(a.project.format, 'mixed');
  assert.equal(tok(t.colors, '#d0d4d8').count, 2);
  assert.deepEqual(vals(t.spacing), ['6px']);
  assert.ok(!a.project.source.includes(path.sep));
});
