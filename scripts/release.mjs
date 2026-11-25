// Release a Node or web project in one step (docs/05 §6): the version bump, the CHANGELOG section,
// every gate, the release commit and annotated tag, the package with SHA256SUMS, the notes, the
// push and the GitHub release. A dry run unless --apply: it prints what it would do and checks
// what it can without changing anything.
//
//   node scripts/release.mjs [x.y.z | patch | minor | major] [--apply] [--dir dist]
//        [--title <app name>] [--carrier <file.json>]... [--gate "<command>"]... [--archive]
//        [--name <package name>] [--not-verified "<what was not checked live>"] [--no-ci-gate]
// With no version it is the patch: the operator's default, also when the CHANGELOG has an Added
// section; minor or major only when the operator asks (rules/core.md, docs/07 §2).
// package.json is the version source, and its typecheck, lint, test, build and smoke scripts are the
// gates; --carrier names another JSON file whose "version" must match (a manifest, server.json),
// bumped in the same release commit. A project with no package.json (a docs or rules repo) takes its
// version from the CHANGELOG's last release, its name from --name, and its gates from --gate.
//
// Why: a web app had no release script, so a release was rebuilt by hand from the last one's
// commit and assets, and it went out before CI had finished (a test audit, 24 Nov 2026). Before it
// changes anything it needs a clean tree that is pushed, and every CI run of HEAD finished and green
// (the same gate as the PowerShell starter's build-release.ps1). The package is the build folder
// (--dir, default dist/) or, with no build folder or with --archive (a source package, or a dist/ that
// holds earlier release zips), `git archive` of the tag. The zip is written
// here, with no tar or zip tool: Git Bash's tar reads "C:\..." as a remote host, and its sha256sum
// writes "*name" where SHA256SUMS uses two spaces (docs/15 L-WIN).
// Needs git, npm and a signed-in gh. Dependency-free; copy it in, do not link it.
import { Buffer } from 'node:buffer';
import { execFileSync, execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync } from 'node:zlib';

// ---------- pure parts (tested in templates/scripts/test/release.test.mjs) ----------

/** The next version from the current one and "x.y.z" or "patch" | "minor" | "major". */
export function nextVersion(current, arg) {
  if (/^\d+\.\d+\.\d+$/.test(arg)) return arg;
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(current || '');
  if (!m) throw new Error(`package.json version "${current}" is not x.y.z`);
  const [ma, mi, pa] = m.slice(1).map(Number);
  if (arg === 'major') return `${ma + 1}.0.0`;
  if (arg === 'minor') return `${ma}.${mi + 1}.0`;
  if (arg === 'patch') return `${ma}.${mi}.${pa + 1}`;
  throw new Error(`"${arg}" is not x.y.z, patch, minor or major`);
}

/** The last released version in a CHANGELOG (the first "## [x.y.z]" heading), for a project with no package.json. */
export function lastReleased(changelog) {
  const m = /^## \[v?(\d+\.\d+\.\d+)\]/m.exec(changelog);
  if (!m) throw new Error('no package.json and no released "## [x.y.z]" section in CHANGELOG.md: give the version as x.y.z');
  return m[1];
}

