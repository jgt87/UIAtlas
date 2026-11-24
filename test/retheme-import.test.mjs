// Retheme template packages (folder or zip): theme colours with slot labels and usage, placeholder/static-text
// formatting as tokens, assets as elements, inches -> preview pixels, contrast — and no source text.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, cpSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeZip } from './helpers/zip-writer.mjs';
import { assertNoContent } from './helpers/no-content.mjs';
import { importRetheme } from '../src/retheme-import.mjs';
import { detectKind } from '../src/detect.mjs';

// One committed package (invented values; see its README.md): template.json, previews/layout-<slug>.png as the
// template tool names them, and an other/ folder the importer must ignore. Its previews are 1920px PNG headers
// (all the importer reads): 1920px over a 13.333in slide = 144 preview pixels per inch.
const FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'retheme', 'fictive-corporate');
const fixtureFile = rel => readFileSync(path.join(FIXTURE, rel));
// a copy of the fixture, with or without its previews
function writeFolder(dir, withPreviews) {
  cpSync(FIXTURE, dir, { recursive: true });
  if (!withPreviews) rmSync(path.join(dir, 'previews'), { recursive: true, force: true });
}
// the fixture's package files (README and other/ left out, as a template tool would) for a zip, under one top folder
const zipEntries = top => Object.fromEntries(['template.json', ...readdirSync(path.join(FIXTURE, 'previews')).map(f => `previews/${f}`)].map(rel => [`${top}/${rel}`, fixtureFile(rel)]));

test('Retheme folder: tokens with slot labels and usage, elements from placeholders/texts/assets, contrast — and no text', async t => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'atlas-retheme-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const src = path.join(dir, 'pkg'), out = path.join(dir, 'out');
  writeFolder(src, false);
  assert.equal(detectKind(src), 'retheme');
  const atlas = importRetheme({ source: src, outDir: out });
  const tok = (k, v) => atlas.tokens[k].find(x => x.value === v);

  assert.deepEqual([atlas.project.name, atlas.project.kind, atlas.project.source, atlas.project.previews], ['Fictive Corporate', 'pptx', 'Fictive Corporate.potx', 'rendered']);
  assert.deepEqual(atlas.project.units, { ppi: 96, slideInches: { width: 13.333, height: 7.5 } }, 'no previews: 96 px per inch');
  assert.deepEqual(atlas.project.viewport, { width: 1280, height: 720 });
  assert.deepEqual(atlas.project.notes, ['Rendered with LibreOffice.']);

  // colours: Retheme's usage names map to kinds (bg -> background, line -> border, accent/unknown -> fill)
  assert.deepEqual(tok('colors', '#ffffff').usage, { background: 9 + 1 + 1, text: 1 }, 'manifest bg + bg, the title slide background, the section title');
  assert.deepEqual(tok('colors', '#2e6bff').usage, { fill: 4 + 1 + 3, border: 2, text: 1, background: 1 }, 'fill/accent/glow, line; the subtitle; a gradient stop');
  assert.equal(tok('colors', '#2e6bff').label, 'accent1 · primary, hlink · hyperlink');
  assert.equal(tok('colors', '#eef0f3').count, 0, 'a declared colour with no usage is still listed');
  assert.equal(tok('colors', '#eef0f3').label, 'lt2');
  assert.ok(tok('colors', '#111111').usage.text >= 12 && tok('colors', '#111111').usage.background === 1, 'gradient stop counted as background');
  assert.deepEqual(atlas.tokens.fonts.map(f => f.value), ['Fictive Text', 'Fictive Display']);
  assert.deepEqual(atlas.tokens.fontSizes.map(f => f.value).sort(), ['12pt', '14pt', '32pt', '40pt', '8pt']);
  assert.deepEqual(atlas.tokens.fontWeights, [{ value: '400', count: 3 }, { value: '700', count: 2 }]);
  assert.deepEqual(atlas.tokens.cssVars, [
    { name: '--dk1', value: '#111111' }, { name: '--lt1', value: '#ffffff' }, { name: '--accent1', value: '#2e6bff' }, { name: '--hlink', value: '#2e6bff' }, { name: '--lt2', value: '#eef0f3' },
    { name: '--font-heading', value: 'Fictive Display' }, { name: '--font-body', value: 'Fictive Text' },
    { name: '--slide-width', value: '13.333in' }, { name: '--margin-left', value: '0.5in' }, { name: '--margin-top', value: '1.25in' }]);

  // screens and elements
  assert.deepEqual(atlas.screens.map(s => [s.id, s.url, s.purpose, s.width, s.height]), [
    ['title-slide', 'Fictive Corporate.potx › Title Slide', 'Title Slide', 1280, 720],
    ['section-header', 'Fictive Corporate.potx › Section Header', null, 1280, 720],
    ['blank', 'Fictive Corporate.potx › Blank!!', null, 1280, 720]]);
  const [title, section, blank] = atlas.screens;
  assert.deepEqual(title.inventory, { ctrTitle: 1, subTitle: 1, dt: 1, text: 1, pic: 1, logo: 1 });
  assert.deepEqual(title.elements[0], { role: 'ctrTitle', tag: 'placeholder', bbox: { x: 96, y: 192, w: 1056, h: 144 }, color: '#111111', bg: null,
    fontSize: '40pt', weight: '700', radius: null, font: 'Fictive Display', align: 'left' });
  assert.deepEqual(title.elements[2], { role: 'dt', tag: 'placeholder', bbox: { x: 96, y: 672, w: 192, h: 29 }, color: null, bg: null,
    fontSize: null, weight: null, radius: null, font: null, align: null });
  assert.deepEqual(title.elements[3], { role: 'text', tag: 'static text', bbox: { x: 960, y: 672, w: 192, h: 29 }, color: '#111111', bg: null,
    fontSize: '8pt', weight: '400', radius: null, font: 'Fictive Text', align: 'right' });
  assert.deepEqual(title.elements.slice(4).map(e => [e.role, e.tag, e.bbox]), [['pic', 'asset',{ x: 672, y: 96, w: 480, h: 384 }], ['logo', 'svg', { x: 1152, y: 653, w: 96, h: 48 }]]);
  assert.deepEqual(section.inventory, { title: 1, logo: 1, decorative_shape: 1 });
  assert.deepEqual(blank.inventory, { logo: 1 });

  // contrast: only text over a solid background; gradients have no single backdrop
  assert.deepEqual(atlas.contrast.map(c => [c.fg, c.bg, c.large, c.count]).sort(), [
    ['#111111', '#ffffff', false, 1], ['#111111', '#ffffff', true, 1], ['#2e6bff', '#ffffff', false, 1]]);
  assertNoContent(atlas, out, ['Confidential draft wording', 'not part of the package']);
});

