import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { writeZip } from './helpers/zip-writer.mjs';
import { assertNoContent } from './helpers/no-content.mjs';
import { importSketch } from '../src/sketch-import.mjs';

// Invented fixture: a small "Lumen Notes" app design.
const C = (red, green, blue, alpha = 1) => ({ _class: 'color', red, green, blue, alpha });
const frame = (x, y, width, height) => ({ _class: 'rect', x, y, width, height });
const font = (name, size, color) => ({ MSAttributedStringFontAttribute: { _class: 'fontDescriptor', attributes: { name, size } }, MSAttributedStringColorAttribute: color });
const text = (name, string, x, y, ps, size, color) => ({ _class: 'text', name, isVisible: true, frame: frame(x, y, 200, size * 1.3),
  attributedString: { _class: 'attributedString', string, attributes: [{ location: 0, length: string.length, attributes: font(ps, size, color) }] } });
const INK = C(0.1, 0.1, 0.2), ACCENT = C(1, 0.4, 0);

const master = { _class: 'symbolMaster', name: 'Button / Primary', symbolID: 'SYM-1', isVisible: true, frame: frame(1000, 0, 120, 40),
  layers: [{ _class: 'rectangle', name: 'bg', frame: frame(0, 0, 120, 40), fixedRadius: 6, style: { fills: [{ isEnabled: true, fillType: 0, color: ACCENT }] } },
    text('label', 'Save note', 12, 10, 'Inter-Medium', 14, C(1, 1, 1))] };
const home = { _class: 'artboard', name: 'Home', isVisible: true, frame: frame(0, 0, 375, 812), hasBackgroundColor: true, backgroundColor: C(0.96, 0.96, 0.96),
  layers: [
    { _class: 'group', name: 'Header', isVisible: true, frame: frame(16, 40, 343, 120), layers: [
      text('title', 'Today & <tomorrow>\nsecond line', 0, 0, 'Inter-SemiBold', 28, INK),
      { _class: 'rectangle', name: 'card', isVisible: true, frame: frame(0, 50, 343, 60), fixedRadius: 12,
        style: { fills: [{ isEnabled: true, fillType: 0, color: C(1, 1, 1) }], borders: [{ isEnabled: true, color: INK, thickness: 1 }],
          shadows: [{ isEnabled: true, offsetX: 0, offsetY: 2, blurRadius: 8, spread: 0, color: C(0, 0, 0, 0.25) }] } },
    ] },
    text('body', 'Three notes waiting', 16, 200, 'Inter-Regular', 16, INK),
    text('caption', 'Synced', 16, 230, 'Inter-Regular', 16, INK),
    { _class: 'symbolInstance', name: 'cta', isVisible: true, symbolID: 'SYM-1', frame: frame(16, 300, 120, 40) },
    { _class: 'bitmap', name: 'avatar', isVisible: true, frame: frame(300, 300, 48, 48) },
    { _class: 'rectangle', name: 'Ghost layer', isVisible: false, frame: frame(0, 0, 10, 10), style: { fills: [{ isEnabled: true, color: C(0, 1, 0) }] } },
    { ...text('hidden', 'Secret draft', 16, 400, 'Inter-Regular', 16, INK), isVisible: false },
  ] };
const detail = { _class: 'artboard', name: 'Note Detail', isVisible: true, frame: frame(500, 0, 375, 600), layers: [
  { _class: 'oval', name: 'dot', isVisible: true, frame: frame(20, 20, 10, 10), style: { fills: [{ isEnabled: true, fillType: 0, color: ACCENT }] } },
  text('heading', 'Groceries', 20, 40, 'Inter-Bold', 24, INK)] };

const document = { _class: 'document', pages: [{ _class: 'MSJSONFileReference', _ref_class: 'MSImmutablePage', _ref: 'pages/PAGE-1' }],
  sharedSwatches: { objects: [{ _class: 'swatch', name: 'Brand/Accent', value: ACCENT }] },
  assets: { colorAssets: [{ _class: 'MSImmutableColorAsset', name: 'Ink', color: INK }], colors: [] },
  layerTextStyles: { objects: [{ _class: 'sharedStyle', name: 'Body / Regular', value: { textStyle: { encodedAttributes: font('Inter-Regular', 16, INK) } } }] },
  foreignSymbols: [] };

