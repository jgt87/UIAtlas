// Commit-message check: refuses agent co-author and session trailers, and "Generated with <agent>" lines.
// Run by the commit-msg hook in .githooks/ (enable once per clone: npm run hooks).
// The pattern matches the CommonShared audit (check_project.py TRAILER_RE, lesson L-GIT); keep the two in step.
// Only new commits are checked; existing history is left as it is (operator, 2026-11-10).
//
//   node scripts/check-commit-msg.mjs <commit-message-file>
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const AGENTS = '(claude|anthropic|copilot|codex)';
const PATTERNS = [
  new RegExp(`^co-authored-by:.*${AGENTS}`, 'i'),
  /^claude-session:/i,
  new RegExp(`^\\W*generated (with|by)\\b.*${AGENTS}`, 'i'),
];

// Lines of the message that carry an agent trailer. Comment lines (#) are not part of the message and are skipped.
export function agentTrailers(message) {
  return String(message).split(/\r?\n/).filter(l => !l.startsWith('#') && PATTERNS.some(p => p.test(l.trim())));
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const file = process.argv[2];
  if (!file) { console.error('usage: node scripts/check-commit-msg.mjs <commit-message-file>'); process.exit(2); }
  const found = agentTrailers(readFileSync(file, 'utf8'));
  if (found.length) {
    console.error('[commit-msg] agent trailers are not allowed in this repository:');
    for (const l of found) console.error(`  ${l.trim()}`);
    console.error('[commit-msg] remove these lines and commit again.');
    process.exit(1);
  }
}
