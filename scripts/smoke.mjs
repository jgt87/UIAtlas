// End-to-end smoke check without a browser or network: a generated design-token file is detected, imported into a
// temp atlas, and exported as JSON, CSS and HTML; the exports must carry the tokens and never the source's name.
// Writes only to the OS temp dir (never data/).
//
//   npm run smoke
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { detectKind } from '../src/detect.mjs';
import { importTokens } from '../src/tokens-import.mjs';
import { exportAtlas } from '../src/export.mjs';

const dir = mkdtempSync(path.join(os.tmpdir(), 'atlas-smoke-'));
const fail = msg => { console.error(`[smoke] FAIL: ${msg}`); process.exitCode = 1; };
try {
  // invented tokens; the file name doubles as the "source name" that exports must leave out
  const source = path.join(dir, 'smoke-fictive.tokens.json');
  writeFileSync(source, JSON.stringify({
    color: { $type: 'color', brand: { $value: '#2b5f8c' }, link: { $value: '{color.brand}' }, ink: { $value: '#14161a' } },
    space: { $type: 'dimension', sm: { $value: '8px' }, md: { $value: '16px' } },
  }));
  if (detectKind(source) !== 'tokens') fail(`detected as ${detectKind(source)}, expected tokens`);

  const atlasDir = path.join(dir, 'atlas');
  const atlas = await importTokens({ source, outDir: atlasDir });
  const colors = atlas.tokens.colors.map(c => c.value);
  if (!colors.includes('#2b5f8c') || !colors.includes('#14161a')) fail(`colours not imported: ${colors.join(', ')}`);
  if (!atlas.tokens.spacing.some(s => s.value === '16px')) fail('spacing not imported');

  const files = await exportAtlas({ atlasDir, outDir: path.join(dir, 'out'), formats: ['json', 'css', 'html'] });
  const ext = files.map(f => path.extname(f)).sort().join(' ');
  if (ext !== '.css .html .json') fail(`exported ${ext || 'nothing'}, expected .css .html .json`);
  for (const f of files) {
    const text = readFileSync(f, 'utf8');
    if (!text.includes('2b5f8c')) fail(`${path.basename(f)} lacks the brand colour`);
    // the raw source and project names, as test/export.test.mjs checks; the HTML's <link> to its CSS file does carry
    // the slugged project name (smoke-fictive-tokens-tokens.css), see tasks/todo.md
    for (const s of [path.basename(source), atlas.project.name]) if (text.includes(s)) fail(`${path.basename(f)} names the source (${s})`);
  }
  JSON.parse(readFileSync(files.find(f => f.endsWith('.json')), 'utf8'));
  if (!process.exitCode) console.log(`[smoke] ok: tokens detected, imported (${colors.length} colours) and exported (${ext})`);
} catch (err) {
  fail(err.stack || err.message);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