function fixture() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'sketch-import-')), file = path.join(dir, 'Lumen Notes.sketch');
  writeZip(file, { 'document.json': document, 'meta.json': { appVersion: '99.1' },
    'pages/PAGE-1.json': { _class: 'page', name: 'Mobile', layers: [home, detail, master] } });
  return { dir, file, out: path.join(dir, 'out') };
}

test('imports artboards, symbol masters, tokens and elements from a .sketch file', async t => {
  const { dir, file, out } = fixture(); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const atlas = await importSketch({ source: file, outDir: out });
  assert.equal(atlas.project.kind, 'sketch');
  assert.equal(atlas.project.name, 'Lumen Notes');
  assert.equal(atlas.project.source, 'Lumen Notes.sketch');
  assert.deepEqual(atlas.project.viewport, { width: 375, height: 812 });
  assert.deepEqual(atlas.screens.map(s => [s.id, s.url, s.purpose]), [
    ['home', 'Mobile › Home', 'Artboard'], ['note-detail', 'Mobile › Note Detail', 'Artboard'], ['button-primary', 'Mobile › Button / Primary', 'Symbol master']]);
  assertNoContent(atlas, out, ['Today &', 'tomorrow', 'Save note', 'Secret draft', 'Groceries']);

  const tk = atlas.tokens, tok = (k, v) => tk[k].find(x => x.value === v);
  assert.equal(tok('colors', '#ff6600').label, 'Brand/Accent');
  assert.equal(tok('colors', '#1a1a33').label, 'Ink');
  assert.ok(tok('colors', '#00000040'), 'shadow colour');
  assert.ok(!tok('colors', '#00ff00'), 'hidden layer fill is skipped');
  assert.equal(tk.fonts[0].value, 'Inter');
  for (const s of ['28px', '16px', '14px', '24px']) assert.ok(tok('fontSizes', s), s);
  for (const w of ['400', '500', '600', '700']) assert.ok(tok('fontWeights', w), w);
  assert.ok(tok('radii', '12px') && tok('radii', '6px'));
  assert.deepEqual(tk.shadows.map(s => s.value), ['0px 2px 8px 0px #00000040']);
  assert.deepEqual(tk.cssVars, [{ name: '--brand-accent', value: '#ff6600' }, { name: '--text-body-regular', value: '16px Inter 400' }]);

  const home = atlas.screens[0], by = r => home.elements.filter(e => e.role === r);
  assert.deepEqual(home.inventory, { heading: 1, text: 2, shape: 1, component: 1, image: 1 });
  const h = by('heading')[0];
  assert.deepEqual(h.bbox, { x: 16, y: 40, w: 200, h: 36 });
  assert.deepEqual([h.fontSize, h.weight, h.font, h.color], ['28px', '600', 'Inter', '#1a1a33']);
  const card = by('shape')[0];
  assert.deepEqual([card.bbox, card.bg, card.radius, card.tag], [{ x: 16, y: 90, w: 343, h: 60 }, '#ffffff', '12px', 'rectangle']);
  assert.equal(by('component')[0].name, 'Button / Primary'); // the symbol's name is design structure, kept
  assert.equal(by('image')[0].tag, 'bitmap');
  assert.deepEqual(atlas.screens[1].inventory, { shape: 1, text: 1 }); // a lone text is its own median, so not a heading
});

