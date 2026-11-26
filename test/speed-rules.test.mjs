// Speed tests without a clock limit, as a dependency-free node:test (docs/04 §3).
// Copy to tests/, adjust CONFIG, run with `node --test tests/speed-rules.test.mjs`.
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
import { join, relative, resolve } from 'node:path';

const CONFIG = {
  // SPEED_RULES_SRC lets the same file run against another folder (a trial before copying it in).
  // UI Atlas keeps every test in test/ (this folder).
  srcDir: process.env.SPEED_RULES_SRC || import.meta.dirname,
  testFile: /\.test\.(m?[jt]sx?)$/,
  // Files that may read the clock (the helper, this file).
  allow: [/speed-rules\.test\.mjs$/, /scaling\.[mc]?[jt]s$/],
  // A clock read that measures time: a timer (performance.now), Date.now() less a start (or a start
  // less Date.now()), or an assertion on an elapsed time. A timestamp built as data is no timing:
  // `new Date(Date.now() - 1000)`, `Date.now() - 5 * 60_000`, `Date.now() - ONE_DAY` (a fixture
  // read as a timing check in a test audit, 24 Nov 2026).
  clockRead: [
    /performance\.now\(/,
    /(?<!new Date\(\s*)Date\.now\(\)\s*-\s*(?![\d\s]|[A-Z][A-Z0-9_]*\b)[\w$(]|[\w$)\]]\s*-\s*Date\.now\(\)/,
    /\b\w*(?:elapsed|duration|took)\w*\)?\s*(?:[<>]=?\s*[\d\w]|\.toBeLess|\.toBeGreater)/i,
  ],
  // .worktrees holds other checkouts of this repo (gitignored): their tests are not this tree's.
  skipDirs: new Set(['node_modules', 'dist', 'build', '.git', 'coverage', '.worktrees']),
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

// AUDIT_FILES (set by an audit): a text file with one project-relative path a line, the tracked
// files minus vendored folders and minified files, under AUDIT_ROOT (default: the working folder).
// When set, only those files are read.
const pathKey = (p) => { const k = resolve(p).replace(/\\/g, '/'); return process.platform === 'win32' ? k.toLowerCase() : k; };
const AUDIT = process.env.AUDIT_FILES && new Set(readFileSync(process.env.AUDIT_FILES, 'utf8').split(/\r?\n/)
  .map((l) => l.trim()).filter(Boolean).map((l) => pathKey(join(process.env.AUDIT_ROOT || process.cwd(), l))));
const audited = (p) => !AUDIT || AUDIT.has(pathKey(p));

function testFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    if (CONFIG.skipDirs.has(name)) return [];
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return testFiles(p);
    return CONFIG.testFile.test(name) && audited(p) ? [p] : [];
  });
}

test('growth tells linear work from work that compares every item with every other', () => {
  let sink = 0;
  const items = (n) => Array.from({ length: n }, (_, i) => (i * 7919) % n);
  const linear = (xs) => () => { for (const x of xs) sink += x; };
  const allPairs = (xs) => () => { for (const a of xs) for (const b of xs) if (a === b) sink++; };
  // Best of 5 rounds: a loaded machine (other test files running beside this one, memory pressure)
  // inflated one timing of 2 rounds and read all-pairs work as fast, failing a release gate (24 Nov 2026).
  assert.ok(growth(linear(items(20000)), linear(items(200000)), 5) < 30, 'linear work read as slow');
  assert.ok(growth(allPairs(items(150)), allPairs(items(1500)), 5) > 30, 'all-pairs work read as fast');
  assert.ok(sink > 0);
});

/** Comments blanked, line breaks kept: a comment that names the clock is not a read, and a match keeps
 *  its line number so a failure names file:line (docs/10 §6). A `//` after a colon is a URL, not a comment. */
export const blankComments = (text) => text.replace(/\/\*[\s\S]*?\*\/|(^|[^:])\/\/[^\n]*/g,
  (m, pre = '') => pre + m.slice(pre.length).replace(/[^\n]/g, ' '));

// Under fake timers an "elapsed" value is state the test advanced by hand, not a clock reading:
// `expect(introElapsed).toBeGreaterThan(0)` in such a file was a finding (a test audit, 25 Nov
// 2026). The timer and Date.now() patterns still apply there.
const FAKE_TIMERS = /\b(?:vi|jest)\.useFakeTimers\(|\bmock\.timers\.enable\(|\bsinon\.useFakeTimers\(/;

/** Each clock read in a file as "<file>:<line>". */
export function clockReads(text, file) {
  const code = blankComments(text);
  const rules = FAKE_TIMERS.test(code) ? CONFIG.clockRead.slice(0, 2) : CONFIG.clockRead;
  return code.split('\n').flatMap((l, i) => (rules.some((re) => re.test(l)) ? [`${file}:${i + 1}`] : []));
}

test('the clock check reads code, not comments, and names the line', () => {
  const text = '// performance.now() would be wrong here\nconst a = 1;\nconst t = Date.now() - start;\n/* Date.now() - x */';
  assert.deepEqual(clockReads(text, 'x.test.mjs'), ['x.test.mjs:3']);
});

test('the clock check flags timing, not a timestamp built as data (the check itself works)', () => {
  const timing = ['const t0 = performance.now();', 'const ms = Date.now() - start;', 'const left = deadline - Date.now();',
    'assert.ok(elapsed < 100);', 'expect(duration).toBeLessThan(50);'];
  for (const l of timing) assert.deepEqual(clockReads(l, 't'), ['t:1'], l);
  const data = ['const row = { at: new Date(Date.now() - 1000) };', 'const old = Date.now() - 5 * 60_000;',
    'const day = Date.now() - ONE_DAY;', 'const at = new Date(Date.now() - offset).toISOString();', "const job = { duration: 300, name: 'x' };"];
  for (const l of data) assert.deepEqual(clockReads(l, 't'), [], l);
  const faked = 'vi.useFakeTimers();\nact(() => vi.advanceTimersByTime(500));\nexpect(result.current.introElapsed).toBeGreaterThan(0);';
  assert.deepEqual(clockReads(faked, 't'), [], 'an elapsed value under fake timers is state');
  assert.deepEqual(clockReads(`${faked}\nconst t0 = performance.now();`, 't'), ['t:4'], 'a timer under fake timers still counts');
});

test('no test file reads the clock itself (compare growth instead)', () => {
  const files = testFiles(CONFIG.srcDir).filter((p) => !CONFIG.allow.some((a) => a.test(p)));
  assert.ok(files.length > 0, `no test files found under ${CONFIG.srcDir}: an empty run is not a pass`);
  const found = files.flatMap((p) => clockReads(readFileSync(p, 'utf8'), relative(CONFIG.srcDir, p)));
  assert.deepEqual(found, [], 'these test lines read the clock: bound growth() instead of milliseconds');
});
