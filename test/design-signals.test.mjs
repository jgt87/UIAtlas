// Colour usage, line height / letter spacing, contrast, font faces, modes and history, end to end on a local page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { extractSite, parseFontFaces } from '../src/web-extract.mjs';
import { contrastRatio, wcagLevel, contrastReport } from '../src/atlas-util.mjs';
import { parseMode, addModes } from '../src/modes.mjs';
import { toDtcg } from '../src/export.mjs';

const page = `<style>
  body { margin: 0; background: #ffffff; color: #222222; font: 16px/24px Georgia; letter-spacing: 0.5px }
  .card { background: #f0f0f0; border: 1px solid #cccccc; padding: 12px }
  .faint { color: #aaaaaa } .hero { background: linear-gradient(#000, #333); color: #ffffff }
  @media (prefers-color-scheme: dark) { body { background: #111111; color: #eeeeee } }
  html[data-theme=contrast] body { color: #000000 }
</style><p>Body copy</p><p>More copy</p><p>Even more</p><div class="card"><span class="faint">Muted</span></div><div class="hero">Over a gradient</div>`;

async function extract(extra = {}) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'atlas-signals-')), out = path.join(dir, 'out'), file = path.join(dir, 'p.html');
  mkdirSync(out); writeFileSync(file, page);
  const atlas = await extractSite({ startUrl: pathToFileURL(file).href, scope: pathToFileURL(dir + path.sep).href, outDir: out, name: 'p', kind: 'file', source: 'p.html', ...extra });
  return { atlas, out, file, dir };
}
const color = (a, v) => a.tokens.colors.find(c => c.value === v);

test('colours record what they are used for; text tokens come from text-bearing elements only', async () => {
  const { atlas } = await extract();
  assert.ok(color(atlas, '#222222').usage.text >= 1);
  assert.ok(color(atlas, '#f0f0f0').usage.background >= 1 && !color(atlas, '#f0f0f0').usage.text);
  assert.ok(color(atlas, '#cccccc').usage.border >= 1);
  assert.deepEqual(atlas.tokens.lineHeights.map(l => l.value), ['1.5']);
  assert.deepEqual(atlas.tokens.letterSpacings.map(l => l.value), ['0.5px']);
});

test('contrast: real backdrops, WCAG levels, gradients marked unknown', async () => {
  const { atlas } = await extract();
  const pair = (fg, bg) => atlas.contrast.find(c => c.fg === fg && c.bg === bg);
  assert.equal(pair('#222222', '#ffffff').level, 'AAA');
  assert.equal(pair('#aaaaaa', '#f0f0f0').level, 'fail'); // the card's grey, not the page white, is behind it
  assert.equal(atlas.contrast.find(c => c.fg === '#ffffff').level, 'unknown');
  assert.equal(contrastRatio('#777777', '#ffffff'), 4.48);
  assert.equal(wcagLevel(4.48, false), 'fail'); assert.equal(wcagLevel(3.1, true), 'AA');
  assert.deepEqual(contrastReport([{ fg: '#000000', bg: '#ffffff', large: false, count: 1 }, { fg: '#000000', bg: '#ffffff', large: false, count: 2 }]).map(c => c.count), [3]);
});

test('modes: dark colour scheme and <html> attributes give their own tokens; re-extracting keeps history', async () => {
  assert.deepEqual(parseMode('dark+mobile'), { colorScheme: 'dark', viewport: { width: 390, height: 844 } });
  assert.deepEqual(parseMode('html:data-theme=contrast+theme=g100'), { htmlAttrs: { 'data-theme': 'contrast' }, globals: { theme: 'g100' } });
  assert.throws(() => parseMode('sepia'), /Unknown mode/);
  const { out, file, dir } = await extract();
  const run = (o, tmp) => extractSite({ startUrl: pathToFileURL(file).href, scope: pathToFileURL(dir + path.sep).href, outDir: tmp, name: 'p', kind: 'file', source: 'p.html', ...o });
  const atlas = await addModes({ atlasDir: out, specs: ['dark', 'html:data-theme=contrast'], run });
  assert.ok(atlas.modes.dark.tokens.colors.some(c => c.value === '#111111'), 'dark background');
  assert.ok(atlas.modes['html:data-theme=contrast'].tokens.colors.some(c => c.value === '#000000' && c.usage?.text));
  assert.ok(!color(atlas, '#111111'), 'the base pass stays light');
  await run({}, out); // a re-extract archives the previous atlas
  assert.equal(readdirSync(path.join(out, 'history')).length, 1);
});

test('export: colour roles from usage, line height and letter spacing in the type tokens', async () => {
  const { atlas } = await extract();
  const j = toDtcg(atlas);
  assert.equal(j['color-usage'].text.primary.$value, `{color.${Object.entries(j.color).find(([, v]) => v.$value?.hex === '#222222')[0]}}`);
  assert.ok(j['color-usage'].background.primary && j['color-usage'].border.primary);
  assert.equal(j.font.lineHeight['1-5'].$value, 1.5);
  assert.deepEqual(j.font.letterSpacing['0-5px'].$value, { value: 0.5, unit: 'px' });
});

test('font faces: woff2 preferred, URLs resolved, data: URLs skipped', () => {
  const css = `@font-face { font-family: "Fictive Grotesk"; font-weight: 400 700; src: url(f.woff) format('woff'), url('../f.woff2') format("woff2") }
    @font-face { font-family: Inline; src: url(data:font/woff2;base64,AAAA) }`;
  assert.deepEqual(parseFontFaces(css, 'https://fonts.example.test/css/a.css'),
    [{ family: 'Fictive Grotesk', url: 'https://fonts.example.test/f.woff2', weight: '400 700', style: 'normal' }]);
});
