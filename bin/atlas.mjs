#!/usr/bin/env node
// UI Atlas CLI. Atlases hold design tokens and text-free style samples only; --screenshots (any extract/import
// command) additionally stores screenshots. Text content is never stored.
//   atlas extract <url> [--pages N] [--name NAME]   crawl a site into data/<name>/atlas.json
//   atlas import <path> [--name NAME] [--kind K]     import a file/folder; the adapter is picked from its type (see src/detect.mjs)
//   atlas storybook <url> [--pages N] [--name NAME]  measure every story of a deployed Storybook
//   atlas compare <atlas> (--against <atlas> | --previous)   brand check / drift report
//   atlas export <atlas> [--format <formats>] [--out DIR]   token sheet PDF, W3C tokens JSON, CSS variables, HTML page + CSS
//   atlas serve [--port P]                           serve the viewer + all extracted atlases
// Crawling options (extract, storybook, html): --modes dark,mobile,... --delay MS --ignore-robots
// Making an atlas under a name that already exists replaces it (and says so); the viewer's server asks first.
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readdirSync, existsSync, mkdirSync, statSync, rmSync } from 'node:fs';
import { EXPORT_FORMAT_IDS } from '../viewer/js/shared.js';
import { atlasFolderName, readAtlasFile, writeJsonFile } from '../src/atlas-file.mjs';
import { validate } from '../src/validate.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, 'data');
const argv = process.argv.slice(2);
const cmd = argv[0];
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const screenshots = argv.includes('--screenshots');
const safe = s => atlasFolderName(s);
const FORMATS = EXPORT_FORMAT_IDS.join(',');
const created = []; // output folders made by this run: removed again if the run fails before writing an atlas
const outFor = name => { const d = path.join(dataDir, safe(name)); if (!existsSync(d)) created.push(d); mkdirSync(d, { recursive: true }); return d; };
// Failures print one readable line (no stack, no local paths; --debug shows the full error) and leave nothing behind.
const removePartialOutput = () => { for (const d of created) if (!existsSync(path.join(d, 'atlas.json'))) rmSync(d, { recursive: true, force: true }); };
// local paths in an error message, in both slash styles: the source shows as its base name, temp as <temp>, home as ~, the repo as .
function publicMessage(e) {
  const src = argv[1] && path.resolve(argv[1]);
  const hide = [[src, src && path.basename(src)], [os.tmpdir(), '<temp>'], [os.homedir(), '~'], [root, '.']].filter(([from]) => from);
  return hide.flatMap(([from, to]) => [[from, to], [from.replace(/\\/g, '/'), to]]).reduce((msg, [f, to]) => msg.split(f).join(to), String(e?.message || e));
}
process.on('uncaughtException', e => {
  removePartialOutput();
  console.error(argv.includes('--debug') ? e : `Error: ${publicMessage(e)}`);
  process.exit(1);
});

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

// The value options, checked before anything runs (src/validate.mjs): a wrong one stops with the option, what it
// expects and an example.
const NAME = { type: 'string', maxLength: 120, example: 'example-site' };
const CLI_OPTIONS = {
  pages: { type: 'integer', min: 1, max: 10000, example: 5 },
  name: NAME,
  against: NAME,
  kind: { type: 'string', enum: Object.keys(importers) },
  modes: { type: 'string', maxLength: 300, example: 'dark,mobile' },
  delay: { type: 'integer', min: 0, max: 600000, example: 1000 },
  format: { type: 'array', items: { type: 'string', enum: EXPORT_FORMAT_IDS }, minItems: 1, example: 'json,css' },
  out: { type: 'string', maxLength: 1024, example: 'exports' },
  port: { type: 'integer', min: 1, max: 65535, example: 4300 },
  'delta-e': { type: 'number', min: 0, max: 100, example: 3 },
};
let o;
try { o = validate(CLI_OPTIONS, { ...Object.fromEntries(Object.keys(CLI_OPTIONS).map(k => [k, opt(k)])), format: opt('format')?.toLowerCase() }, { coerce: true }); }
catch (e) { console.error(`Error: --${e.message}`); process.exit(1); }

const pages = d => o.pages ?? d;
const done = (atlas, what = 'screens') => console.log(`Done: ${atlas.screens.length} ${what}, ${atlas.tokens.colors.length} colours, ${atlas.tokens.fonts.length} fonts${screenshots ? ', with screenshots' : ''}${atlas.modes ? `, modes: ${Object.keys(atlas.modes).join(', ')}` : ''}. Run: atlas serve`);
const notes = atlas => { for (const n of atlas.project.notes || []) console.log(`  note: ${n}`); };
// politeness for web crawls: robots.txt unless --ignore-robots (only for sites you run yourself), --delay ms between requests
const polite = d => ({ ignoreRobots: argv.includes('--ignore-robots'), delayMs: o.delay ?? d });
const modeSpecs = (o.modes || '').split(',').map(s => s.trim()).filter(Boolean);
const atlasDirOf = n => n && path.join(dataDir, safe(n));
const hasAtlas = n => n && existsSync(path.join(atlasDirOf(n), 'atlas.json'));
// the CLI replaces an existing atlas of the same name (an explicit command), but always says so
const sayIfReplacing = name => { if (hasAtlas(name)) console.log(`Replacing the existing atlas data/${safe(name)} (its previous atlas.json is kept in history/).`); };

// Run the base pass, then one extra pass per --modes entry (without screenshots) and store their tokens in the atlas.
async function withModes(run, outDir) {
  const atlas = await run({}, outDir);
  if (!modeSpecs.length) return atlas;
  const { addModes } = await import('../src/modes.mjs');
  return addModes({ atlasDir: outDir, specs: modeSpecs, run: (m, tmp) => run({ ...m, screenshots: false }, tmp, true) });
}

