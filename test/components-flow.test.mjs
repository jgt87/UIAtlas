// Component variants (style clusters per role) and the page flow graph.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { clusterComponents } from '../src/components.mjs';
import { extractSite } from '../src/web-extract.mjs';

const el = (role, style) => ({ role, tag: 'x', bbox: { x: 0, y: 0, w: 1, h: 1 }, ...style });

test('variants: grouped by full style, named filled/outline/plain by rank, one-offs dropped once styles repeat', () => {
  const primary = { bg: '#1a73e8', color: '#ffffff', radius: '8px', fontSize: '14px', weight: '600', padding: '8px 16px' };
  const screens = [
    { id: 'a', elements: [el('button', primary), el('button', primary), el('button', { color: '#1a73e8', border: '#1a73e8', radius: '8px', fontSize: '14px' }), el('image', {})] },
    { id: 'b', elements: [el('button', primary), el('button', { color: '#1a73e8', border: '#1a73e8', radius: '8px', fontSize: '14px' }), el('button', { bg: '#e8eaed', color: '#202124', fontSize: '14px' }),
      el('button', { bg: '#e8eaed', color: '#202124', fontSize: '14px' }), el('button', { bg: '#ff0000', fontSize: '30px' }), el('link', { color: '#1a73e8', fontSize: '14px' })] },
  ];
  const c = clusterComponents(screens);
  assert.deepEqual(c.button.map(v => [v.name, v.count, v.screens]), [['filled', 3, 2], ['outline', 2, 2], ['filled-2', 2, 1]]); // the one-off red is dropped
  assert.deepEqual(c.button[0].style, primary);
  assert.equal(c.button[0].share, 0.375);
  assert.deepEqual(c.link.map(v => v.name), ['plain']);
  assert.ok(!c.image, 'images are not components');
});

test('flow: links between captured pages become edges; links outside the crawl do not', async t => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'atlas-flow-')), site = path.join(dir, 'site'), out = path.join(dir, 'out');
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(site); mkdirSync(out);
  writeFileSync(path.join(site, 'index.html'), '<a href="a.html">A</a><a href="b.html">B</a><a href="https://example.test/x">X</a>');
  writeFileSync(path.join(site, 'a.html'), '<a href="index.html">Home</a><a href="b.html">B</a>');
  writeFileSync(path.join(site, 'b.html'), '<a href="a.html">A</a>');
  const atlas = await extractSite({ startUrl: pathToFileURL(path.join(site, 'index.html')).href, scope: pathToFileURL(site + path.sep).href, maxPages: 5, outDir: out, name: 'site', kind: 'file', source: 'site' });
  const id = Object.fromEntries(atlas.screens.map(s => [s.url, s.id])), edge = (a, b) => `${id[a]}>${id[b]}`;
  assert.equal(atlas.flow.start, id['index.html']);
  assert.deepEqual(atlas.flow.edges.map(e => `${e.from}>${e.to}`).sort(),
    [edge('index.html', 'a.html'), edge('index.html', 'b.html'), edge('a.html', 'index.html'), edge('a.html', 'b.html'), edge('b.html', 'a.html')].sort());
});
