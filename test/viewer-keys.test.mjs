// Keyboard rules of the dialogs, the narrow-screen drawer and the segmented controls (viewer/js/keys.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isDismiss, trapIndex, segmentIndex, fitsSegments, SEGMENT_MAX } from '../viewer/js/keys.js';
import { tipPosition } from '../viewer/js/tooltip.js';

test('a segmented control holds up to four options; five or more become a select (Base + four modes)', () => {
  assert.equal(SEGMENT_MAX, 4);
  assert.deepEqual([2, 3, 4, 5, 12].map(fitsSegments), [true, true, true, false, false]);
});

test('a tooltip sits above its control, flips below at the top edge and stays 4px inside the window', () => {
  const tip = { width: 200, height: 30 }, view = { width: 390 };
  assert.deepEqual(tipPosition({ top: 100, bottom: 134, left: 100, width: 80 }, tip, view), { top: 64, left: 40 }, 'above, centred');
  assert.deepEqual(tipPosition({ top: 12, bottom: 46, left: 100, width: 80 }, tip, view), { top: 52, left: 40 }, 'no room above (the top bar): below');
  assert.deepEqual(tipPosition({ top: 100, bottom: 134, left: 340, width: 44 }, tip, view), { top: 64, left: 186 }, 'clamped at the right edge');
  assert.deepEqual(tipPosition({ top: 100, bottom: 134, left: 0, width: 20 }, tip, view), { top: 64, left: 4 }, 'clamped at the left edge');
});

test('Tab wraps from the last control to the first, Shift+Tab from the first to the last', () => {
  assert.equal(trapIndex(3, 2, false), 0);
  assert.equal(trapIndex(3, 0, true), 2);
});

test('inside the trap the browser moves focus itself', () => {
  assert.equal(trapIndex(3, 0, false), -1);
  assert.equal(trapIndex(3, 1, true), -1);
});

test('focus outside the trap is pulled in; an empty trap does nothing', () => {
  assert.equal(trapIndex(3, -1, false), 0);
  assert.equal(trapIndex(3, -1, true), 2);
  assert.equal(trapIndex(0, -1, false), -1);
});

test('Escape (and the old "Esc") dismisses', () => {
  assert.ok(isDismiss('Escape') && isDismiss('Esc'));
  assert.ok(!isDismiss('Enter'));
});

test('segments: Right/Down and Left/Up move one segment and wrap at the ends', () => {
  assert.equal(segmentIndex('ArrowRight', 3, 0), 1);
  assert.equal(segmentIndex('ArrowDown', 3, 2), 0);
  assert.equal(segmentIndex('ArrowLeft', 3, 0), 2);
  assert.equal(segmentIndex('ArrowUp', 3, 2), 1);
});

test('segments: Home and End go to the first and last; other keys and an empty group do nothing', () => {
  assert.equal(segmentIndex('Home', 3, 2), 0);
  assert.equal(segmentIndex('End', 3, 0), 2);
  assert.equal(segmentIndex('Tab', 3, 1), -1);
  assert.equal(segmentIndex(' ', 3, 1), -1);
  assert.equal(segmentIndex('ArrowRight', 0, -1), -1);
  assert.equal(segmentIndex('ArrowRight', 3, -1), 1, 'focus outside the segments counts from the first');
});

test('every segmented control is built by segmented() as a radiogroup, never by hand', () => {
  const read = f => readFileSync(new URL(`../viewer/${f}`, import.meta.url), 'utf8');
  const helper = read('js/segmented.js');
  assert.match(helper, /segmentIndex\(/, 'segmented.js uses the key rules of keys.js');
  assert.match(helper, /'radiogroup'/);
  assert.match(helper, /role: 'radio'/);
  assert.match(helper, /aria-checked/);
  for (const f of ['js/app.js', 'js/new-item.js']) {
    assert.match(read(f), /segmented\(\{/, `${f} builds its segmented control with segmented()`);
    assert.doesNotMatch(read(f), /class: 'seg|aria-pressed/, `${f} builds no segmented group or toggle of its own`);
  }
  assert.match(read('index.html'), /id="colorFmt"[^>]*role="radiogroup"[^>]*><\/div>/, 'the HEX/RGB group starts empty; segmented() fills it');
});
