// buildTokens edge cases: group order, unrepresentable values, palette names from declared variables, source
// variable typing, weights without a name, given component variants. (The main structure is covered in export.test.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTokens, shadowValue, toCssVars } from '../src/tokens-json.mjs';

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

test('buildTokens: component properties alias, fall back to literals, or are left out', () => {
  const tokens = { colors: [{ value: '#123456', count: 1 }], fontSizes: [{ value: '14px', count: 1 }], fontWeights: [{ value: '600', count: 1 }] };
  const style = { color: '#123456', border: '#abcdef', bg: 'red', radius: '50%', fontSize: '14px', weight: '600', padding: '8px' };
  const s = buildTokens({ tokens, screens: [], components: { chip: [{ name: 'a', style }, { name: 'b', style: { fontSize: '13px', border: '#123456' } }, { name: 'c', style: { fontSize: '1em' } }] } }, { exported: 'X' }).component.chip;
  assert.deepEqual(Object.keys(s.a), ['background', 'text', 'border', 'font-size', 'font-weight', 'padding-block', '$extensions'], 'no radius without a dimension form, no inline padding from one value');
  assert.deepEqual([s.a.text.$value, s.a.border.$value.hex, s.a['font-size'].$value, s.a['font-weight'].$value, s.a['padding-block'].$value], ['{color.123456}', '#abcdef', '{font.size.14px}', '{font.weight.semi-bold}', { value: 8, unit: 'px' }]);
  assert.equal(s.a.background.$value, null, 'a colour with no hex form keeps its property, with no value');
  assert.deepEqual([s.b['font-size'].$value, s.b.border.$value], [{ value: 13, unit: 'px' }, '{color.123456}']);
  assert.ok(!s.c, 'an em size alone is no style');
});

test('buildTokens: source numbers are a weight only by name and in range; a unit-less dimension is a number', () => {
  const cssVars = [{ name: '--weight-x', value: '0' }, { name: '--weight-y', value: '1000' }, { name: '--size', value: '12' }, { name: '--em', value: '10em' }, { name: '--c', value: 'rgb(18, 52, 86)' }];
  const src = buildTokens({ tokens: { colors: [{ value: '#123456', count: 1 }], cssVars }, screens: [] }, { exported: 'X' }).source;
  assert.deepEqual([src['weight-x'].$type, src['weight-y'].$type, src.size.$type, src.c.$value], ['number', 'fontWeight', 'number', '{color.123456}']);
  assert.deepEqual(src.$extensions['ui-atlas'].untyped, { '--em': '10em' });
});

test('buildTokens: type styles alias line height and letter spacing where they are primitives, else carry the value', () => {
  const tokens = { fonts: [{ value: 'Inter', count: 1 }], fontSizes: [{ value: '16px', count: 1 }], lineHeights: [{ value: '1.5', count: 1 }], letterSpacings: [{ value: '1px', count: 1 }] };
  const el = (role, x) => ({ role, fontSize: '16px', ...x });
  const tk = buildTokens({ tokens, screens: [{ elements: [el('a', { lineHeight: '1.5', letterSpacing: '1px' }), el('b', { lineHeight: '1.2', letterSpacing: '2px', weight: 'bold' }), el('c', { letterSpacing: '0.1em' })] }] }, { exported: 'X' });
  assert.deepEqual(Object.keys(tk.font), ['family', 'size', 'lineHeight', 'letterSpacing']);
  assert.deepEqual(tk.typography.a.$value, { fontFamily: '{font.family.inter}', fontSize: '{font.size.16px}', fontWeight: 400, lineHeight: '{font.lineHeight.1-5}', letterSpacing: '{font.letterSpacing.1px}' });
  assert.deepEqual([tk.typography.b.$value.lineHeight, tk.typography.b.$value.letterSpacing], [1.2, { value: 2, unit: 'px' }]);
  assert.ok(!('letterSpacing' in tk.typography.c.$value), 'an em letter spacing has no token form');
  const css = toCssVars(tk);
  assert.ok(css.includes('--typography-a-line-height: var(--font-lineHeight-1-5);\n  --typography-a-letter-spacing: var(--font-letterSpacing-1px);'));
  assert.ok(!css.includes('--typography-c-letter-spacing'), 'parts a style lacks get no variable');
  assert.ok(!buildTokens({ tokens: { lineHeights: [{ value: 'normal', count: 1 }] }, screens: [] }, { exported: 'X' }).font, 'a font group with nothing representable is left out');
});

test('shadowValue: one layer is an object, a layer naming no colour is black, lengths default to zero', () => {
  assert.deepEqual(shadowValue('2px 3px'), { color: { colorSpace: 'srgb', components: [0, 0, 0], hex: '#000000' }, offsetX: { value: 2, unit: 'px' }, offsetY: { value: 3, unit: 'px' }, blur: { value: 0, unit: 'px' }, spread: { value: 0, unit: 'px' } });
  assert.equal(shadowValue('1px 1px #abc, 0 0 2px #fff').length, 2);
});
