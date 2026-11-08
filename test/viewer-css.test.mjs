// Viewer CSS rules from the UI review (8 Nov 2026): a visible focus ring, readable muted text and
// field edges, dynamic viewport units, and hover styles only for devices that hover.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../viewer/css/atlas.css', import.meta.url), 'utf8');
const token = name => css.match(new RegExp(`${name}:\\s*(#[0-9a-f]{6})`, 'i'))?.[1];
const lum = hex => {
  const v = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(x => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };

test('no rule removes the focus outline, and one global ring exists', () => {
  assert.doesNotMatch(css, /outline:\s*(none|0)\b/);
  assert.match(css, /:focus-visible\s*\{\s*outline:\s*2px solid/);
});

test('muted text >= 4.5:1 and field edges >= 3:1 on both backgrounds', () => {
  for (const bg of ['--bg', '--panel']) {
    assert.ok(ratio(token('--ink-3'), token(bg)) >= 4.5, `--ink-3 on ${bg}`);
    assert.ok(ratio(token('--field'), token(bg)) >= 3, `--field on ${bg}`);
  }
});

test('no static viewport height units', () => {
  assert.doesNotMatch(css, /\d(vh)\b/);
});

test(':hover rules sit only inside @media (hover: hover)', () => {
  const block = css.match(/@media \(hover: hover\) \{([\s\S]*?)\n\}/)?.[1] ?? '';
  const outside = css.replace(block, '');
  assert.doesNotMatch(outside, /:hover/);
  assert.match(block, /:hover/);
});
