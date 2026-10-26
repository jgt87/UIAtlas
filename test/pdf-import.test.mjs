import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { launchBrowser } from '../src/atlas-util.mjs';
import { importPdf, parseFontName } from '../src/pdf-import.mjs';

// Fixture: a two-page brochure for an invented bakery, with known fonts, sizes and colours.
const html = `<!doctype html><style>
  @page { size: A4; margin: 0 } body { margin: 0; font-family: Georgia; }
  section { height: 297mm; position: relative; page-break-after: always; padding: 20mm; box-sizing: border-box }
  h1 { font: bold 32pt Georgia; color: #8a2be2; margin: 0 0 8mm }
  p { font: 11pt Georgia; color: #333333; margin: 0 0 4mm }
  .box { width: 60mm; height: 30mm; margin: 6mm 0 }
</style>
<section><h1>Copper Kettle Bakery</h1>
  <p>Fresh sourdough every morning from our stone oven.</p><p>Seasonal pastries with orchard fruit and honey.</p>
  <div class="box" style="background:#e4572e"></div><div class="box" style="background:#17bebb"></div></section>
<section><h1>Opening hours</h1><p>Tuesday to Sunday, seven until two.</p><p style="color:#e4572e">Closed on public holidays.</p>
  <div class="box" style="background:#ffc914"></div></section>`;

test('parseFontName strips subset prefixes and style suffixes', () => {
  assert.deepEqual(parseFontName('ABCDEF+Georgia-Bold'), { font: 'Georgia-Bold', family: 'Georgia', weight: '700' });
  assert.deepEqual(parseFontName('TimesNewRomanPS-BoldItalicMT'), { font: 'TimesNewRomanPS-BoldItalicMT', family: 'Times New Roman', weight: '700' });
  assert.equal(parseFontName('Inter-SemiBold').weight, '600');
  assert.equal(parseFontName('Lato-Light').weight, '300');
  assert.equal(parseFontName('Lato-Black').weight, '900');
  assert.equal(parseFontName('Lato').weight, '400');
});

test('importPdf: pages, text, fonts, sizes and colours', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-pdf-')), out = path.join(tmp, 'out'), pdf = path.join(tmp, 'brochure.pdf');
  fs.mkdirSync(out);
  const browser = await launchBrowser();
  try { const page = await browser.newPage(); await page.setContent(html); await page.pdf({ path: pdf, preferCSSPageSize: true, printBackground: true }); }
  finally { await browser.close(); }

  const atlas = await importPdf({ source: pdf, outDir: out });
  assert.equal(atlas.project.kind, 'pdf');
  assert.equal(atlas.project.source, 'brochure.pdf');
  assert.equal(atlas.screens.length, 2);
  assert.deepEqual(atlas.screens.map(s => s.id), ['p1', 'p2']);
  const [p1, p2] = atlas.screens;
  assert.ok(p1.width >= 1200 && p1.width <= 1300, String(p1.width));
  assert.ok(Math.abs(p1.height / p1.width - 297 / 210) < 0.02);
  assert.deepEqual(atlas.project.viewport, { width: p1.width, height: p1.height });
  for (const s of atlas.screens) assert.ok(fs.statSync(path.join(out, s.screenshot)).size > 1000);

  const h1 = p1.elements.find(e => e.text === 'Copper Kettle Bakery');
  assert.ok(h1, JSON.stringify(p1.elements.map(e => e.text)));
  assert.equal(h1.role, 'heading');
  assert.equal(h1.fontSize, '32pt');
  assert.equal(h1.weight, '700');
  assert.equal(h1.font, 'Georgia');
  assert.equal(h1.color, '#8a2be2');
  assert.ok(h1.bbox.x > 50 && h1.bbox.y > 50 && h1.bbox.w > 300 && h1.bbox.h > 30, JSON.stringify(h1.bbox));
  const body = p1.elements.find(e => e.text.startsWith('Fresh sourdough'));
  assert.equal(body.role, 'text'); assert.equal(body.fontSize, '11pt'); assert.equal(body.color, '#333333'); assert.equal(body.weight, '400');
  assert.equal(p2.elements.find(e => e.text.startsWith('Closed on')).color, '#e4572e');
  assert.equal(p1.elements[0].text, 'Copper Kettle Bakery'); // largest first
  assert.deepEqual(p1.inventory, { text: 3, heading: 1, image: 0 });

  const values = k => atlas.tokens[k].map(t => t.value);
  for (const c of ['#e4572e', '#17bebb', '#ffc914', '#8a2be2', '#333333']) assert.ok(values('colors').includes(c), `${c} in ${values('colors')}`);
  assert.deepEqual(values('fonts'), ['Georgia']);
  assert.deepEqual(values('fontSizes').sort(), ['11pt', '32pt']);
  assert.deepEqual(values('fontWeights').sort(), ['400', '700']);

  const cut = await importPdf({ source: pdf, outDir: out, maxPages: 1 });
  assert.equal(cut.screens.length, 1);
  assert.match(cut.project.notes.join(' '), /first 1 of 2 pages/);
  assert.equal(fs.readdirSync(path.join(out, 'screens')).length, 1);
  fs.rmSync(tmp, { recursive: true, force: true });
});