test('writes well-formed schematic SVGs when screenshots are opted in', async t => {
  const { dir, file, out } = fixture(); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const atlas = await importSketch({ source: file, outDir: out, screenshots: true });
  for (const s of atlas.screens) {
    assert.match(s.screenshot, /^screens\/.+\.svg$/);
    const svg = readFileSync(path.join(out, s.screenshot), 'utf8');
    assert.ok(svg.startsWith('<svg'), s.id);
    assert.ok(svg.trimEnd().endsWith('</svg>'));
    const tags = svg.replace(/<[^>]*\/>/g, '').match(/<\/?[a-z]+[^>]*>/g); // open/close tags must balance
    const stack = []; for (const tg of tags) { const n = /^<\/?([a-z]+)/.exec(tg)[1]; if (tg[1] === '/') assert.equal(stack.pop(), n); else stack.push(n); }
    assert.equal(stack.length, 0);
  }
  const home = readFileSync(path.join(out, 'screens/home.svg'), 'utf8');
  assert.ok(home.includes('>Today &amp; &lt;tomorrow&gt;</text>'));
  assert.ok(home.includes('rx="12"') && home.includes('fill="#f5f5f5"'));
  assert.ok(home.includes('>Save note</text>'), 'symbol instance draws its master');
  assert.ok(!home.includes('Secret draft') && !home.includes('#00ff00'));
  assert.ok(readFileSync(path.join(out, 'screens/note-detail.svg'), 'utf8').includes('<ellipse'));
});

test('copies previews/preview.png as a first screen when screenshots are opted in', async t => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'sketch-import-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const png = Buffer.alloc(33); png.write('\x89PNG\r\n\x1a\n', 0, 'latin1'); png.writeUInt32BE(13, 8); png.write('IHDR', 12); png.writeUInt32BE(640, 16); png.writeUInt32BE(480, 20);
  const file = path.join(dir, 'Preview Only.sketch'), out = path.join(dir, 'out');
  writeZip(file, { 'document.json': document, 'pages/PAGE-1.json': { _class: 'page', name: 'Mobile', layers: [detail] }, 'previews/preview.png': png });
  const atlas = await importSketch({ source: file, outDir: out, screenshots: true });
  assert.deepEqual(atlas.screens.map(s => s.title), ['Document preview', 'Note Detail']);
  assert.deepEqual([atlas.screens[0].screenshot, atlas.screens[0].width, atlas.screens[0].height], ['screens/preview.png', 640, 480]);
  assert.ok(existsSync(path.join(out, 'screens/preview.png')));
  assert.deepEqual(atlas.project.viewport, { width: 375, height: 600 });
});

// Edge cases: gradients, inner and disabled shadows, disabled fills/borders, opacity, filled shape groups, stars,
// per-point corner radii, nested/missing/foreign/self-referencing symbols, text falling back to its text style,
// italic and camel-case font names, hidden boards, pages found without document refs, colour assets and colours.
const RED = C(1, 0, 0), BLUE = C(0, 0, 1);
const loop = { _class: 'symbolMaster', name: 'Loop', symbolID: 'LOOP', isVisible: true, frame: frame(0, 0, 10, 10),
  layers: [{ _class: 'symbolInstance', name: 'self', isVisible: true, symbolID: 'LOOP', frame: frame(1, 1, 8, 8) }] };
