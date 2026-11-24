// Viewer CSS rules, named as in DESIGN.md "Named Rules" (and the Motion section). Comments are blanked out before
// matching, with their line breaks kept, so a rule quoted in a comment doesn't count and a failure names
// viewer/css/atlas.css:<line>.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const FILE = 'viewer/css/atlas.css';
const raw = readFileSync(new URL(`../${FILE}`, import.meta.url), 'utf8');
// every comment becomes spaces of the same length (line breaks kept), so offsets and line numbers still match
const css = raw.replace(/\/\*[\s\S]*?\*\//g, c => c.replace(/[^\n]/g, ' '));
const lineAt = index => css.slice(0, index).split('\n').length;
const where = index => `${FILE}:${lineAt(index)}`;
const all = re => [...css.matchAll(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'))];

// the body of each `@media <query> {…}` block, found by brace matching: [{ start, end }]
function mediaBlocks(query) {
  return all(new RegExp(`@media ${query.replace(/[()]/g, '\\$&')}\\s*\\{`)).map(m => {
    let depth = 1, i = m.index + m[0].length;
    for (; depth && i < css.length; i++) depth += css[i] === '{' ? 1 : css[i] === '}' ? -1 : 0;
    return { start: m.index, end: i };
  });
}
const inside = (blocks, index) => blocks.some(b => index > b.start && index < b.end);

const token = name => css.match(new RegExp(`${name}:\\s*(#[0-9a-f]{6})`, 'i'))?.[1];
const lum = hex => {
  const v = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(x => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };

test('One Focus Ring: no rule removes the focus outline, and one global ring exists', () => {
  const removed = all(/outline:\s*(none|0)\b/).map(m => where(m.index));
  assert.deepEqual(removed, [], `outline removed at ${removed.join(', ')}`);
  assert.match(css, /(^|\n):focus-visible\s*\{\s*outline:\s*2px solid/, `${FILE}: no global :focus-visible { outline: 2px solid … }`);
});

test('Contrast Floors: muted text >= 4.5:1 and field edges >= 3:1 on both backgrounds', () => {
  for (const bg of ['--bg', '--panel']) {
    assert.ok(ratio(token('--ink-3'), token(bg)) >= 4.5, `--ink-3 on ${bg}: ${ratio(token('--ink-3'), token(bg)).toFixed(2)}:1`);
    assert.ok(ratio(token('--field'), token(bg)) >= 3, `--field on ${bg}: ${ratio(token('--field'), token(bg)).toFixed(2)}:1`);
  }
});

test('Dynamic Viewport Heights: no static viewport height units', () => {
  const found = all(/\d(vh|svh|lvh)\b/).filter(m => m[1] === 'vh').map(m => where(m.index));
  assert.deepEqual(found, [], `static vh at ${found.join(', ')}`);
});

test('Hover Where It Exists: :hover rules sit only inside @media (hover: hover)', () => {
  const blocks = mediaBlocks('(hover: hover)'), hovers = all(/:hover/);
  assert.ok(hovers.length, 'no :hover rule at all');
  const outside = hovers.filter(m => !inside(blocks, m.index)).map(m => where(m.index));
  assert.deepEqual(outside, [], `:hover outside @media (hover: hover) at ${outside.join(', ')}`);
});

test('Motion: every transition or animation stops under prefers-reduced-motion', () => {
  const moving = all(/\b(transition|animation)\s*:/);
  if (!moving.length) return;
  const blocks = mediaBlocks('(prefers-reduced-motion: reduce)');
  assert.ok(blocks.some(b => /transition-duration:\s*0s/.test(css.slice(b.start, b.end)) && /animation:\s*none/.test(css.slice(b.start, b.end))),
    `motion at ${moving.map(m => where(m.index)).join(', ')} but no global prefers-reduced-motion rule`);
  const slow = all(/transition:[^;}]*?(\d+)ms/).filter(m => +m[1] > 300).map(m => where(m.index));
  assert.deepEqual(slow, [], `transitions over 300ms at ${slow.join(', ')}`);
});
