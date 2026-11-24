// What the viewer computes before it draws (viewer/js/view-model.js) and when its loading spinner shows
// (viewer/js/loading-timing.js). Invented data only; the clock is passed in, never read.
import test from 'node:test';
import assert from 'node:assert/strict';
import { colorTally, spacingBars, roleCounts, isLight, formatProblem } from '../viewer/js/view-model.js';
import { holdResult, SHOW_AFTER, MIN_SHOWN } from '../viewer/js/loading-timing.js';
import { ATLAS_FORMAT } from '../viewer/js/shared.js';

test('colorTally: text, background and border colours of a screen, most used first, capped', () => {
  const els = [{ color: '#111111', bg: '#ffffff' }, { color: '#111111', border: '#cccccc' }, { color: '#111111', bg: null }];
  assert.deepEqual(colorTally(els), [['#111111', 3], ['#ffffff', 1], ['#cccccc', 1]]);
  assert.deepEqual(colorTally(els, 1), [['#111111', 3]]);
  assert.deepEqual(colorTally([]), []);
});

test('spacingBars: smallest first, widths proportional to the largest, never under 6px', () => {
  const bars = spacingBars([{ value: '24px', count: 1 }, { value: '2px', count: 5 }, { value: '12px', count: 2 }]);
  assert.deepEqual(bars.map(b => [b.value, b.count, Math.round(b.width)]), [['2px', 5, 20], ['12px', 2, 120], ['24px', 1, 240]]);
  assert.equal(spacingBars([{ value: '0px', count: 1 }])[0].width, 6, 'a zero step stays visible');
  const input = [{ value: '8px', count: 1 }, { value: '4px', count: 1 }];
  spacingBars(input);
  assert.equal(input[0].value, '8px', 'the token list itself is not reordered');
});

test('roleCounts: element rows per role, most common first', () => {
  assert.deepEqual(roleCounts([{ role: 'link' }, { role: 'button' }, { role: 'link' }]), [['link', 2], ['button', 1]]);
  assert.deepEqual(roleCounts([]), []);
});

test('isLight: light six-digit colours need the dark stage; dark, short or missing ones do not', () => {
  assert.equal(isLight('#ffffff'), true);
  assert.equal(isLight('#f0f0f0cc'), true, 'alpha is ignored');
  assert.equal(isLight('#1f2a44'), false);
  assert.equal(isLight('#fff'), false, 'only #rrggbb is judged');
  assert.equal(isLight(undefined), false);
});

test('formatProblem: format 0 (no marker) and the current one load; a newer one is refused with what to do', () => {
  assert.equal(formatProblem({ project: {} }, 'example'), null);
  assert.equal(formatProblem({ format: 0 }, 'example'), null);
  assert.equal(formatProblem({ format: ATLAS_FORMAT }, 'example'), null);
  const newer = formatProblem({ format: ATLAS_FORMAT + 1 }, 'example');
  assert.match(newer.what, /^This atlas was made by a newer UI Atlas \(format 2\)/);
  assert.match(newer.fix, /Update UI Atlas/);
  assert.match(formatProblem({ format: 'one' }, 'example').what, /example has an unreadable format marker/);
  assert.ok(formatProblem({ format: -1 }, 'example'));
});

test('holdResult: no spinner for a fast load; once shown it stays its minimum time', () => {
  const t0 = 10_000;
  assert.equal(holdResult(t0, t0 + 50), 0, 'arrived before the spinner would show');
  assert.equal(holdResult(t0, t0 + SHOW_AFTER - 1), 0);
  assert.equal(holdResult(t0, t0 + SHOW_AFTER), MIN_SHOWN, 'shown just now: held its full minimum');
  assert.equal(holdResult(t0, t0 + SHOW_AFTER + 150), MIN_SHOWN - 150);
  assert.equal(holdResult(t0, t0 + SHOW_AFTER + MIN_SHOWN + 1), 0, 'shown long enough already');
  assert.equal(holdResult(0, 120, { showAfter: 100, minShown: 50 }), 30, 'the timings can be passed in');
});
