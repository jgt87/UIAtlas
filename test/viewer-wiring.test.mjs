// The renderers use the pure view-model (viewer/js/view-model.js) instead of computing inline: the screen details
// dialog is rendered into a tiny fake DOM and must show colorTally's order, and the other renderers must import and
// call the view-model functions and no longer hold their own copy. Invented data only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { colorTally } from '../viewer/js/view-model.js';

// Just enough of the DOM for h(), modal() and openScreen(): elements with attributes, children and listeners.
class El {
  constructor(tag) { this.nodeType = 1; this.tagName = tag.toUpperCase(); this.attrs = {}; this.children = []; this.className = ''; this.open = false; this.text = ''; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return this.attrs[k] ?? null; }
  removeAttribute(k) { delete this.attrs[k]; }
  addEventListener() {}
  append(...kids) { this.children.push(...kids); }
  replaceChildren(...kids) { this.children = kids; }
  set innerHTML(v) { this.text = v; }
  get textContent() { return this.text + this.children.map(c => c.textContent ?? '').join(''); }
  get all() { return this.children.filter(c => c instanceof El).flatMap(c => [c, ...c.all]); }
  querySelector(sel) { return this.all.find(e => sel.startsWith('.') && e.className.split(' ').includes(sel.slice(1))) || null; }
  querySelectorAll() { return []; }
  getClientRects() { return [1]; }
  showModal() { this.open = true; }
  close() { this.open = false; }
  focus() { globalThis.document.activeElement = this; }
  get isConnected() { return true; }
}

test('the screen details dialog draws its colours in colorTally order (rendered into a fake DOM)', async () => {
  const body = new El('body');
  globalThis.document = { body, activeElement: null, createElement: t => new El(t), createTextNode: t => ({ nodeType: 3, textContent: String(t) }) };
  try {
    const { openScreen } = await import('../viewer/js/screen-modal.js');
    const screen = { id: 'home', url: 'https://fictive.example/', title: '/', screenshot: 'screens/home.png', width: 800, height: 600, inventory: { button: 2 },
      elements: [{ color: '#222222', bg: '#eeeeee' }, { color: '#222222', border: '#999999' }, { color: '#222222' }] };
    openScreen({ project: { screenshots: true } }, screen, '/data/fictive/');
    const dialog = body.children[0];
    assert.equal(dialog.open, true, 'opened as a modal');
    const pills = dialog.all.filter(e => e.className === 'pill');
    assert.deepEqual(pills.map(p => [p.textContent, p.getAttribute('title')]), colorTally(screen.elements).map(([c, n]) => [c, `${n}×`]));
    assert.equal(dialog.all.find(e => e.tagName === 'IMG').getAttribute('src'), '/data/fictive/screens/home.png', 'the screenshot URL comes from the base passed in, not the document');
  } finally { delete globalThis.document; }
});

const source = f => readFileSync(new URL(`../viewer/js/${f}`, import.meta.url), 'utf8');
const imported = (text, from) => [...text.matchAll(new RegExp(`import \\{([^}]*)\\} from '${from.replace('.', '\\.')}'`, 'g'))]
  .flatMap(m => m[1].split(',').map(s => s.trim().split(/\s+as\s+/).pop()).filter(Boolean));

test('app.js and components-view.js call the view-model and keep no inline copy of its rules', () => {
  const uses = { 'app.js': ['barsOf', 'roleCounts', 'formatProblem'], 'components-view.js': ['isLight'], 'screen-modal.js': ['colorTally'] };
  for (const [file, names] of Object.entries(uses)) {
    const text = source(file), got = imported(text, './view-model.js');
    for (const n of names) {
      assert.ok(got.includes(n), `${file} imports ${n} from view-model.js`);
      assert.match(text, new RegExp(`\\b${n}\\(`), `${file} calls ${n}()`);
    }
  }
  assert.doesNotMatch(source('components-view.js'), /0\.299/, 'no brightness formula of its own');
  assert.doesNotMatch(source('app.js'), /\/ max \*|byRole|atlas\.name\s*=/, 'no bar widths, role tally or session field on the document');
  assert.doesNotMatch(source('screen-modal.js'), /new Map\(/, 'no colour tally of its own');
});
