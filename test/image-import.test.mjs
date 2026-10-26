import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { launchBrowser } from '../src/atlas-util.mjs';
import { assertNoContent } from './helpers/no-content.mjs';
import { importImages } from '../src/image-import.mjs';

// Fixture: flat blocks with known hexes on a white page, plus an anti-aliased circle and a gradient strip
// whose edge/blend tones must not show up as palette colours.
const BLOCKS = ['#e4572e', '#17bebb', '#2e282a', '#ffc914'];
const html = `<!doctype html><body style="margin:0;background:#ffffff">
${BLOCKS.map((c, i) => `<div style="position:absolute;left:${40 + i * 300}px;top:40px;width:260px;height:300px;background:${c}"></div>`).join('')}
<div style="position:absolute;left:100px;top:400px;width:180px;height:180px;border-radius:50%;background:#17bebb"></div>
<div style="position:absolute;left:400px;top:430px;width:200px;height:120px;border-radius:50%;background:#e4572e;transform:rotate(17deg)"></div>
<div style="position:absolute;left:0;top:640px;width:1280px;height:80px;background:linear-gradient(90deg,#ff0000,#0000ff)"></div>
<p style="position:absolute;left:700px;top:420px;font:32px Georgia;color:#2e282a">Harbour lights at dusk</p></body>`;

test('importImages: flat blocks become the palette, edges and gradients do not', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-img-')), src = path.join(tmp, 'src'), out = path.join(tmp, 'out');
  fs.mkdirSync(src); fs.mkdirSync(out);
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.setContent(html);
    await page.screenshot({ path: path.join(src, 'b-board.png') });
    await page.setContent(`<body style="margin:0;background:#2e282a"><div style="width:400px;height:300px;background:#ffc914"></div></body>`);
    await page.setViewportSize({ width: 640, height: 480 });
    await page.screenshot({ path: path.join(src, 'a-small.jpg'), type: 'jpeg', quality: 95 });
  } finally { await browser.close(); }
  fs.writeFileSync(path.join(src, 'notes.txt'), 'ignored');

  const atlas = await importImages({ source: src, outDir: out });
  assert.equal(atlas.project.kind, 'image');
  assert.equal(atlas.project.source, 'src');
  assert.deepEqual(atlas.project.viewport, { width: 640, height: 480 }); // sorted by name: a-small first
  assert.deepEqual(atlas.screens.map(s => s.url), ['a-small.jpg', 'b-board.png']);
  assertNoContent(atlas, out); // the images themselves are not copied without --screenshots

  const board = atlas.screens[1], allowed = new Set([...BLOCKS, '#ffffff']);
  const boardColors = board.palette.map(p => p.value);
  for (const c of BLOCKS) assert.ok(boardColors.includes(c), `palette has ${c}: ${boardColors}`);
  assert.deepEqual(boardColors.filter(c => !allowed.has(c)), [], 'no anti-aliasing / gradient colours');
  assert.ok(board.flatShare > 0.5);

  const colors = atlas.tokens.colors;
  assert.ok(colors.every(c => c.label.startsWith('observed') && c.share > 0 && c.share <= 1));
  assert.ok(Math.abs(colors.reduce((a, c) => a + c.share, 0) - 1) < 0.01);
  assert.ok(colors.every(c => c.label === 'observed'), 'no file names in labels: they would reach exports');
  // JPEG tones may be off by a step; they must still land within a few units of the known colours
  const near = (a, b) => [1, 3, 5].every(i => Math.abs(parseInt(a.slice(i, i + 2), 16) - parseInt(b.slice(i, i + 2), 16)) <= 4);
  const small = atlas.screens[0].palette.map(p => p.value);
  assert.ok(small.some(c => near(c, '#ffc914')) && small.some(c => near(c, '#2e282a')), String(small));
  assert.ok(small.length <= 3, String(small));
  assert.ok(colors.length <= 8, colors.map(c => c.value).join(' '));
  const shot = await importImages({ source: src, outDir: out, screenshots: true });
  for (const s of shot.screens) assert.ok(fs.existsSync(path.join(out, s.screenshot)), s.screenshot);
  assert.equal(shot.screens[0].screenshot, 'screens/a-small.jpg');
  fs.rmSync(tmp, { recursive: true, force: true });
});
