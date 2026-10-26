#!/usr/bin/env node
// UI Atlas CLI. Atlases hold design tokens and text-free style samples only; --screenshots (any extract/import
// command) additionally stores screenshots. Text content is never stored.
//   atlas extract <url> [--pages N] [--name NAME]   crawl a site into data/<name>/atlas.json
//   atlas import <path> [--name NAME] [--kind K]     import a file/folder; the adapter is picked from its type (see src/detect.mjs)
//   atlas storybook <url> [--pages N] [--name NAME]  measure every story of a deployed Storybook
//   atlas compare <atlas> (--against <atlas> | --previous)   brand check / drift report
//   atlas export <atlas> [--format pdf,json,css] [--out DIR]   token sheet PDF + W3C tokens JSON + CSS variables
//   atlas serve [--port P]                           serve the viewer + all extracted atlases
// Crawling options (extract, storybook, html): --modes dark,mobile,... --delay MS --ignore-robots
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readdirSync, existsSync, mkdirSync, statSync, readFileSync, writeFileSync, rmSync } from 'node:fs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, 'data');
const argv = process.argv.slice(2);
const cmd = argv[0];
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const screenshots = argv.includes('--screenshots');
const safe = s => s.replace(/[^a-z0-9.-]/gi, '_');
const created = []; // output folders made by this run: removed again if the run fails before writing an atlas
const outFor = name => { const d = path.join(dataDir, safe(name)); if (!existsSync(d)) created.push(d); mkdirSync(d, { recursive: true }); return d; };
// Failures print one readable line (no stack, no local paths; --debug shows the full error) and leave nothing behind.
process.on('uncaughtException', e => {
  for (const d of created) if (!existsSync(path.join(d, 'atlas.json'))) rmSync(d, { recursive: true, force: true });
  if (argv.includes('--debug')) console.error(e);
  else {
    let msg = String(e?.message || e);
    const src = argv[1] && path.resolve(argv[1]);
    const hide = [[src, src && path.basename(src)], [os.tmpdir(), '<temp>'], [os.homedir(), '~'], [root, '.']];
    for (const [from, to] of hide) if (from) for (const f of [from, from.replace(/\\/g, '/')]) msg = msg.split(f).join(to);
    console.error(`Error: ${msg}`);
  }
  process.exit(1);
});
const pages = d => Math.max(1, Number(opt('pages', String(d))) || d);
const done = (atlas, what = 'screens') => console.log(`Done: ${atlas.screens.length} ${what}, ${atlas.tokens.colors.length} colours, ${atlas.tokens.fonts.length} fonts${screenshots ? ', with screenshots' : ''}${atlas.modes ? `, modes: ${Object.keys(atlas.modes).join(', ')}` : ''}. Run: atlas serve`);
const notes = atlas => { for (const n of atlas.project.notes || []) console.log(`  note: ${n}`); };
// politeness for web crawls: robots.txt unless --ignore-robots (only for sites you run yourself), --delay ms between requests
const polite = d => ({ ignoreRobots: argv.includes('--ignore-robots'), delayMs: Math.max(0, Number(opt('delay', String(d)))) });
const modeSpecs = (opt('modes') || '').split(',').map(s => s.trim()).filter(Boolean);
const atlasDirOf = n => n && path.join(dataDir, safe(n));
const hasAtlas = n => n && existsSync(path.join(atlasDirOf(n), 'atlas.json'));

// Each importer: (absolute source, outDir, extra options) -> atlas. Loaded lazily so a missing optional dependency only
// affects its own kind. `moddable` importers take the mode options (colorScheme, viewport, globals) from --modes.
const htmlRun = (src, out, extra = {}) => {
  // local HTML/SVG: crawl from the file (or the folder's index.html) but only within that folder
  const dir = statSync(src).isDirectory() ? src : path.dirname(src);
  const start = statSync(src).isDirectory() ? path.join(src, existsSync(path.join(src, 'index.html')) ? 'index.html' : readdirSync(src).find(f => /\.(html?|svg)$/i.test(f))) : src;
  return import('../src/web-extract.mjs').then(m => m.extractSite({ startUrl: pathToFileURL(start).href, scope: pathToFileURL(dir + path.sep).href, maxPages: pages(statSync(src).isDirectory() ? 20 : 1),
    outDir: out, name: path.basename(src), kind: 'file', source: path.basename(src), screenshots, ...extra }));
};
const importers = {
  pptx: async (src, out) => (await import('../src/pptx-import.mjs')).importPptx({ source: src, outDir: out }),
  retheme: async (src, out) => (await import('../src/retheme-import.mjs')).importRetheme({ source: src, outDir: out, screenshots }),
  storybook: async (src, out, extra = {}) => (await import('../src/storybook-import.mjs')).importStorybook({ source: src, outDir: out, maxStories: pages(60), screenshots, ...polite(500), ...extra }),
  image: async (src, out) => (await import('../src/image-import.mjs')).importImages({ source: src, outDir: out, screenshots }),
  tokens: async (src, out) => (await import('../src/tokens-import.mjs')).importTokens({ source: src, outDir: out }),
  sketch: async (src, out) => (await import('../src/sketch-import.mjs')).importSketch({ source: src, outDir: out, screenshots }),
  pdf: async (src, out) => (await import('../src/pdf-import.mjs')).importPdf({ source: src, outDir: out, maxPages: pages(40), screenshots }),
  html: htmlRun,
};
const moddable = new Set(['storybook', 'html']);
// Run the base pass, then one extra pass per --modes entry (without screenshots) and store their tokens in the atlas.
async function withModes(run, outDir) {
  const atlas = await run({}, outDir);
  if (!modeSpecs.length) return atlas;
  const { addModes } = await import('../src/modes.mjs');
  return addModes({ atlasDir: outDir, specs: modeSpecs, run: (o, tmp) => run({ ...o, screenshots: false }, tmp, true) });
}

