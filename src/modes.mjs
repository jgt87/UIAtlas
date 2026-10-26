// Modes: the same source measured again under other conditions — dark colour scheme, other screen sizes, Storybook
// themes — so an atlas can hold e.g. light and dark tokens side by side. Each mode is a full extra pass into a temp
// folder; only its tokens and contrast pairs are kept, under atlas.modes[<mode>]. Screens stay the base pass's.
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SIZES = { mobile: { width: 390, height: 844 }, tablet: { width: 834, height: 1112 }, desktop: { width: 1280, height: 900 }, wide: { width: 1920, height: 1080 } };

// 'dark', 'light', 'mobile', 'tablet', 'wide', '1024x768', 'theme=g100' (a Storybook global), 'html:data-theme=dark'
// (an attribute set on <html>, how many sites and Storybooks switch theme), combined with '+': 'dark+mobile'. Returns the options to pass to the adapter, or throws on an unknown part.
export function parseMode(spec) {
  const opts = {};
  for (const part of String(spec).split('+').map(p => p.trim()).filter(Boolean)) {
    let m;
    if (part === 'dark' || part === 'light') opts.colorScheme = part;
    else if (SIZES[part]) opts.viewport = SIZES[part];
    else if ((m = /^(\d{3,4})x(\d{3,4})$/.exec(part))) opts.viewport = { width: +m[1], height: +m[2] };
    else if ((m = /^html:([\w-]+)=([\w.-]*)$/.exec(part))) (opts.htmlAttrs ||= {})[m[1]] = m[2];
    else if ((m = /^([\w-]+)=([\w.-]+)$/.exec(part))) (opts.globals ||= {})[m[1]] = m[2];
    else throw new Error(`Unknown mode "${part}" (use dark, light, mobile, tablet, desktop, wide, <W>x<H>, <global>=<value> or html:<attribute>=<value>, joined with +)`);
  }
  return opts;
}

// run(opts, outDir) -> atlas: the same adapter call as the base pass, with the mode's options merged in.
export async function addModes({ atlasDir, specs, run }) {
  const file = path.join(atlasDir, 'atlas.json'), atlas = JSON.parse(readFileSync(file, 'utf8'));
  atlas.modes = {};
  for (const spec of specs) {
    const opts = parseMode(spec), tmp = mkdtempSync(path.join(os.tmpdir(), 'atlas-mode-'));
    try {
      console.log(`Mode ${spec}:`);
      const m = await run(opts, tmp);
      atlas.modes[spec] = { options: opts, tokens: m.tokens, contrast: m.contrast || [] };
    } finally { rmSync(tmp, { recursive: true, force: true }); }
  }
  writeFileSync(file, JSON.stringify(atlas, null, 0)); // same atlas, not a new extraction: no history snapshot
  return atlas;
}
