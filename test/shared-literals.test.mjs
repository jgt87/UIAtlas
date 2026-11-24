// The literals the server, the CLI and the viewer share live once, in viewer/js/shared.js: the API header, the
// export format list and the upload types (as extensions and as the readable list). This fails when one of them is written out anywhere else in src/, bin/ or
// viewer/js/ (comments are stripped first, so prose may still name them) and reports file:line.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { API_HEADER, EXPORT_FORMAT_IDS, UPLOAD_EXTENSIONS, UPLOAD_KINDS_TEXT } from '../viewer/js/shared.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIRS = ['src', 'bin', 'viewer/js'];
const HOME = 'viewer/js/shared.js';

// Blank out // and /* */ comments, keeping strings (so 'https://...' survives) and line breaks (so line numbers hold).
// Escapes are skipped everywhere, which keeps a regex such as /^https?:\/\// from reading as a comment.
export function stripComments(src) {
  let out = '', quote = null;
  for (let i = 0; i < src.length; i++) {
    const c = src[i], next = src[i + 1];
    if (c === '\\') { out += c + (next ?? ''); i++; continue; }
    if (quote) { if (c === quote || (c === '\n' && quote !== '`')) quote = null; out += c; continue; }
    if (c === "'" || c === '"' || c === '`') { quote = c; out += c; continue; }
    if (c === '/' && next === '/') { while (i < src.length && src[i] !== '\n') i++; out += '\n'; continue; }
    if (c === '/' && next === '*') { const end = src.indexOf('*/', i + 2); const gap = src.slice(i, end < 0 ? src.length : end + 2); out += gap.replace(/[^\n]/g, ' '); i += gap.length - 1; continue; }
    out += c;
  }
  return out;
}

const READABLE_KINDS = ['PowerPoint', 'PDF', 'Sketch', 'JSON', 'HTML/SVG', '.zip'];
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// [what, does this (comment-free) line write it out?]
const CHECKS = [
  ['the API header', line => line.toLowerCase().includes(API_HEADER.toLowerCase())],
  // the list in order (pdf,json,css,html / 'pdf', 'json', ...), or one array literal holding every id
  ['the export format list', line => new RegExp(EXPORT_FORMAT_IDS.map(esc).join('\\W{1,4}')).test(line)
    || [...line.matchAll(/\[[^\]]*\]/g)].some(([arr]) => EXPORT_FORMAT_IDS.every(id => new RegExp(`['"\`]${esc(id)}['"\`]`).test(arr)))],
  // eight or more of the upload extensions on one line is a copy of the list (a regex, an accept string, an array);
  // a content-type map ('.png': 'image/png') is not: object keys and MIME subtypes don't count
  ['the upload type list', line => UPLOAD_EXTENSIONS.filter(e => new RegExp(`(?<![a-z/])${esc(e)}(?![a-z])(?!['"]?\\s*:)`).test(line)).length >= 8],
  // the same types as people name them (UPLOAD_KINDS_TEXT): four or more of its names on one line is a copy
  ['the readable upload type list', line => READABLE_KINDS.filter(k => line.includes(k)).length >= 4],
];

export function sharedLiteralFindings(file, text) {
  const lines = stripComments(text).split('\n'), out = [];
  lines.forEach((line, i) => { for (const [what, found] of CHECKS) if (found(line)) out.push(`${file}:${i + 1} writes out ${what}; import it from ${HOME}`); });
  return out;
}

const sources = () => DIRS.flatMap(d => readdirSync(path.join(root, d), { recursive: true, encoding: 'utf8' })
  .filter(f => /\.m?js$/.test(f)).map(f => path.posix.join(d, f.split(path.sep).join('/')))).filter(f => f !== HOME);

test('the shared literals are written out only in viewer/js/shared.js', () => {
  const files = sources();
  assert.ok(files.length > 10, 'the source folders were read');
  assert.deepEqual(files.flatMap(f => sharedLiteralFindings(f, readFileSync(path.join(root, f), 'utf8'))), []);
});

test('the check finds each kind of copy and ignores comments, imports and prose (the check itself works)', () => {
  assert.deepEqual(READABLE_KINDS.filter(k => !UPLOAD_KINDS_TEXT.includes(k)), [], 'the readable check looks for the names the shared text uses');
  const hits = text => sharedLiteralFindings('x.js', text).map(f => f.replace(/^x\.js:(\d+) writes out (.*?);.*/, '$1 $2'));
  assert.deepEqual(hits("const H = { 'X-UI-Atlas': '1' };"), ['1 the API header']);
  assert.deepEqual(hits("ok(f => ['pdf', 'json', 'css', 'html'].includes(f));"), ['1 the export format list']);
  assert.deepEqual(hits("const list = ['html', 'css', 'pdf', 'json'];"), ['1 the export format list'], 'any order inside one array');
  assert.deepEqual(hits("console.log('--format pdf,json,css,html');"), ['1 the export format list']);
  assert.deepEqual(hits("const T = /\\.(pptx|potx|pptm|ppsx|pdf|sketch|json|png|jpe?g)$/i;"), ['1 the upload type list']);
  assert.deepEqual(hits("const A = '.pptx,.potx,.pptm,.ppsx,.pdf,.sketch,.json,.png,.jpg';"), ['1 the upload type list']);
  assert.deepEqual(hits('// X-UI-Atlas and pdf, json, css, html in a comment\n/* .pptx .potx .pptm .ppsx .pdf .sketch .json .png .jpg */\nconst a = 1;'), []);
  assert.deepEqual(hits("import { API_HEADER } from './shared.js';\nconst re = /^https?:\\/\\//; const h = API_HEADER;"), []);
  assert.deepEqual(hits("const d = ['pdf', 'json', 'css'];\nconst note = 'PowerPoint or PDF';"), [], 'a subset is not the list');
  assert.deepEqual(hits("const note = 'PowerPoint, PDF, Sketch, token JSON, images';"), ['1 the readable upload type list']);
  assert.deepEqual(hits("h('small', {}, UPLOAD_KINDS_TEXT); fix(`Choose one of these: ${UPLOAD_KINDS_TEXT}.`);"), []);
  assert.deepEqual(hits("const u = 'https://example.test'; // X-UI-Atlas\nconst h = 'X-UI-Atlas';"), ['2 the API header'], 'line numbers survive');
});
