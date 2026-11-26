// The last input, recorded for the focus ring (viewer/js/modality.js; DESIGN.md One Focus Ring).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { navigates, initModality } from '../viewer/js/modality.js';

test('only navigation keys count as keyboard use; modifiers, shortcuts, Esc and browser chords do not', () => {
  for (const key of ['Tab', 'ArrowDown', 'Home', 'End', 'PageUp', 'F6']) assert.equal(navigates({ key }), true, key);
  for (const key of ['Shift', 'Control', 'Escape', 'Enter', ' ', 'a']) assert.equal(navigates({ key }), false, key);
  assert.equal(navigates({ key: 'ArrowLeft', altKey: true }), false, 'Alt + arrow is history');
  assert.equal(navigates({ key: 'Tab', ctrlKey: true }), false, "Ctrl + Tab is the browser's tabs");
  assert.equal(navigates({ key: 'Tab', metaKey: true }), false);
});

test('the root starts as pointer, turns keyboard on a navigation key and back to pointer on a press', () => {
  const attrs = {}, listeners = {};
  const doc = {
    documentElement: { getAttribute: (n) => attrs[n] ?? null, setAttribute: (n, v) => { attrs[n] = v; } },
    addEventListener: (type, fn) => { (listeners[type] ??= []).push(fn); },
  };
  const fire = (type, e = {}) => listeners[type].forEach((fn) => fn(e));
  initModality(doc);
  assert.equal(attrs['data-modality'], 'pointer', 'a focus set at load shows no ring');
  fire('keydown', { key: 'Shift' });
  assert.equal(attrs['data-modality'], 'pointer', 'Shift alone after a click');
  fire('keydown', { key: 'Tab' });
  assert.equal(attrs['data-modality'], 'keyboard');
  fire('pointerdown');
  assert.equal(attrs['data-modality'], 'pointer');
});

test('app.js starts the modality recorder', () => {
  const app = readFileSync(new URL('../viewer/js/app.js', import.meta.url), 'utf8');
  assert.match(app, /import \{ initModality \} from '\.\/modality\.js';/);
  assert.match(app, /^initModality\(\);$/m);
});
