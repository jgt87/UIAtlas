// atlas.json on disk: the format marker, the one way kept JSON is written (a temp file in the same folder, then a
// rename, so a reader never sees half a file and a crash never leaves one), the atlas folder name for a given name,
// and the path check every file server uses. No dependencies beyond node:* and the shared literals, so the CLI, the
// server and the jobs can all import it.
import { readFileSync, writeFileSync, renameSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ATLAS_FORMAT } from '../viewer/js/shared.js';

// The atlas.json shape version lives in the shared literals: the viewer refuses a newer one too.
export { ATLAS_FORMAT };

// The marker first, then everything else as it was: unknown fields survive a read-modify-write.
export const withFormat = ({ format, ...rest }) => ({ format: ATLAS_FORMAT, ...rest });
export const formatOf = atlas => atlas?.format ?? 0;

// Windows refuses a rename onto a file another process has open for a moment (the server reading it): retry briefly.
const BUSY = new Set(['EPERM', 'EACCES', 'EBUSY']);
const pause = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
function renameOver(from, to, tries = 10) {
  for (let i = 1; ; i++) {
    try { return renameSync(from, to); } catch (e) { if (!BUSY.has(e.code) || i >= tries) throw e; pause(25 * i); }
  }
}

// The temp file as read back must be the text meant and parse, or the rename would put a bad file in place
// (a full disk or a filter driver can cut a write short without an error).
// The text check serves the CSS and HTML exports, the JSON check every kept JSON file.
export function checkWrittenText(meant, back, file) {
  if (back !== meant) throw new Error(`${path.basename(file)}: the file read back differs from what was written; the old file is kept.`);
}
export function checkWritten(meant, back, file) {
  checkWrittenText(meant, back, file);
  JSON.parse(back);
}

// Atomic replace of a text file: written next to it under a temp name, read back and checked, then renamed over it.
export function writeTextFile(file, text, check = checkWrittenText) {
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`);
  try {
    writeFileSync(tmp, text);
    check(text, readFileSync(tmp, 'utf8'), file);
    renameOver(tmp, file);
  } catch (e) { rmSync(tmp, { force: true }); throw e; }
  return file;
}

// Atomic replace of a JSON file: writeTextFile, and what was written must parse too.
export const writeJsonFile = (file, value, space = 0) => writeTextFile(file, JSON.stringify(value, null, space), checkWritten);

// Reads an atlas.json of this or an older format; a newer one is refused rather than misread.
export function readAtlasFile(file) {
  const atlas = JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, '')), format = formatOf(atlas); // a BOM (a hand-edited file) would break JSON.parse
  if (!Number.isInteger(format) || format < 0) throw new Error(`${path.basename(path.dirname(file))}: atlas.json has an unreadable format marker (${JSON.stringify(format)}).`);
  if (format > ATLAS_FORMAT) throw new Error(`${path.basename(path.dirname(file))} was written by a newer UI Atlas (format ${format}); update UI Atlas to read it.`);
  return atlas;
}

// The folder under data/ an atlas name lands in: the one rule for the CLI and the server's jobs (outer spaces are
// dropped, anything but letters, digits, dots and dashes becomes _).
export function atlasFolderName(name) {
  const folder = String(name ?? '').trim().replace(/[^a-z0-9.-]/gi, '_');
  if (/^\.*$/.test(folder)) throw new Error(`"${name}" can't be an atlas name: use letters, digits, dots or dashes, e.g. example-site.`);
  return folder;
}
export const atlasExists = (dataDir, name) => existsSync(path.join(dataDir, atlasFolderName(name), 'atlas.json'));

// True when `file` is `base` itself or lies inside it. A string prefix test would let a sibling such as data-old
// through; path.relative does not.
export function isInside(base, file) {
  const rel = path.relative(path.resolve(base), path.resolve(file));
  return rel === '' || (!path.isAbsolute(rel) && rel !== '..' && !rel.startsWith('..' + path.sep));
}
