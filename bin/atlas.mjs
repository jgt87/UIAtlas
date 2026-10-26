#!/usr/bin/env node
// UI Atlas CLI. Atlases hold design tokens and text-free style samples only; --screenshots (any extract/import
// command) additionally stores screenshots. Text content is never stored.
//   atlas extract <url> [--pages N] [--name NAME]   crawl a site into data/<name>/atlas.json + screenshots
//   atlas import <path> [--name NAME] [--kind K]     import a file/folder; the adapter is picked from its type (see src/detect.mjs)
//   atlas storybook <url> [--pages N] [--name NAME]  measure every story of a deployed Storybook
//   atlas export <atlas> [--format pdf,json,css] [--out DIR]   token sheet PDF + W3C tokens JSON + CSS variables
//   atlas serve [--port P]                           serve the viewer + all extracted atlases
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readdirSync, existsSync, mkdirSync, statSync } from 'node:fs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, 'data');
const argv = process.argv.slice(2);
const cmd = argv[0];
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const screenshots = argv.includes('--screenshots');
const safe = s => s.replace(/[^a-z0-9.-]/gi, '_');
const outFor = name => { const d = path.join(dataDir, safe(name)); mkdirSync(d, { recursive: true }); return d; };
const pages = d => Math.max(1, Number(opt('pages', String(d))) || d);
const done = (atlas, what = 'screens') => console.log(`Done: ${atlas.screens.length} ${what}, ${atlas.tokens.colors.length} colours, ${atlas.tokens.fonts.length} fonts${screenshots ? ', with screenshots' : ''}. Run: atlas serve`);

// Each importer: (absolute source, outDir) -> atlas. Loaded lazily so a missing optional dependency only affects its own kind.
const importers = {
  retheme: async (src, out) => (await import('../src/retheme-import.mjs')).importRetheme({ source: src, outDir: out, screenshots }),
  storybook: async (src, out) => (await import('../src/storybook-import.mjs')).importStorybook({ source: src, outDir: out, maxStories: pages(60), screenshots }),
  image: async (src, out) => (await import('../src/image-import.mjs')).importImages({ source: src, outDir: out, screenshots }),
  tokens: async (src, out) => (await import('../src/tokens-import.mjs')).importTokens({ source: src, outDir: out }),
  sketch: async (src, out) => (await import('../src/sketch-import.mjs')).importSketch({ source: src, outDir: out, screenshots }),
  pdf: async (src, out) => (await import('../src/pdf-import.mjs')).importPdf({ source: src, outDir: out, maxPages: pages(40), screenshots }),
  html: async (src, out) => {
    // local HTML/SVG: crawl from the file (or the folder's index.html) but only within that folder
    const dir = statSync(src).isDirectory() ? src : path.dirname(src);
    const start = statSync(src).isDirectory() ? path.join(src, existsSync(path.join(src, 'index.html')) ? 'index.html' : readdirSync(src).find(f => /\.(html?|svg)$/i.test(f))) : src;
    const { extractSite } = await import('../src/web-extract.mjs');
    return extractSite({ startUrl: pathToFileURL(start).href, scope: pathToFileURL(dir + path.sep).href, maxPages: pages(statSync(src).isDirectory() ? 20 : 1),
      outDir: out, name: path.basename(src), kind: 'file', source: path.basename(src), screenshots });
  },
};

if (cmd === 'extract') {
  const url = argv[1];
  if (!url || !/^https?:\/\//.test(url)) { console.error('Usage: atlas extract <https url> [--pages N] [--name NAME]   (local files: atlas import <path>)'); process.exit(1); }
  const name = opt('name') || new URL(url).hostname;
  const maxPages = pages(1);
  const { extractSite } = await import('../src/web-extract.mjs');
  console.log(`Extracting ${url} -> data/${safe(name)}  (up to ${maxPages} page${maxPages > 1 ? 's' : ''})`);
  done(await extractSite({ startUrl: url, maxPages, outDir: outFor(name), screenshots }));
} else if (cmd === 'import') {
  const src = argv[1] && path.resolve(argv[1]);
  if (!src || !existsSync(src)) { console.error(`Usage: atlas import <file or folder> [--name NAME] [--kind ${Object.keys(importers).join('|')}]`); process.exit(1); }
  const { detectKind } = await import('../src/detect.mjs');
  const kind = opt('kind') || detectKind(src);
  if (!importers[kind]) { console.error(`Can't tell what ${path.basename(src)} is${kind ? ` (unknown kind "${kind}")` : ''}. Pass --kind ${Object.keys(importers).join('|')}.`); process.exit(1); }
  const name = opt('name') || path.basename(src).replace(/\.[^.]+$/, '');
  console.log(`Importing ${path.basename(src)} as ${kind} -> data/${safe(name)}`);
  const atlas = await importers[kind](src, outFor(name));
  done(atlas, kind === 'retheme' ? 'layouts' : 'screens');
  for (const n of atlas.project.notes || []) console.log(`  note: ${n}`);
} else if (cmd === 'storybook') {
  const url = argv[1];
  if (!url || !/^https?:\/\//.test(url)) { console.error('Usage: atlas storybook <https url> [--pages N] [--name NAME]   (a local storybook-static folder: atlas import <folder>)'); process.exit(1); }
  const name = opt('name') || new URL(url).hostname;
  console.log(`Measuring stories of ${url} -> data/${safe(name)}`);
  done(await importers.storybook(url, outFor(name)), 'stories');
} else if (cmd === 'export') {
  const name = argv[1], atlasDir = name && path.join(dataDir, safe(name));
  if (!name || !existsSync(path.join(atlasDir, 'atlas.json'))) { console.error('Usage: atlas export <atlas name> [--format pdf,json,css] [--out DIR]   (names: run atlas without arguments)'); process.exit(1); }
  const formats = opt('format', 'pdf,json,css').split(',').map(f => f.trim().toLowerCase());
  const bad = formats.filter(f => !['pdf', 'json', 'css'].includes(f));
  if (bad.length) { console.error(`Unknown format: ${bad.join(', ')} (use pdf, json, css)`); process.exit(1); }
  const { exportAtlas } = await import('../src/export.mjs');
  const files = await exportAtlas({ atlasDir, formats, ...(opt('out') ? { outDir: path.resolve(opt('out')) } : {}) });
  console.log('Exported:\n' + files.map(f => '  ' + path.relative(process.cwd(), f)).join('\n'));
} else if (cmd === 'serve') {
  const port = Number(opt('port', '4300')) || 4300;
  const { serve } = await import('../src/serve.mjs');
  serve({ root, dataDir, port });
} else {
  console.log(`UI Atlas
  atlas extract <url> [--pages N] [--name NAME]      website
  atlas storybook <url> [--pages N] [--name NAME]    deployed Storybook
  atlas import <path> [--name NAME] [--kind K]       file or folder: Retheme package (.zip/folder), storybook-static folder,
                                                     HTML/SVG, images, design-token JSON, .sketch, .pdf
  atlas export <atlas> [--format pdf,json,css] [--out DIR]
                                                     token sheet PDF, W3C design tokens JSON, CSS variables
  atlas serve [--port P]

Atlases store design tokens and text-free style samples only. Add --screenshots to an extract/storybook/import
command to also keep screenshots; text content is never stored.`);
  if (existsSync(dataDir)) { const sets = readdirSync(dataDir).filter(d => existsSync(path.join(dataDir, d, 'atlas.json'))); if (sets.length) console.log('\nExtracted atlases: ' + sets.join(', ')); }
}