/** Moves the Unreleased entries under "## [version] - date"; { text, section }. Refuses an empty one. */
export function moveUnreleased(changelog, version, date) {
  const text = changelog.replace(/\r\n/g, '\n');
  const at = text.indexOf('## [Unreleased]');
  if (at < 0) throw new Error('CHANGELOG.md has no "## [Unreleased]" section');
  const bodyStart = text.indexOf('\n', at) + 1;
  const next = text.slice(bodyStart).search(/^## \[/m);
  const bodyEnd = next < 0 ? text.length : bodyStart + next;
  const section = text.slice(bodyStart, bodyEnd).trim();
  if (!/^- /m.test(section)) throw new Error('CHANGELOG.md: Unreleased has no entries to release');
  if (text.includes(`## [${version}]`)) throw new Error(`CHANGELOG.md already has ## [${version}]`);
  const out = `${text.slice(0, bodyStart)}\n## [${version}] - ${date}\n\n${section}\n\n${text.slice(bodyEnd)}`;
  return { text: out.replace(/\n{3,}/g, '\n\n'), section };
}

/** CHANGELOG lines wrapped at ~100 columns joined back into one line per entry (release pages do not reflow). */
export function unwrap(section) {
  const out = [];
  for (const l of section.split('\n')) {
    const continues = out.length && /^\s+\S/.test(l) && !/^\s*(- |\d+\. )/.test(l);
    if (continues) out[out.length - 1] = `${out[out.length - 1].trimEnd()} ${l.trim()}`;
    else out.push(l);
  }
  return out.join('\n');
}

/** The test count from a test run's output (Vitest, node --test, Jest, unittest, pytest), or null.
 *  unittest prints "Ran N tests" and then OK; pytest "N passed in". The first release notes counted
 *  only the Node tests of a run that also ran two Python suites. */
export function testCount(output) {
  const pats = [/Tests\s+(\d+) passed/, /ℹ pass (\d+)/, /# pass (\d+)/, /Tests:\s+(\d+) passed/, /Ran (\d+) tests? in [\d.]+s\s+OK/, /\b(\d+) passed(?:, [^\n]*)? in [\d.]+s/];
  const hits = pats.map((re) => [...output.matchAll(new RegExp(re, 'g'))].map((m) => Number(m[1]))); // injection: the patterns are this file's own constants
  const all = hits.flat();
  return all.length ? all.reduce((a, b) => a + b, 0) : null;
}

/** Release notes (docs/05 §6): the CHANGELOG section, the gates and their test count, what was not verified live, the asset. */
export function releaseNotes(section, { tests, gates, notVerified, asset, retried = [] }) {
  const ran = gates.length ? `Checked before release: ${gates.join(', ')}${tests ? ` (${tests} tests passed)` : ''}.` : 'No gates ran.';
  const again = retried.length ? [`Passed on a second run: ${retried.join('; ')}.`] : [];
  return [unwrap(section), '', ran, ...again, `Not verified live: ${notVerified}`, '',
    `\`${asset}\` is the release package; check it against \`SHA256SUMS\`.`, ''].join('\n');
}

/** One SHA256SUMS line: the hash, two spaces, the file name. */
export const sumsLine = (buf, name) => `${createHash('sha256').update(buf).digest('hex')}  ${name}\n`;

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The README's references to this project's own release moved to the new version: a release
 *  download URL, the package file name and name@version. Other version numbers are left alone. */
export function bumpReadme(text, name, old, version) {
  const o = esc(old); const n = esc(name);
  return text
    .replace(new RegExp(`(releases/download/v)${o}(?![\\d.])`, 'g'), (_, a) => a + version)
    .replace(new RegExp(`(\\b${n}-v)${o}(\\.zip)`, 'gi'), (_, a, b) => a + version + b)
    .replace(new RegExp(`(\\b${n}@)${o}(?![\\d.])`, 'g'), (_, a) => a + version);
}

/** A reminder when the release adds features and README.md has not changed since the last tag. */
function readmeNote(root, current, section) {
  if (!/^### Added/m.test(section) || !existsSync(join(root, 'README.md'))) return '';
  try {
    if (!run('git', ['tag', '-l', `v${current}`], { cwd: root })) return '';
    run('git', ['diff', '--quiet', `v${current}`, 'HEAD', '--', 'README.md'], { cwd: root });
  } catch { return ''; } // a diff (exit 1): the README was updated
  return `note: this release has Added entries and README.md is unchanged since v${current}: check that it describes them before --apply.`;
}

const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
export const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

/** A zip of [{ name, data }] with "/" separators, deflated, fixed timestamps (the same input gives the same bytes). */
export function zip(entries) {
  const local = []; const central = []; let offset = 0;
  for (const { name, data } of entries) {
    const n = Buffer.from(name.split(sep).join('/')); const z = deflateRawSync(data); const crc = crc32(data);
    const head = Buffer.alloc(30); head.writeUInt32LE(0x04034b50, 0); head.writeUInt16LE(20, 4); head.writeUInt16LE(0x0800, 6); head.writeUInt16LE(8, 8);
    head.writeUInt16LE(0, 10); head.writeUInt16LE(0x21, 12); head.writeUInt32LE(crc, 14); head.writeUInt32LE(z.length, 18); head.writeUInt32LE(data.length, 22); head.writeUInt16LE(n.length, 26);
    const dir = Buffer.alloc(46); dir.writeUInt32LE(0x02014b50, 0); dir.writeUInt16LE(20, 4); dir.writeUInt16LE(20, 6); dir.writeUInt16LE(0x0800, 8); dir.writeUInt16LE(8, 10);
    dir.writeUInt16LE(0, 12); dir.writeUInt16LE(0x21, 14); dir.writeUInt32LE(crc, 16); dir.writeUInt32LE(z.length, 20); dir.writeUInt32LE(data.length, 24); dir.writeUInt16LE(n.length, 28); dir.writeUInt32LE(offset, 42);
    local.push(head, n, z); central.push(dir, n); offset += 30 + n.length + z.length;
  }
  const cd = Buffer.concat(central); const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, cd, end]);
}

// ---------- the steps ----------

const run = (cmd, args, o = {}) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' && cmd === 'npm', ...o }).trim();
const GATES = ['typecheck', 'lint', 'test', 'build', 'smoke'];

// Flags: true sets the key; a key that holds a list collects each value; any other key takes one value.
const FLAGS = { '--apply': ['apply', true], '--no-ci-gate': ['ciGate', false], '--archive': ['archive', true] };
const VALUES = { '--dir': 'dir', '--not-verified': 'notVerified', '--carrier': 'carriers', '--title': 'title', '--gate': 'gates', '--name': 'name' };

function parseArgs(argv) {
  const o = { apply: false, dir: 'dist', notVerified: 'nothing beyond the gates above.', ciGate: true, bump: null, title: null, carriers: [], gates: [], name: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (FLAGS[a]) o[FLAGS[a][0]] = FLAGS[a][1];
    else if (VALUES[a]) { const k = VALUES[a]; const v = argv[++i]; if (Array.isArray(o[k])) o[k].push(v); else o[k] = v; }
    else if (!a.startsWith('--')) o.bump = a;
    else throw new Error(`unknown option ${a}`);
  }
  o.bump ??= 'patch';
  return o;
}

/** Clean, pushed, CI green for HEAD, tag free. Returns the problems (empty = ready). */
function preflight(root, version, o) {
  const p = [];
  if (run('git', ['status', '--porcelain'], { cwd: root })) p.push('the working tree is not clean');
  try { if (run('git', ['rev-list', '@{u}..HEAD'], { cwd: root })) p.push('HEAD is not pushed'); } catch { p.push('the branch has no upstream'); }
  if (run('git', ['tag', '-l', `v${version}`], { cwd: root })) p.push(`tag v${version} exists`);
  try { run('git', ['check-ignore', '-q', 'release/SHA256SUMS'], { cwd: root }); } catch { p.push('release/ is not in .gitignore (the package is written there)'); }
  if (o.ciGate && existsSync(join(root, '.github', 'workflows'))) p.push(...ciProblems(root));
  return p;
}

/** A commit CI skips on purpose: it changes Markdown only (the ci-triggers rule has CI skip those). */
export const docsOnly = (files) => files.length > 0 && files.every((f) => /\.md$/i.test(f));

/** The commit whose CI run speaks for HEAD: HEAD itself, or the newest commit before a run of
 *  Markdown-only commits. `commits` is newest first, each { sha, files }. Null when none is in reach. */
export function ciCommit(commits) {
  for (const c of commits) if (!docsOnly(c.files)) return c.sha;
  return null;
}

function ciProblems(root) {
  // A Markdown-only HEAD has no CI run (the workflow skips it, as the ci-triggers rule asks), so the
  // run of the newest commit that changed anything else speaks for it. Without this the release
  // refused such a HEAD, and a project dropped the skip to get its release out (a test audit, 24 Nov 2026).
  const log = run('git', ['log', '-20', '--format=%x00%H', '--name-only'], { cwd: root });
  const commits = log.split('\0').filter(Boolean).map((b) => { const [sha, ...files] = b.split('\n').map((l) => l.trim()).filter(Boolean); return { sha, files }; });
  const sha = ciCommit(commits) ?? commits[0]?.sha;
  const head = commits[0]?.sha;
  let runs;
  try { runs = JSON.parse(run('gh', ['run', 'list', '--commit', sha, '--json', 'status,conclusion,workflowName'], { cwd: root })); } catch { return ['gh run list failed: is gh signed in?']; }
  const which = sha === head ? 'HEAD' : `${sha.slice(0, 7)} (the commits after it change Markdown only)`;
  if (!runs.length) return [`no CI run for ${which}: push and let CI finish first`];
  return runs.filter((r) => r.status !== 'completed' || r.conclusion !== 'success').map((r) => `CI ${r.workflowName} on ${which}: ${r.status}/${r.conclusion || '-'}`);
}

const failText = (e) => `${String(e.stdout || '').slice(-2000)}${String(e.stderr || '').slice(-2000)}`;
export const firstProblem = (text) => (String(text).split('\n').find((l) => /Error|✖|not ok|FAIL/.test(l)) || 'it failed').trim().slice(0, 200);

/** One gate, run once more when it fails: a timing test on a loaded machine failed a release gate that
 *  passed alone (two releases, 24 Nov 2026). A second failure stops the release; a pass on the second
 *  run is recorded in `retried` and named in the notes, never hidden. */
function gate(label, fn, retried) {
  console.log(`gate: ${label}`);
  try { return fn(); } catch (first) {
    console.log(`gate: ${label} failed (${firstProblem(failText(first))}); running it once more`);
    try {
      const out = fn();
      retried.push(`${label} (first run: ${firstProblem(failText(first))})`);
      return out;
    } catch (e) { throw new Error(`${label} failed twice:\n${failText(e)}`, { cause: e }); }
  }
}

/** Runs the project's npm gates, then each --gate command; returns { gates, tests, retried }. Throws on a gate that fails twice. */
function gates(root, pkg, extra) {
  const scripts = pkg?.scripts || {};
  const ran = []; const counts = []; const retried = [];
  for (const g of GATES.filter((x) => scripts[x])) {
    const out = gate(`npm run ${g}`, () => run('npm', ['run', g], { cwd: root, maxBuffer: 64 << 20 }), retried);
    if (g === 'test') counts.push(testCount(out));
    ran.push(g);
  }
  for (const cmd of extra) {
    const out = gate(cmd, () => execSync(`${cmd} 2>&1`, { cwd: root, encoding: 'utf8', maxBuffer: 64 << 20 }), retried); // injection: the operator's own --gate command line, never input from elsewhere
    counts.push(testCount(out));
    ran.push(cmd);
  }
  const known = counts.filter((c) => c !== null);
  return { gates: ran, tests: known.length ? known.reduce((a, b) => a + b, 0) : null, retried };
}

/** The version and name: package.json when the project has one, else the CHANGELOG's last release and --name. */
function projectInfo(root, o, changelog) {
  const file = join(root, 'package.json');
  const pkg = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
  const current = pkg ? pkg.version : lastReleased(changelog);
  const name = String(o.name || pkg?.name || basename(root)).replace(/^@[^/]+\//, '').toLowerCase().replace(/[^a-z0-9.-]+/g, '-');
  return { pkg, current, name, title: o.title || pkg?.productName || o.name || name };
}

const filesUnder = (dir) => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? filesUnder(p) : [p]; });

