// A copy of the program in a temp folder, for tests that make an atlas: the CLI writes to data/ beside its own bin/,
// so running a copy keeps every write away from the real data/ (which holds the operator's captured atlases).
// Copied: bin, src, the viewer (src imports viewer/js; the server serves viewer/) and package.json; node_modules is
// linked, not copied. remove() deletes the copy and the link, never what the link points to.
import { mkdtempSync, cpSync, symlinkSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export function tempProgram() {
  const base = mkdtempSync(path.join(os.tmpdir(), 'atlas-program-'));
  for (const part of ['bin', 'src', 'viewer', 'package.json']) cpSync(path.join(root, part), path.join(base, part), { recursive: true });
  symlinkSync(path.join(root, 'node_modules'), path.join(base, 'node_modules'), 'junction');
  return { base, dataDir: path.join(base, 'data'), remove: () => rmSync(base, { recursive: true, force: true }) };
}