if (cmd === 'extract') {
  const url = argv[1];
  if (!url || !/^https?:\/\//.test(url)) { console.error('Usage: atlas extract <https url> [--pages N] [--name NAME] [--modes dark,mobile] [--delay MS] [--ignore-robots]   (local files: atlas import <path>)'); process.exit(1); }
  const name = o.name || new URL(url).hostname;
  const maxPages = pages(1);
  const { extractSite } = await import('../src/web-extract.mjs');
  console.log(`Extracting ${url} -> data/${safe(name)}  (up to ${maxPages} page${maxPages > 1 ? 's' : ''})`);
  sayIfReplacing(name);
  const atlas = await withModes(({ globals, ...m }, out, isMode) => extractSite({ startUrl: url, maxPages, outDir: out, screenshots: screenshots && !isMode, ...polite(1000), ...m }), outFor(name));
  done(atlas); notes(atlas);
} else if (cmd === 'import') {
  const src = argv[1] && path.resolve(argv[1]);
  if (!src || !existsSync(src)) { console.error(`Usage: atlas import <file or folder> [--name NAME] [--kind ${Object.keys(importers).join('|')}]`); process.exit(1); }
  const { detectKind } = await import('../src/detect.mjs');
  const kind = o.kind || detectKind(src);
  if (!importers[kind]) { console.error(`Can't tell what ${path.basename(src)} is. Pass --kind ${Object.keys(importers).join('|')}.`); process.exit(1); }
  if (modeSpecs.length && !moddable.has(kind)) { console.error(`--modes needs something a browser renders (website, Storybook, HTML/SVG), not ${kind}.`); process.exit(1); }
  const name = o.name || path.basename(src).replace(/\.[^.]+$/, '');
  console.log(`Importing ${path.basename(src)} as ${kind} -> data/${safe(name)}`);
  sayIfReplacing(name);
  const atlas = await withModes((m, out) => importers[kind](src, out, m), outFor(name));
  done(atlas, kind === 'retheme' || kind === 'pptx' ? 'layouts' : 'screens'); notes(atlas);
} else if (cmd === 'storybook') {
  const url = argv[1];
  if (!url || !/^https?:\/\//.test(url)) { console.error('Usage: atlas storybook <https url> [--pages N] [--name NAME] [--modes dark,theme=g100] [--delay MS] [--ignore-robots]   (a local storybook-static folder: atlas import <folder>)'); process.exit(1); }
  const name = o.name || new URL(url).hostname;
  console.log(`Measuring stories of ${url} -> data/${safe(name)}`);
  sayIfReplacing(name);
  const atlas = await withModes((m, out) => importers.storybook(url, out, m), outFor(name));
  done(atlas, 'stories'); notes(atlas);
} else if (cmd === 'compare') {
  const name = argv[1], against = o.against, previous = argv.includes('--previous');
  if (!hasAtlas(name) || (!previous && !hasAtlas(against))) { console.error('Usage: atlas compare <atlas> --against <reference atlas>   or   atlas compare <atlas> --previous   [--delta-e N]'); process.exit(1); }
  const { compareAtlases, formatReport, latestSnapshot } = await import('../src/compare.mjs');
  const read = n => readAtlasFile(path.join(atlasDirOf(n), 'atlas.json'));
  const reference = previous ? latestSnapshot(atlasDirOf(name)) : read(against);
  if (!reference) { console.error(`No earlier snapshot of ${name} yet: history is kept from the next re-extract on.`); process.exit(1); }
  const report = compareAtlases(read(name), reference, { deltaE: o['delta-e'] || 3 });
  const dir = path.join(atlasDirOf(name), 'reports'); mkdirSync(dir, { recursive: true });
  const file = writeJsonFile(path.join(dir, `compare-${previous ? 'previous' : safe(against)}.json`), report, 2);
  console.log(formatReport(report) + `\nFull report: ${path.relative(process.cwd(), file)}`);
} else if (cmd === 'export') {
  const name = argv[1], atlasDir = atlasDirOf(name);
  if (!hasAtlas(name)) { console.error(`Usage: atlas export <atlas name> [--format ${FORMATS}] [--out DIR]   (names: run atlas without arguments)`); process.exit(1); }
  const formats = o.format || ['pdf', 'json', 'css'];
  const { exportAtlas } = await import('../src/export.mjs');
  const files = await exportAtlas({ atlasDir, formats, ...(o.out ? { outDir: path.resolve(o.out) } : {}) });
  console.log('Exported:\n' + files.map(f => '  ' + path.relative(process.cwd(), f)).join('\n'));
} else if (cmd === 'serve') {
  const port = o.port ?? 4300;
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
  atlas export <atlas> [--format ${FORMATS}] [--out DIR]
                                                     token sheet PDF, W3C design tokens JSON, CSS variables, HTML page + CSS
  atlas serve [--port P]

Websites, Storybooks and HTML/SVG also take:
  --modes dark,mobile,...   extra passes: dark, light, mobile, tablet, desktop, wide, <W>x<H>, <storybook global>=<value>; join with +
  --delay MS                pause between requests to a site (default 1000, Storybook 500; a longer robots.txt Crawl-delay wins)
  --ignore-robots           skip robots.txt — only for sites you run yourself

Making an atlas under an existing name replaces that atlas (the previous atlas.json is kept in its history/).
Atlases store design tokens and text-free style samples only. Add --screenshots to an extract/storybook/import
command to also keep screenshots; text content is never stored.`);
  if (existsSync(dataDir)) { const sets = readdirSync(dataDir).filter(d => existsSync(path.join(dataDir, d, 'atlas.json'))); if (sets.length) console.log('\nExtracted atlases: ' + sets.join(', ')); }
}
