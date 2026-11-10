// Code-size ratchet: functions under 80 lines and cyclomatic complexity 10 or
// less. Older code may break the rule, so a source file may not gain
// violations over the committed baseline, and a file not in the baseline may
// have none. Tests are exempt (a describe block is long by nature).
// Origin: a canvas app's scripts/check-code-size.mjs (Sept 2026 health batches).
//
//   node scripts/check-code-size.mjs            check (chain it into `npm run lint`)
//   node scripts/check-code-size.mjs --update   write or lower the baseline after
//                                               a split; it never rises by hand
//
// First run in a project: `--update` writes the baseline from the current tree.
// A file that must grow past the limit is split instead; raising its number in
// the baseline is the operator's decision. Needs `eslint` (flat config) installed.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';

// Adjust per project. UI Atlas: the CLI, the adapters, the scripts and the viewer's browser modules.
const GLOBS = ['bin/**/*.mjs', 'src/**/*.mjs', 'scripts/**/*.mjs', 'viewer/js/**/*.js'];
const IS_TEST = /\.(test|spec)\.[cm]?[jt]sx?$/;
const MAX_LINES = 80;
const MAX_COMPLEXITY = 10;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baselinePath = path.join(root, 'scripts', 'code-size-baseline.json');
const RULES = {
  'max-lines-per-function': ['warn', { max: MAX_LINES, skipBlankLines: true, skipComments: true }],
  complexity: ['warn', MAX_COMPLEXITY],
};

const eslint = new ESLint({
  cwd: root,
  overrideConfigFile: true, // UI Atlas has no ESLint config of its own; only these two rules run
  overrideConfig: { rules: RULES },
  ruleFilter: ({ ruleId }) => ruleId in RULES,
  errorOnUnmatchedPattern: false,
});
const results = await eslint.lintFiles(GLOBS);

/** Violations per file and rule, source files only. */
const counts = {};
for (const result of results) {
  const file = path.relative(root, result.filePath).split(path.sep).join('/');
  if (IS_TEST.test(file)) continue;
  for (const message of result.messages) {
    if (!(message.ruleId in RULES)) continue;
    counts[file] ??= {};
    counts[file][message.ruleId] = (counts[file][message.ruleId] ?? 0) + 1;
  }
}
const sorted = Object.fromEntries(Object.keys(counts).sort().map((file) => [file, counts[file]]));
const baseline = fs.existsSync(baselinePath) ? JSON.parse(fs.readFileSync(baselinePath, 'utf8')) : null;

if (process.argv.includes('--update')) {
  // Only ever lowers: a count above the old baseline keeps the old number.
  const next = {};
  for (const [file, rules] of Object.entries(sorted)) {
    for (const [rule, count] of Object.entries(rules)) {
      const old = baseline ? baseline[file]?.[rule] ?? 0 : count;
      if (count <= old) (next[file] ??= {})[rule] = count;
      else if (old > 0) (next[file] ??= {})[rule] = old;
    }
  }
  fs.writeFileSync(baselinePath, `${JSON.stringify(next, null, 2)}\n`);
  console.log(`code size baseline written: ${Object.keys(next).length} files`);
  process.exit(0);
}

if (!baseline) {
  console.error('code size: no baseline yet. Run with --update once to write it.');
  process.exit(1);
}
const failures = [];
for (const [file, rules] of Object.entries(sorted)) {
  for (const [rule, count] of Object.entries(rules)) {
    const allowed = baseline[file]?.[rule] ?? 0;
    if (count > allowed) failures.push(`${file}: ${rule} ${count} (allowed ${allowed})`);
  }
}
if (failures.length) {
  console.error(`code size: a function grew past ${MAX_LINES} lines or complexity ${MAX_COMPLEXITY}; split it.`);
  failures.forEach((line) => console.error(`  ${line}`));
  process.exitCode = 1;
} else {
  const total = Object.values(sorted).reduce((sum, r) => sum + Object.values(r).reduce((a, b) => a + b, 0), 0);
  console.log(`code size: no file grew (${total} older violations in the baseline)`);
}
