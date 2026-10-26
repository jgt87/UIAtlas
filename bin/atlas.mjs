#!/usr/bin/env node
// UI Atlas CLI.
//   atlas extract <url> [--pages N] [--name NAME]   crawl a site into data/<name>/atlas.json + screenshots
//   atlas serve [--port P]                           serve the viewer + all extracted atlases
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readdirSync, existsSync } from 'node:fs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, 'data');
const argv = process.argv.slice(2);
const cmd = argv[0];
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };

if (cmd === 'extract') {
  const url = argv[1];
  if (!url || !/^https?:\/\//.test(url)) { console.error('Usage: atlas extract <https url> [--pages N] [--name NAME]'); process.exit(1); }
  const name = (opt('name') || new URL(url).hostname).replace(/[^a-z0-9.-]/gi, '_');
  const outDir = path.join(dataDir, name);
  const maxPages = Math.max(1, Number(opt('pages', '1')) || 1);
  const { extractSite } = await import('../src/web-extract.mjs');
  console.log(`Extracting ${url} -> data/${name}  (up to ${maxPages} page${maxPages > 1 ? 's' : ''})`);
  const atlas = await extractSite({ startUrl: url, maxPages, outDir });
  console.log(`Done: ${atlas.screens.length} screens, ${atlas.tokens.colors.length} colours, ${atlas.tokens.fonts.length} fonts. Run: atlas serve`);
} else if (cmd === 'serve') {
  const port = Number(opt('port', '4300')) || 4300;
  const { serve } = await import('../src/serve.mjs');
  serve({ root, dataDir, port });
} else {
  console.log('UI Atlas\n  atlas extract <url> [--pages N] [--name NAME]\n  atlas serve [--port P]');
  if (existsSync(dataDir)) { const sets = readdirSync(dataDir).filter(d => existsSync(path.join(dataDir, d, 'atlas.json'))); if (sets.length) console.log('\nExtracted atlases: ' + sets.join(', ')); }
}