const edgeBoard = { _class: 'artboard', name: 'Edge', isVisible: true, frame: frame(0, 0, 400, 300), hasBackgroundColor: false, layers: [
  { _class: 'rectangle', name: 'grad', isVisible: true, frame: frame(0, 0, 100, 40), points: [{ cornerRadius: 3 }, { cornerRadius: 9 }],
    style: { contextSettings: { opacity: 0.5 }, fills: [{ isEnabled: true, fillType: 1, gradient: { stops: [{ color: RED }, { color: BLUE }] } }, { isEnabled: false, fillType: 0, color: C(0, 1, 0) }],
      borders: [{ isEnabled: false, color: C(0, 1, 0) }, { isEnabled: true, color: BLUE }], shadows: [{ isEnabled: false, color: C(0, 1, 0) }],
      innerShadows: [{ isEnabled: true, offsetX: 1, offsetY: 1, blurRadius: 2, spread: 0, color: C(0, 0, 0, 0.5) }] } },
  { _class: 'shapeGroup', name: 'filled group', isVisible: true, frame: frame(10, 50, 50, 50), style: { fills: [{ isEnabled: true, fillType: 0, color: RED }] },
    layers: [{ _class: 'oval', name: 'inner', isVisible: true, frame: frame(0, 0, 10, 10), style: { fills: [{ fillType: 0, color: BLUE }] } }] },
  { _class: 'shapeGroup', name: 'hollow group', isVisible: true, frame: frame(70, 50, 50, 50), style: { contextSettings: { opacity: 1 } },
    layers: [{ _class: 'star', name: 'star', isVisible: true, frame: frame(5, 5, 20, 20), style: { borders: [{ color: RED, thickness: 2 }] } }] },
  { _class: 'group', name: 'g', isVisible: true, frame: frame(200, 0, 100, 100), style: { contextSettings: { opacity: 0.25 } }, layers: [
    { _class: 'symbolInstance', name: 'missing', isVisible: true, symbolID: 'NOPE', frame: frame(0, 0, 30, 30) },
    { _class: 'symbolInstance', name: 'foreign', isVisible: true, symbolID: 'FOREIGN', frame: frame(0, 40, 30, 30), style: { fills: [{ fillType: 0, color: BLUE }] } },
    { _class: 'symbolInstance', name: 'loop', isVisible: true, symbolID: 'LOOP', frame: frame(0, 80, 10, 10) }] },
  { _class: 'text', name: 'styled', isVisible: true, frame: frame(10, 150, 100, 20), attributedString: { string: '' },
    style: { textStyle: { encodedAttributes: font('HelveticaNeue-LightItalic', 13, RED) } } },
  { _class: 'text', name: 'plain', isVisible: true, frame: frame(10, 180, 100, 20), attributedString: { string: 'Edge copy\u2028more' } },
  { _class: 'text', name: 'two runs', isVisible: true, frame: frame(10, 210, 100, 40), attributedString: { string: 'Ab', attributes: [
    { attributes: font('SFProDisplay-Heavy', 40, BLUE) }, { attributes: font('Inter-Italic', 12, RED) }] } },
  { _class: 'slice', name: 'ignored', isVisible: true, frame: frame(0, 0, 1, 1) }] };
export const edgeSketch = {
  'document.json': { ...document, pages: [], assets: { colorAssets: [{ name: 'Danger', color: RED }, { name: 'Alarm', color: RED }], colors: [BLUE, null] },
    sharedSwatches: { objects: [{ name: 'Blue / 500', value: BLUE }, { name: 'Nameless' }] },
    layerTextStyles: { objects: [{ name: 'Caption', value: { textStyle: { encodedAttributes: font('Inter-Bold', 11, RED) } } }, { name: 'Empty', value: {} }] },
    foreignSymbols: [{ symbolMaster: { _class: 'symbolMaster', name: 'Foreign Button', symbolID: 'FOREIGN', layers: [{ _class: 'bitmap', name: 'b', frame: frame(0, 0, 5, 5) }] } },
      { symbolMaster: { ...master, name: 'Shadowed duplicate' } }] },
  'pages/B.json': { _class: 'page', name: 'Second', layers: [edgeBoard, { ...detail, name: 'Hidden board', isVisible: false }, { _class: 'group', name: 'not a board', layers: [] }] },
  'pages/A.json': { _class: 'page', name: 'First', layers: [{ ...master, name: 'Button / Primary' }, loop, { ...detail, name: 'Edge' }] },
};