/** The package: the build folder zipped (sorted, "/" entries), or git archive of the tag. */
function makePackage(root, out, name, version, dir, archive) {
  const file = join(out, `${name}-v${version}.zip`);
  const build = resolve(root, dir);
  if (!archive && existsSync(build)) {
    const entries = filesUnder(build).sort().map((p) => ({ name: relative(build, p), data: readFileSync(p) }));
    writeFileSync(file, zip(entries));
  } else run('git', ['archive', '--format=zip', '-o', file, `v${version}`], { cwd: root });
  writeFileSync(join(out, 'SHA256SUMS'), sumsLine(readFileSync(file), `${name}-v${version}.zip`));
  return file;
}

const releaseFiles = (root, carriers) => ['package.json', 'CHANGELOG.md', 'README.md', 'package-lock.json', ...carriers].filter((f) => existsSync(join(root, f)));

/** Writes the README with its own-release references moved to the new version, when it has any. */
function updateReadme(root, name, current, version) {
  const file = join(root, 'README.md');
  if (!existsSync(file)) return;
  const text = readFileSync(file, 'utf8');
  const next = bumpReadme(text, name, current, version);
  if (next !== text) { writeFileSync(file, next); console.log(`README.md: release references moved to v${version}`); }
}

/** Sets "version" in each extra carrier, keeping its indentation and final newline. */
export function bumpCarriers(root, carriers, version) {
  for (const f of carriers) {
    const text = readFileSync(join(root, f), 'utf8');
    const json = JSON.parse(text);
    if (!('version' in json)) throw new Error(`${f} has no "version" field`);
    json.version = version;
    writeFileSync(join(root, f), JSON.stringify(json, null, /^\{\n(\s+)/.exec(text)?.[1] || 2) + (text.endsWith('\n') ? '\n' : ''));
  }
}

function commitAndTag(root, version, msgFile, carriers) {
  writeFileSync(msgFile, `Release v${version}\n\nBump to ${version}, move the CHANGELOG's Unreleased entries under it and move the README's release references to it.\n`);
  const files = releaseFiles(root, carriers);
  run('git', ['add', ...files], { cwd: root });
  run('git', ['commit', '-q', '-F', msgFile], { cwd: root });
  run('git', ['tag', '-a', `v${version}`, '-m', `v${version}`], { cwd: root });
}

/** Push, publish, fetch the tag, and check the published package against its SHA256SUMS. */
function publish(root, version, out, zipFile, notesFile, title) {
  run('git', ['push'], { cwd: root });
  run('git', ['push', 'origin', `v${version}`], { cwd: root });
  run('gh', ['release', 'create', `v${version}`, zipFile, join(out, 'SHA256SUMS'), '--title', `${title} v${version}`, '--notes-file', notesFile], { cwd: root });
  run('git', ['fetch', '--tags'], { cwd: root });
  const check = join(tmpdir(), `release-check-${version}-${Date.now()}`);
  mkdirSync(check);
  try {
    run('gh', ['release', 'download', `v${version}`, '--dir', check], { cwd: root });
    const [line] = readFileSync(join(check, 'SHA256SUMS'), 'utf8').split('\n');
    const [hash, name] = line.split('  ');
    if (sumsLine(readFileSync(join(check, name)), name).split('  ')[0] !== hash) throw new Error('the published package does not match SHA256SUMS');
  } finally { rmSync(check, { recursive: true, force: true }); }
}

function main(argv, root = process.cwd()) {
  const o = parseArgs(argv);
  const changelog = readFileSync(join(root, 'CHANGELOG.md'), 'utf8');
  const { pkg, current, name, title } = projectInfo(root, o, changelog);
  const version = nextVersion(current, o.bump);
  const date = new Date().toLocaleDateString('sv-SE'); // local YYYY-MM-DD
  const { text, section } = moveUnreleased(changelog, version, date);
  const problems = preflight(root, version, o);
  console.log(`release v${current} -> v${version} (${o.apply ? 'apply' : 'dry run'})\n\n## [${version}] - ${date}\n${section}\n`);
  const note = readmeNote(root, current, section);
  if (note) console.log(note + '\n');
  if (problems.length) throw new Error(`not ready:\n- ${problems.join('\n- ')}`);
  if (!o.apply) return console.log('ready: run again with --apply to release');
  writeFileSync(join(root, 'CHANGELOG.md'), text);
  let g;
  try {
    updateReadme(root, name, current, version);
    if (pkg) run('npm', ['version', version, '--no-git-tag-version', '--allow-same-version'], { cwd: root });
    bumpCarriers(root, o.carriers, version);
    g = gates(root, pkg, o.gates);
  } catch (e) {
    // Nothing is committed yet: put the version files and CHANGELOG back as they were.
    run('git', ['checkout', '--', ...releaseFiles(root, o.carriers)], { cwd: root });
    throw e;
  }
  const out = join(root, 'release'); mkdirSync(out, { recursive: true });
  commitAndTag(root, version, join(out, 'commit-msg.txt'), o.carriers);
  const zipFile = makePackage(root, out, name, version, o.dir, o.archive);
  const notesFile = join(out, 'notes.md');
  writeFileSync(notesFile, releaseNotes(section, { ...g, notVerified: o.notVerified, asset: `${name}-v${version}.zip` }));
  publish(root, version, out, zipFile, notesFile, title);
  console.log(`released v${version}: ${relative(root, zipFile)} and SHA256SUMS, notes in ${relative(root, notesFile)}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(process.argv.slice(2)); } catch (e) { console.error(`release: ${e.message}`); process.exit(1); }
}