if (cmd === 'extract') {
  const url = argv[1];
  if (!url || !/^https?:\/\//.test(url)) { console.error('Usage: atlas extract <https url> [--pages N] [--name NAME] [--modes dark,mobile] [--delay MS] [--ignore-robots]   (local files: atlas import <path>)'); process.exit(1); }
  const name = opt('name') || new URL(url).hostname;
  const maxPages = pages(1);
  const { extractSite } = await import('../src/web-extract.mjs');
  console.log(`Extracting ${url} -> data/${safe(name)}  (up to ${maxPages} page${maxPages > 1 ? 's' : ''})`);
  const atlas = await withModes(({ globals, ...o }, out, isMode) => extractSite({ startUrl: url, maxPages, outDir: out, screenshots: screenshots && !isMode, ...polite(1000), ...o }), outFor(name));
  done(atlas); notes(atlas);
} else if (cmd === 'import') {
  const src = argv[1] && path.resolve(argv[1]);
  if (!src || !existsSync(src)) { console.error(`Usage: atlas import <file or folder> [--name NAME] [--kind ${Object.keys(importers).join('|')}]`); process.exit(1); }
  const { detectKind } = await import('../src/detect.mjs');
  const kind = opt('kind') || detectKind(src);
  if (!importers[kind]) { console.error(`Can't tell what ${path.basename(src)} is${kind ? ` (unknown kind "${kind}")` : ''}. Pass --kind ${Object.keys(importers).join('|')}.`); process.exit(1); }
  if (modeSpecs.length && !moddable.has(kind)) { console.error(`--modes needs something a browser renders (website, Storybook, HTML/SVG), not ${kind}.`); process.exit(1); }
  const name = opt('name') || path.basename(src).replace(/\.[^.]+$/, '');
  console.log(`Importing ${path.basename(src)} as ${kind} -> data/${safe(name)}`);
  const atlas = await withModes((o, out) => importers[kind](src, out, o), outFor(name));
  done(atlas, kind === 'retheme' || kind === 'pptx' ? 'layouts' : 'screens'); notes(atlas);
} else if (cmd === 'storybook') {
  const url = argv[1];
  if (!url || !/^https?:\/\//.test(url)) { console.error('Usage: atlas storybook <https url> [--pages N] [--name NAME] [--modes dark,theme=g100] [--delay MS] [--ignore-robots]   (a local storybook-static folder: atlas import <folder>)'); process.exit(1); }
  const name = opt('name') || new URL(url).hostname;
  console.log(`Measuring stories of ${url} -> data/${safe(name)}`);
  const atlas = await withModes((o, out) => importers.storybook(url, out, o), outFor(name));
  done(atlas, 'stories'); notes(atlas);
} else if (cmd === 'compare') {
  const name = argv[1], against = opt('against'), previous = argv.includes('--previous');
  if (!hasAtlas(name) || (!previous && !hasAtlas(against))) { console.error('Usage: atlas compare <atlas> --against <reference atlas>   or   atlas compare <atlas> --previous   [--delta-e N]'); process.exit(1); }
  const { compareAtlases, formatReport, latestSnapshot } = await import('../src/compare.mjs');
  const read = n => JSON.parse(readFileSync(path.join(atlasDirOf(n), 'atlas.json'), 'utf8'));
  const reference = previous ? latestSnapshot(atlasDirOf(name)) : read(against);
  if (!reference) { console.error(`No earlier snapshot of ${name} yet: history is kept from the next re-extract on.`); process.exit(1); }
  const report = compareAtlases(read(name), reference, { deltaE: Number(opt('delta-e', '3')) || 3 });
  const dir = path.join(atlasDirOf(name), 'reports'); mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `compare-${previous ? 'previous' : safe(against)}.json`);
  writeFileSync(file, JSON.stringify(report, null, 2));
  console.log(formatReport(report) + `\nFull report: ${path.relative(process.cwd(), file)}`);
} else if (cmd === 'export') {
  const name = argv[1], atlasDir = atlasDirOf(name);
  if (!hasAtlas(name)) { console.error('Usage: atlas export <atlas name> [--format pdf,json,css] [--out DIR]   (names: run atlas without arguments)'); process.exit(1); }
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
  atlas import <path> [--name NAME] [--kind K]       file or folder: PowerPoint (.pptx/.potx), storybook-static folder,
                                                     HTML/SVG, images, design-token JSON, .sketch, .pdf, template package (.zip/folder)
  atlas compare <atlas> --against <atlas>            brand check: which colours, fonts, sizes, radii are off-reference
  atlas compare <atlas> --previous                   drift since the previous extraction of the same atlas
  atlas export <atlas> [--format pdf,json,css] [--out DIR]
                                                     token sheet PDF, W3C design tokens JSON, CSS variables
  atlas serve [--port P]

Websites, Storybooks and HTML/SVG also take:
  --modes dark,mobile,...   extra passes: dark, light, mobile, tablet, desktop, wide, <W>x<H>, <storybook global>=<value>; join with +
  --delay MS                pause between requests to a site (default 1000, Storybook 500; a longer robots.txt Crawl-delay wins)
  --ignore-robots           skip robots.txt — only for sites you run yourself

Atlases store design tokens and text-free style samples only. Add --screenshots to an extract/storybook/import
command to also keep screenshots; text content is never stored.`);
  if (existsSync(dataDir)) { const sets = readdirSync(dataDir).filter(d => existsSync(path.join(dataDir, d, 'atlas.json'))); if (sets.length) console.log('\nExtracted atlases: ' + sets.join(', ')); }
}
