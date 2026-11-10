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

// Synthetic token JSON written to a temp file, for branches the fixtures don't reach.
const runData = async (data, name = 'synthetic.json') => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-tokens-src-'));
  try {
    fs.writeFileSync(path.join(dir, name), JSON.stringify(data));
    const outDir = path.join(dir, 'out'), atlas = await importTokens({ source: path.join(dir, name), outDir });
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(outDir, 'atlas.json'), 'utf8')), atlas);
    return atlas;
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
};

test('Style Dictionary inference: value shapes, path words in order, attribute hints', async () => {
  const a = await runData({
    misc: { typo: { value: { fontFamily: 'Q', fontSize: 11 } }, colObj: { value: { hex: '#010203' } }, sh: { value: { color: '#000', x: 1 } },
      shArr: { value: [{ color: '#111' }, { color: '#222', x: 2 }] }, empty: { value: [] }, rgba: { value: 'rgba(1,2,3,0.4)' }, auto: { value: 'auto' } },
    color: { num: { value: '123' }, gap: { value: 4 } },
    elevation: { e: { value: '0 0 1px red' } }, corner: { r: { value: 5 } }, text_size: { t: { value: 12 } }, typeface: { t: { value: 'Mono' } },
    weight: { w: { value: 'bold' } }, gutter: { g: { value: 3 } },
    hinted: { y: { value: 16, attributes: { category: 'size', type: 'font' } } },
  }), t = a.tokens, v = vars(a);
  assert.equal(a.project.format, 'style-dictionary');
  assert.deepEqual(vals(t.colors), ['#010203', '#01020366']);
  assert.deepEqual(vals(t.fonts), ['Q', 'Mono']);
  assert.deepEqual(vals(t.fontSizes), ['11px', '12px', '16px']);
  assert.deepEqual(vals(t.fontWeights), ['700']);
  assert.deepEqual(vals(t.spacing), ['4px', '3px'], 'a spacing word under color/ still wins over the colour path');
  assert.deepEqual(vals(t.radii), ['5px']);
  assert.deepEqual(vals(t.shadows), ['1px 0px 0px 0px #000000', '0px 0px 0px 0px #111111, 2px 0px 0px 0px #222222', '0 0 1px red']);
  assert.equal(v['--color-num'], '123', 'a bare number under color/ is not a colour');
  assert.equal(v['--misc-empty'], '');
  assert.equal(v['--misc-auto'], 'auto');
});

test('DTCG: dimension refined by path, fallback CSS for untallied types, colour objects', async () => {
  const a = await runData({
    font: { size: { d: { $type: 'dimension', $value: '17px' } } },
    c: { $type: 'color', hexA: { $value: { hex: '#112233', alpha: 0.25 } }, plain: { $value: { components: [1, 1, 1], alpha: 0.5 } },
      p3: { $value: { colorSpace: 'display-p3', components: [0.1, 0.2], alpha: 0.4 } } },
    o: { cb: { $type: 'cubicBezier', $value: [0.1, 0.2, 0.3, 1] }, dur: { $type: 'duration', $value: { value: 100, unit: 'ms' } },
      border: { $type: 'border', $value: { width: 2, style: 'dashed' } }, obj: { $type: 'weird', $value: { a: 1 } },
      fw: { $type: 'fontWeight', $value: 'mystery' }, ctor: { $type: 'constructor', $value: '#abcdef' } },
  }), t = a.tokens, v = vars(a);
  assert.deepEqual(vals(t.fontSizes), ['17px']);
  assert.deepEqual(vals(t.colors), ['#11223340', '#ffffff80']);
  assert.equal(v['--c-p3'], 'color(display-p3 0.1 0.2 / 0.4)');
  assert.equal(v['--o-cb'], 'cubic-bezier(0.1, 0.2, 0.3, 1)');
  assert.equal(v['--o-dur'], '100ms');
  assert.equal(v['--o-border'], '2px dashed');
  assert.equal(v['--o-obj'], '{"a":1}');
  assert.equal(v['--o-fw'], 'mystery', 'unknown weight name kept as written');
  assert.deepEqual(vals(t.fontWeights), []);
  assert.equal(v['--o-ctor'], '#abcdef', 'a type named like an Object member is untyped, not a crash');
});

test('notes: singular alias, list capped at 8, empty file has no format', async () => {
  const one = await runData({ a: { $value: '{nope}' }, b: { $type: 'color', $value: '#fff' } });
  assert.deepEqual(one.project.notes, ['2 tokens from 1 file', '1 unresolved alias (kept raw in cssVars): a']);
  const many = await runData(Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`u${i}`, { $value: `{m.${i}}` }])));
  assert.equal(many.project.notes[1], '9 unresolved aliases (kept raw in cssVars): u0, u1, u2, u3, u4, u5, u6, u7, …');
  const empty = await runData({}, 'Empty.JSON');
  assert.equal(empty.project.format, null);
  assert.equal(empty.project.name, 'Empty');
});

test('aliases: embedded references, nested values, cycles and misses', async () => {
  const a = await runData({
    sp: { $type: 'dimension', a: { $value: '4px' } },
    e: { calc: { $type: 'dimension', $value: 'calc({sp.a} * 2)' }, miss: { $type: 'dimension', $value: 'calc({sp.zz} * 2)' },
      sh: { $type: 'shadow', $value: [{ color: '#000', offsetX: '{sp.a}', offsetY: 0 }] }, self: { $value: '{e.self}' }, toSelf: { $value: '{ e.self }' } },
  }), v = vars(a);
  assert.equal(v['--e-calc'], 'calc(4px * 2)');
  assert.equal(v['--e-miss'], 'calc({sp.zz} * 2)');
  assert.deepEqual(vals(a.tokens.shadows), ['4px 0px 0px 0px #000000']);
  assert.match(a.project.notes[1], /^3 unresolved aliases.*e\.miss, e\.self, e\.toSelf$/);
});

test('folder of mixed formats is merged at the root', async () => {
  const a = await run('mixed'), t = a.tokens;
  assert.equal(a.project.format, 'mixed');
  assert.equal(tok(t.colors, '#d0d4d8').count, 2);
  assert.deepEqual(vals(t.spacing), ['6px']);
  assert.ok(!a.project.source.includes(path.sep));
});
