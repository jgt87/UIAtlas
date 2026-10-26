// Storybook adapter: reads a Storybook's story index (index.json, or stories.json on v6) from a deployed URL or a
// local storybook-static folder, opens each story in its iframe and measures just the story root with the web
// extractor. Every story becomes a screen (text-free style samples; screenshots only when opted in); tokens aggregate
// across stories, so the atlas is a component library.
import http from 'node:http';
import { readFile, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { capturePage, newMeasuringPage, mergeTokens, finalizeTokens } from './web-extract.mjs';
import { launchBrowser, prepareOut, writeAtlas, slug } from './atlas-util.mjs';

const ROOT = '#storybook-root, #root';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf' };

// Serve a storybook-static folder on a loopback port for the duration of the import (modules can't load from file://).
function serveFolder(dir) {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '') || 'index.html';
    const file = path.join(dir, rel);
    if (!file.startsWith(dir) || !existsSync(file) || statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
    readFile(file, (err, data) => { res.writeHead(err ? 404 : 200, { 'Content-Type': types[path.extname(file).toLowerCase()] || 'application/octet-stream' }); res.end(data); });
  });
  return new Promise(ok => server.listen(0, '127.0.0.1', () => ok({ base: `http://127.0.0.1:${server.address().port}/`, close: () => server.close() })));
}

// Story list from index.json (v7+: entries, type 'story'|'docs') or stories.json (v6: stories, kind = title).
async function storyIndex(base) {
  for (const f of ['index.json', 'stories.json']) {
    const res = await fetch(new URL(f, base)).catch(() => null);
    if (!res?.ok) continue;
    const j = await res.json().catch(() => null); if (!j) continue;
    const list = Object.values(j.entries || j.stories || {}).filter(e => (e.type || 'story') === 'story' && !(e.tags || []).includes('docs-only'));
    return list.map(e => ({ id: e.id, title: e.title || e.kind || '', name: e.name || e.story || e.id }));
  }
  throw new Error(`No Storybook index.json or stories.json at ${base}`);
}

export async function importStorybook({ source, outDir, maxStories = 60, viewport = { width: 1280, height: 900 }, screenshots = false }) {
  const local = !/^https?:\/\//i.test(source);
  const srv = local ? await serveFolder(path.resolve(source)) : null;
  const base = local ? srv.base : source.replace(/(iframe|index)\.html.*$/i, '').replace(/\/?$/, '/');
  const shotsDir = prepareOut(outDir, { screenshots });
  const browser = await launchBrowser();
  const screens = [], tokenAcc = {}, notes = [];
  try {
    const stories = await storyIndex(base);
    if (stories.length > maxStories) notes.push(`${stories.length} stories; measured the first ${maxStories} (raise with --pages).`);
    const page = await newMeasuringPage(browser, viewport);
    for (const s of stories.slice(0, maxStories)) {
      const rel = `iframe.html?id=${encodeURIComponent(s.id)}&viewMode=story`;
      const got = await capturePage(page, base + rel, shotsDir, { waitMs: 400, rootSel: ROOT, viewport, screenshots,
        waitFor: p => p.waitForFunction(sel => document.querySelector(sel)?.childElementCount > 0, ROOT, { timeout: 15000 }) });
      if (!got) { notes.push(`Could not load story ${s.id}.`); continue; }
      mergeTokens(tokenAcc, got.tokens);
      Object.assign(got.screen, { id: slug(s.id), url: local ? rel : base + rel, title: `${s.title} / ${s.name}`, purpose: s.title });
      screens.push(got.screen);
      console.log(`  [${screens.length}/${Math.min(stories.length, maxStories)}] ${s.title} / ${s.name}`);
    }
  } finally { await browser.close(); srv?.close(); }
  // capturePage names screenshots by URL hash; ids were reassigned to story ids, the file paths stay valid
  return writeAtlas(outDir, { project: { name: local ? path.basename(path.resolve(source)) : new URL(base).hostname, kind: 'storybook', source: local ? path.basename(path.resolve(source)) : base, viewport, notes },
    tokens: finalizeTokens(tokenAcc), screens }, { screenshots });
}
