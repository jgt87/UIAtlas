// buildTokens edge cases: group order, unrepresentable values, palette names from declared variables, source
// variable typing, weights without a name, given component variants. (The main structure is covered in export.test.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTokens } from '../src/tokens-json.mjs';

const atlas = {
  tokens: {
    colors: [{ value: '#ff0000', count: 9, usage: { text: 5, fill: 1, glow: 3 } }, { value: '#00ff00', count: 4, label: 'brand, primary · x', share: 0.2 },
      { value: '#0000ff', count: 3, usage: { background: 300, border: 1 } }, { value: '#00ff0080', count: 2 }, { value: 'red', count: 1 }, { value: '#abcdef', count: 1, usage: { background: 2 } }],
    fonts: [{ value: 'Inter', count: 4 }, { value: 'Fira Code', count: 2 }],
    fontSizes: [{ value: '12pt', count: 3 }, { value: '50%', count: 1 }, { value: '16px', count: 2 }, { value: '1em', count: 1 }],
    fontWeights: [{ value: '700', count: 2 }, { value: '350', count: 1 }, { value: 'bold', count: 1 }],
    lineHeights: [{ value: 'normal', count: 3 }, { value: '1.5', count: 2 }],
    spacing: [{ value: '8px', count: 1 }, { value: '4px 8px', count: 1 }], radii: [{ value: '50%', count: 1 }, { value: '4px', count: 3 }, { value: '8px 8px 0px 0px', count: 1 }],
    shadows: [{ value: 'inset 0 1px 2px rgba(0,0,0,.5), 0 0 0 1px #fff', count: 1 }],
    cssVars: [{ name: '--ink', value: '#ff0000' }, { name: '--text-strong', value: '#FF0000' }, { name: '--zz', value: '#ff0000' }, { name: '--bg', value: '#0000ff' }, { name: '--surface-1', value: '#0000ff' },
      { name: '--short', value: 'rgba(0, 0, 255, 1)' }, { name: '--quoted', value: '"Hello"' }, { name: '--font-weight-bold', value: '700' }, { name: '--ratio', value: '1.25' },
      { name: '--gap', value: '1.5in' }, { name: '--ink', value: 'calc(1px + 2px)' }, { name: '--w', value: '2000' }],
  },
  screens: [{ elements: [{ role: 'text', fontSize: '16px', lineHeight: 'normal' }, { role: 'text', font: 'Nope', fontSize: '1em' }, { role: 'image', fontSize: '10px' }] }],
};

test('buildTokens: group order, unrepresentable values, and palette names from the best-fitting declared variable', () => {
  const tk = buildTokens(atlas, { exported: 'X' });
  assert.deepEqual(Object.keys(tk), ['$description', 'color', 'font', 'spacing', 'radius', 'shadow', 'color-usage', 'typography', 'source', '$extensions']);
  assert.deepEqual(tk.$extensions['ui-atlas'].unrepresentable, ['red', '50%', '1em', 'line-height normal', '4px 8px', '50%', '8px 8px 0px 0px']);
  // text use -> a text-ish name beats a merely short one; background use -> a surface name; label first part wins; else the hex
  assert.deepEqual(Object.keys(tk.color), ['$type', 'text-strong', 'brand', 'surface-1', '00ff00', 'abcdef']);
  assert.deepEqual(Object.keys(tk['color-usage']), ['text', 'fill', 'background', 'border'], 'unknown uses (glow) are not a layer');
  assert.equal(tk['color-usage'].background.primary.$value, '{color.surface-1}');
  assert.equal(tk['color-usage'].background.secondary, undefined, 'under 2% of a use is dropped');
  assert.equal(tk.shadow['1'].$value[0].inset, true);
  assert.deepEqual(Object.keys(tk.font.weight), ['350', '$type', 'bold', 'bold-2'], 'a non-numeric weight keeps its text, under a numbered name');
  assert.deepEqual(Object.keys(tk.typography), ['$type', 'text'], 'images carry no type; an em-only role is skipped');
  assert.deepEqual(tk.typography.text.$value, { fontFamily: '{font.family.inter}', fontSize: '{font.size.16px}', fontWeight: 400 });
});

test('buildTokens: source variables are typed, aliased into the palette, or kept untyped', () => {
  const src = buildTokens(atlas, { exported: 'X' }).source;
  assert.deepEqual([src.ink.$value, src.short.$value], ['{color.text-strong}', '{color.surface-1}']);
  assert.deepEqual([src['font-weight-bold'], src.ratio, src.w], [{ $type: 'fontWeight', $value: 700 }, { $type: 'number', $value: 1.25 }, { $type: 'number', $value: 2000 }]);
  assert.deepEqual(src.gap, { $type: 'dimension', $value: { value: 144, unit: 'px' } });
  assert.ok(!('quoted' in src), 'quoted strings are copy, not tokens');
  assert.deepEqual(src.$extensions['ui-atlas'].untyped, { '--ink': 'calc(1px + 2px)' });
});

test('buildTokens: given component variants are used as they are; a variant with no style is left out', () => {
  const components = { card: [{ name: 'filled', count: 2, share: 0.5, screens: 1, style: { bg: '#123456', radius: '4px', padding: '0px 2px', weight: 'x' } }, { name: 'empty', style: {} }] };
  const c = buildTokens({ ...atlas, components }, { exported: 'X' }).component;
  assert.deepEqual(Object.keys(c.card), ['filled']);
  assert.deepEqual(c.card.filled.radius.$value, '{radius.4px}');
  assert.deepEqual([c.card.filled['font-weight'].$value, c.card.filled['padding-block'], c.card.filled['padding-inline'].$value], [400, undefined, { value: 2, unit: 'px' }]);
  assert.deepEqual(Object.keys(buildTokens({ tokens: {}, screens: [] }, { exported: 'X' })), ['$description', '$extensions']);
});
