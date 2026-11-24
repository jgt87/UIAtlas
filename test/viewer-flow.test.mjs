// Map view geometry (viewer/js/flow-geometry.js): columns by link depth, edge routes, labels.
import test from 'node:test';
import assert from 'node:assert/strict';
import { BOX, depths, edgePath, flowLayout, nodeLabel } from '../viewer/js/flow-geometry.js';

const screens = ['home', 'list', 'item', 'lost'].map(id => ({ id, url: `https://shop.example/${id === 'home' ? '' : id}`, title: id === 'home' ? '/' : `/${id}` }));
const flow = { start: 'home', edges: [{ from: 'home', to: 'list' }, { from: 'list', to: 'item' }, { from: 'item', to: 'home' }] };

test('depth is the breadth-first link distance; unreachable pages go one column after the last', () => {
  const out = new Map(screens.map(x => [x.id, flow.edges.filter(e => e.from === x.id).map(e => e.to)]));
  assert.deepEqual(Object.fromEntries(depths(screens, flow, out)), { home: 0, list: 1, item: 2, lost: 3 });
});

test('pages sit in columns by depth and stack within a column', () => {
  const layout = flowLayout(screens, { ...flow, edges: [...flow.edges, { from: 'home', to: 'item' }] });
  const at = Object.fromEntries(layout.nodes.map(n => [n.id, [n.x, n.y]]));
  const col = d => BOX.pad + d * (BOX.w + BOX.gapX);
  assert.deepEqual(at.home, [col(0), BOX.pad]);
  assert.deepEqual(at.list, [col(1), BOX.pad]);
  assert.deepEqual(at.item, [col(1), BOX.pad + BOX.h + BOX.gapY]);
  assert.equal(layout.width, BOX.pad * 2 + 3 * (BOX.w + BOX.gapX) - BOX.gapX);
  assert.equal(layout.height, BOX.pad * 2 + 2 * (BOX.h + BOX.gapY) - BOX.gapY);
});

test('links back are marked, counts are per page, and nothing without links is laid out', () => {
  const layout = flowLayout(screens, flow);
  assert.deepEqual(layout.edges.map(e => e.back), [false, false, true]);
  const home = layout.nodes.find(n => n.id === 'home');
  assert.deepEqual([home.out, home.in, home.start], [1, 1, true]);
  assert.equal(flowLayout(screens, { start: 'home', edges: [] }), null);
  assert.equal(flowLayout([], flow), null);
});

test('edges leave a box on the side facing their target', () => {
  const a = { x: 0, y: 0 }, b = { x: 300, y: 0 };
  assert.match(edgePath(a, b), new RegExp(`^M${BOX.w} `));
  assert.match(edgePath(b, a), /^M300 /);
  assert.match(edgePath(a, { x: 0, y: 64 }), new RegExp(`^M${BOX.w} .* ${BOX.w} ${64 + BOX.h / 2}$`));
});

test('labels are URL paths, cut at 28 characters', () => {
  assert.equal(nodeLabel({ id: 'x', url: 'https://shop.example/' }), '/');
  assert.equal(nodeLabel({ id: 'x', title: '/a' }), '/a');
  assert.equal(nodeLabel({ id: 'x', title: '/' + 'a'.repeat(40) }).length, 28);
});
