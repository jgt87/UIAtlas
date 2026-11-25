// Modes: the same source measured again under other conditions — dark colour scheme, other screen sizes, Storybook
// themes — so an atlas can hold e.g. light and dark tokens side by side. Each mode is a full extra pass into a temp
// folder; only its tokens and contrast pairs are kept, under atlas.modes[<mode>]. Screens stay the base pass's.
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readAtlasFile, withFormat, writeJsonFile } from './atlas-file.mjs';
import { parseMode } from '../viewer/js/mode-spec.js';

// The grammar ('dark+mobile', '1024x768', 'html:data-theme=dark', 'theme=g100') lives once in viewer/js/mode-spec.js,
// so the viewer's form checks a mode by the same rules the CLI runs it with.
export { parseMode };

// run(opts, outDir) -> atlas: the same adapter call as the base pass, with the mode's options merged in.
export async function addModes({ atlasDir, specs, run }) {
  const file = path.join(atlasDir, 'atlas.json'), atlas = readAtlasFile(file); // fields this code doesn't know are written back as read
  atlas.modes = {};
  for (const spec of specs) {
    const opts = parseMode(spec), tmp = mkdtempSync(path.join(os.tmpdir(), 'atlas-mode-'));
    try {
      console.log(`Mode ${spec}:`);
      const m = await run(opts, tmp);
      atlas.modes[spec] = { options: opts, tokens: m.tokens, contrast: m.contrast || [] };
    } finally { rmSync(tmp, { recursive: true, force: true }); }
  }
  const out = withFormat(atlas); // an older file (format 0) has the same shape: it is written back marked
  writeJsonFile(file, out); // same atlas, not a new extraction: no history snapshot; replaced atomically
  return out;
}