test('Retheme zip nested in a top folder: previews set the pixel scale and are copied only with screenshots', async t => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'atlas-retheme-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const zip = path.join(dir, 'Fictive.zip'), out = path.join(dir, 'out'), out2 = path.join(dir, 'out2');
  writeZip(zip, zipEntries('Fictive'));
  assert.equal(detectKind(zip), 'retheme');

  const atlas = importRetheme({ source: zip, outDir: out });
  assert.deepEqual(atlas.project.units, { ppi: 144, slideInches: { width: 13.333, height: 7.5 } }, '1920px / 13.333in');
  assert.deepEqual(atlas.project.viewport, { width: 1920, height: 1080 });
  assert.deepEqual(atlas.screens[0].elements[0].bbox, { x: 144, y: 288, w: 1584, h: 216 });
  assert.ok(atlas.screens.every(s => s.screenshot === null));
  assert.ok(!existsSync(path.join(out, 'screens')));

  const shot = importRetheme({ source: zip, outDir: out2, screenshots: true });
  assert.deepEqual(shot.screens.map(s => s.screenshot), ['screens/title-slide.png', 'screens/section-header.png', null]);
  assert.deepEqual(readFileSync(path.join(out2, 'screens', 'title-slide.png')), fixtureFile('previews/layout-title-slide.png'));
});

test('Retheme: the committed fixture folder itself imports, previews found by the template tool\'s slug', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'atlas-retheme-'));
  try {
    const atlas = importRetheme({ source: FIXTURE, outDir: path.join(dir, 'out') });
    assert.equal(atlas.project.units.ppi, 144, 'every layout with a preview file was matched by its slug');
    assert.deepEqual(atlas.screens.map(s => s.id), ['title-slide', 'section-header', 'blank']);
    assertNoContent(atlas, path.join(dir, 'out'), ['Confidential draft wording', 'not part of the package', 'Invented values']);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('Retheme: a folder or zip without template.json is refused', async t => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'atlas-retheme-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(path.join(dir, 'empty'));
  assert.throws(() => importRetheme({ source: path.join(dir, 'empty'), outDir: path.join(dir, 'out') }), /No template\.json in empty/);
});

test('Retheme: geometry falls back to the grid, then to 13.333 x 7.5 in', async t => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'atlas-retheme-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const a = path.join(dir, 'a'), b = path.join(dir, 'b');
  mkdirSync(a); writeFileSync(path.join(a, 'template.json'), JSON.stringify({ grid: { slide_width_in: 10, slide_height_in: 5.625 }, layouts: [{ name: 'Only' }] }));
  mkdirSync(b); writeFileSync(path.join(b, 'template.json'), JSON.stringify({}));
  const ga = importRetheme({ source: a, outDir: path.join(dir, 'oa') }), gb = importRetheme({ source: b, outDir: path.join(dir, 'ob') });
  assert.deepEqual([ga.project.name, ga.project.source, ga.project.viewport, ga.project.previews], ['a', 'a', { width: 960, height: 540 }, null]);
  assert.equal(ga.screens[0].url, 'template › Only');
  assert.deepEqual([gb.project.viewport, gb.screens, gb.tokens.colors, gb.tokens.cssVars], [{ width: 1280, height: 720 }, [], [], []]);
});
