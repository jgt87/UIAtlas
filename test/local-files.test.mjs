// Local HTML/SVG via the web extractor (file:// crawl limited to the start folder) and Storybook (fake static build).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { extractSite } from '../src/web-extract.mjs';
import { importStorybook } from '../src/storybook-import.mjs';
import { detectKind } from '../src/detect.mjs';

const tmp = () => mkdtempSync(path.join(os.tmpdir(), 'atlas-test-'));
const values = list => list.map(x => x.value);

test('local HTML folder: crawls linked pages inside the folder only, records relative urls', async () => {
  const dir = tmp(), site = path.join(dir, 'site'), out = path.join(dir, 'out');
  mkdirSync(site); mkdirSync(out);
  writeFileSync(path.join(dir, 'outside.html'), '<h1>outside</h1>');
  writeFileSync(path.join(site, 'index.html'), `<style>body{font-family:Georgia;color:#123456}h1{font-size:40px}.b{background:#c0ffee;padding:12px;border-radius:6px}.dot{width:20px;height:20px;border-radius:50%;background:#123456}.tab{height:20px;border-radius:8px 8px 0 0;background:#654321}</style><div class="dot"></div><div class="tab"></div>
    <h1>Home</h1><a href="about.html">About</a><a href="../outside.html">Out</a><button class="b">Go</button>`);
  writeFileSync(path.join(site, 'about.html'), '<style>body{color:#654321}</style><h2>About</h2>');
  assert.equal(detectKind(site), 'html');
  const atlas = await extractSite({ startUrl: pathToFileURL(path.join(site, 'index.html')).href, scope: pathToFileURL(site + path.sep).href, maxPages: 10, outDir: out, name: 'site', kind: 'file', source: 'site' });
  assert.deepEqual(atlas.screens.map(s => s.url).sort(), ['about.html', 'index.html']);
  assert.equal(atlas.project.kind, 'file');
  assert.ok(!JSON.stringify(atlas).includes(dir.replace(/\\/g, '/')) && !JSON.stringify(atlas).includes(dir), 'no absolute local paths in the atlas');
  for (const c of ['#123456', '#654321', '#c0ffee']) assert.ok(values(atlas.tokens.colors).includes(c), c);
  assert.ok(values(atlas.tokens.fonts).includes('Georgia'));
  for (const r of ['6px', '50%', '8px 8px 0px 0px']) assert.ok(values(atlas.tokens.radii).includes(r), r); // all corners; % kept as %
  assert.ok(atlas.screens.every(s => existsSync(path.join(out, s.screenshot))));
});

test('SVG file: fill and stroke colours and text are measured', async () => {
  const dir = tmp(), out = path.join(dir, 'out'); mkdirSync(out);
  const svg = path.join(dir, 'logo.svg');
  writeFileSync(svg, `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="120"><rect width="300" height="120" fill="#fafafa"/>
    <circle cx="60" cy="60" r="40" fill="#e4572e" stroke="#29335c" stroke-width="4"/><text x="120" y="70" font-family="Verdana" font-size="28" fill="#29335c">Acme</text></svg>`);
  assert.equal(detectKind(svg), 'html');
  const atlas = await extractSite({ startUrl: pathToFileURL(svg).href, scope: pathToFileURL(dir + path.sep).href, outDir: out, name: 'logo.svg', kind: 'file', source: 'logo.svg' });
  for (const c of ['#fafafa', '#e4572e', '#29335c']) assert.ok(values(atlas.tokens.colors).includes(c), c);
  const text = atlas.screens[0].elements.find(e => e.role === 'text');
  assert.equal(text?.text, 'Acme');
});

test('Storybook static folder: one screen per story, docs entries skipped, measured inside the story root', async () => {
  const dir = tmp(), sb = path.join(dir, 'storybook-static'), out = path.join(dir, 'out');
  mkdirSync(sb); mkdirSync(out);
  writeFileSync(path.join(sb, 'index.json'), JSON.stringify({ v: 5, entries: {
    'button--primary': { id: 'button--primary', title: 'Button', name: 'Primary', type: 'story' },
    'button--secondary': { id: 'button--secondary', title: 'Button', name: 'Secondary', type: 'story' },
    'button--docs': { id: 'button--docs', title: 'Button', name: 'Docs', type: 'docs' } } }));
  // a stand-in for Storybook's preview iframe: renders the story named in ?id into #storybook-root
  writeFileSync(path.join(sb, 'iframe.html'), `<!doctype html><style>body{background:#ffffff;margin:0}</style><div class="chrome" style="color:#ff00ff">sidebar</div><div id="storybook-root"></div>
    <script type="module">const id = new URLSearchParams(location.search).get('id');
    const bg = id.endsWith('primary') ? '#1a73e8' : '#e8eaed', fg = id.endsWith('primary') ? '#ffffff' : '#202124';
    setTimeout(() => { document.getElementById('storybook-root').innerHTML = '<button style="background:' + bg + ';color:' + fg + ';border:0;border-radius:8px;padding:10px 16px;font:600 14px Arial">Click</button>'; }, 100);</script>`);
  assert.equal(detectKind(sb), 'storybook');
  const atlas = await importStorybook({ source: sb, outDir: out });
  assert.deepEqual(atlas.screens.map(s => s.title), ['Button / Primary', 'Button / Secondary']);
  assert.equal(atlas.project.kind, 'storybook');
  const cols = values(atlas.tokens.colors);
  for (const c of ['#1a73e8', '#e8eaed', '#202124']) assert.ok(cols.includes(c), c);
  assert.ok(!cols.includes('#ff00ff'), 'chrome outside the story root is not measured');
  assert.ok(values(atlas.tokens.radii).includes('8px'));
  assert.ok(atlas.screens.every(s => s.url.startsWith('iframe.html?id=') && existsSync(path.join(out, s.screenshot))));
  assert.ok(!readFileSync(path.join(out, 'atlas.json'), 'utf8').includes('127.0.0.1'), 'no temporary server address recorded');
});
