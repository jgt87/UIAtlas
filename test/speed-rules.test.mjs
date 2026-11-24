// Speed tests without a clock limit, as a dependency-free node:test (docs/04 §3).
// Copied from CommonShared templates/tests; run alone with `node --test test/speed-rules.test.mjs`.
//
// Two parts:
// 1. growth(small, big): how many times longer `big` takes than `small`, both timed on the same
//    machine in the same run (best of a few rounds, each call repeated for at least minMs). Use it
//    in your own speed tests: for an input ten times larger, linear work gives about 10, n log n
//    about 13, work that compares every item with every other about 100. Bound the ratio (e.g.
//    < 30), never the milliseconds. Export it from a helper module in your project if your tests
//    are not plain .mjs (the function has no dependencies).
// 2. A rule: no test file reads the clock itself (performance.now(), Date.now() - ...), so a
//    millisecond limit cannot come back. The helper module is not a test file and may.
//
// Why: a CI runner was nine times slower than the developer's PC on one run and not on the next;
// three tests with millisecond limits failed on a release's tag run while the branch run of the
// same commit passed (a PowerShell tool with a web UI, 15 Nov 2026). Heavy tests that only ran
// past the runner's default time-out need a larger time-out for the test, not a speed limit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const CONFIG = {
  // SPEED_RULES_SRC lets the same file run against another folder (a trial before copying it in).
  // UI Atlas keeps every test in test/ (this folder).
  srcDir: process.env.SPEED_RULES_SRC || import.meta.dirname,
  testFile: /\.test\.(m?[jt]sx?)$/,
  // Files that may read the clock (the helper, this file).
  allow: [/speed-rules\.test\.mjs$/, /scaling\.[mc]?[jt]s$/],
  clockRead: /performance\.now\(|Date\.now\(\)\s*-/,
  skipDirs: new Set(['node_modules', 'dist', 'build', '.git', 'coverage']),
};

/** Mean time of one call, repeating the call until at least `minMs` has passed. */
function perCall(fn, minMs) {
  let n = 0;
  const t0 = performance.now();
  do {
    fn();
    n++;
  } while (performance.now() - t0 < minMs);
  return (performance.now() - t0) / n;
}

/** How many times longer `big` takes than `small`: best of `rounds`, after one warm-up call. */
export function growth(small, big, rounds = 3, minMs = 30) {
  small();
  big();
  let s = Infinity;
  let b = Infinity;
  for (let i = 0; i < rounds; i++) {
    s = Math.min(s, perCall(small, minMs));
    b = Math.min(b, perCall(big, minMs));
  }
  return b / s;
}

function testFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    if (CONFIG.skipDirs.has(name)) return [];
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return testFiles(p);
    return CONFIG.testFile.test(name) ? [p] : [];
  });
}

test('growth tells linear work from work that compares every item with every other', () => {
  let sink = 0;
  const items = (n) => Array.from({ length: n }, (_, i) => (i * 7919) % n);
  const linear = (xs) => () => { for (const x of xs) sink += x; };
  const allPairs = (xs) => () => { for (const a of xs) for (const b of xs) if (a === b) sink++; };
  assert.ok(growth(linear(items(20000)), linear(items(200000))) < 30, 'linear work read as slow');
  assert.ok(growth(allPairs(items(150)), allPairs(items(1500)), 2) > 30, 'all-pairs work read as fast');
  assert.ok(sink > 0);
});

/** Comments blanked, line breaks kept: a comment that names the clock is not a read, and a match keeps
 *  its line number so a failure names file:line (docs/10 §6). A `//` after a colon is a URL, not a comment. */
export const blankComments = (text) => text.replace(/\/\*[\s\S]*?\*\/|(^|[^:])\/\/[^\n]*/g,
  (m, pre = '') => pre + m.slice(pre.length).replace(/[^\n]/g, ' '));

/** Each clock read in a file as "<file>:<line>". */
export function clockReads(text, file) {
  return blankComments(text).split('\n').flatMap((l, i) => (CONFIG.clockRead.test(l) ? [`${file}:${i + 1}`] : []));
}

test('the clock check reads code, not comments, and names the line', () => {
  const text = '// performance.now() would be wrong here\nconst a = 1;\nconst t = Date.now() - start;\n/* Date.now() - x */';
  assert.deepEqual(clockReads(text, 'x.test.mjs'), ['x.test.mjs:3']);
});

test('no test file reads the clock itself (compare growth instead)', () => {
  const files = testFiles(CONFIG.srcDir).filter((p) => !CONFIG.allow.some((a) => a.test(p)));
  assert.ok(files.length > 0, `no test files found under ${CONFIG.srcDir}: an empty run is not a pass`);
  const found = files.flatMap((p) => clockReads(readFileSync(p, 'utf8'), relative(CONFIG.srcDir, p)));
  assert.deepEqual(found, [], 'these test lines read the clock: bound growth() instead of milliseconds');
});