test('Sketch edge cases: gradients, disabled styles, groups, symbols that are missing, foreign or recursive, text-style fallback', async t => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'sketch-import-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'Edge.sketch'), out = path.join(dir, 'out');
  writeZip(file, edgeSketch);
  const atlas = await importSketch({ source: file, outDir: out, screenshots: true });
  const tk = atlas.tokens, tok = (k, v) => tk[k].find(x => x.value === v);
  // pages without document refs come in zip order; hidden boards and non-boards are skipped; repeated names are numbered
  assert.deepEqual(atlas.screens.map(s => [s.id, s.url, s.purpose]), [['edge', 'Second › Edge', 'Artboard'], ['button-primary', 'First › Button / Primary', 'Symbol master'],
    ['loop', 'First › Loop', 'Symbol master'], ['edge-2', 'First › Edge', 'Artboard']]);
  assert.equal(atlas.project.notes[0], 'Sketch unknown version: 2 page(s), 2 artboard(s), 2 symbol master(s).');
  const edge = atlas.screens[0], by = r => edge.elements.filter(e => e.role === r);
  assert.deepEqual(edge.inventory, { shape: 2, component: 3, text: 2, heading: 1 });
  assert.deepEqual(by('shape').map(e => [e.tag, e.bg, e.color, e.radius]), [['rectangle', '#ff0000', '#0000ff', '9px'], ['shapeGroup', '#ff0000', null, null]],
    'gradient start colour, first enabled border, largest point radius; a filled shape group is one shape');
  assert.deepEqual(by('component').map(e => [e.name, e.bg]), [[null, null], ['Foreign Button', '#0000ff'], ['Loop', null]]);
  assert.deepEqual(by('heading').map(e => [e.font, e.weight, e.fontSize, e.color]), [['SFPro Display', '800', '40px', '#0000ff']], 'first run decides');
  assert.deepEqual(by('text').map(e => [e.font, e.weight, e.fontSize, e.color]), [['Helvetica Neue', '300', '13px', '#ff0000'], [null, null, null, null]], 'text style fallback; no style at all');
  // tokens: colour-asset and swatch names as labels, disabled styles skipped, every run counted
  assert.deepEqual([tok('colors', '#ff0000').label, tok('colors', '#ff0000').usage], ['Danger, Alarm', { text: 3, background: 2, border: 1 }]);
  assert.deepEqual([tok('colors', '#0000ff').label, tok('colors', '#0000ff').usage], ['Blue / 500', { background: 2, border: 1, text: 1 }]);
  assert.ok(!tok('colors', '#00ff00'), 'disabled fills, borders and shadows are skipped');
  assert.deepEqual(tk.fonts.map(f => f.value), ['Inter', 'Helvetica Neue', 'SFPro Display']);
  assert.deepEqual(tk.fontWeights.map(f => f.value), ['700', '300', '800', '400', '500']);
  assert.deepEqual(tk.shadows.map(s => s.value), ['inset 1px 1px 2px 0px #00000080']);
  assert.deepEqual(tk.cssVars, [{ name: '--blue-500', value: '#0000ff' }, { name: '--text-caption', value: '11px Inter 700' }]);
  // the schematic
  const svg = readFileSync(path.join(out, 'screens/edge.svg'), 'utf8');
  assert.ok(svg.includes('<rect x="0" y="0" width="100" height="40" rx="9" fill="#ff0000" stroke="#0000ff" stroke-width="1" opacity="0.5"/>'));
  assert.ok(svg.includes('<rect x="10" y="50" width="50" height="50" fill="#ff0000"/><g><rect x="75"'), 'a filled group draws as one shape; a hollow one draws its layers');
  assert.ok(svg.includes('<g opacity="0.3"><rect x="200" y="0" width="30" height="30" fill="none" stroke="#999999" stroke-dasharray="4 3"/>'), 'group opacity; a missing symbol is a dashed box');
  assert.ok(svg.includes('<g><rect x="200" y="40" width="5" height="5" fill="#cccccc" stroke="#999999"/></g>'), 'a foreign symbol draws its master');
  assert.ok(svg.includes(`${'<g>'.repeat(8)}<rect x="208" y="88"`) && !svg.includes(`${'<g>'.repeat(9)}<rect x="208"`), 'a self-referencing symbol stops at depth 8');
  assert.ok(svg.includes('font-family="sans-serif" font-size="12" fill="#000000">Edge copy</text>') && !svg.includes('more'), 'first line only, defaults');
  assert.ok(!svg.includes('y="162"'), 'an empty text draws nothing');
});
