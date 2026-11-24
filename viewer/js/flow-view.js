// Map view: the captured pages as a flow graph (atlas.flow), laid out in columns by link depth from the start page
// (flow-geometry.js); this module only draws it.
import { h } from './dom.js';
import { BOX, flowLayout } from './flow-geometry.js';

const NS = 'http://www.w3.org/2000/svg';
const s = (tag, attrs = {}, ...kids) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); e.append(...kids); return e; };
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

const node = n => s('g', { class: n.start ? 'flow-node start' : 'flow-node' }, s('title', {}, n.title),
  s('rect', { x: n.x, y: n.y, width: BOX.w, height: BOX.h, rx: 8 }),
  s('text', { x: n.x + 12, y: n.y + 19 }, n.label),
  s('text', { x: n.x + 12, y: n.y + 35, class: 'sub' }, `${n.out} out · ${n.in} in`));

export function renderFlow(atlas) {
  const screens = atlas.screens || [], layout = flowLayout(screens, atlas.flow);
  if (!layout) return [h('div', { class: 'empty' }, screens.length > 1 ? 'No links between the captured pages.' : 'A map needs a crawl of more than one page (websites and local HTML).')];
  const svg = s('svg', { class: 'flow', width: layout.width, height: layout.height, viewBox: `0 0 ${layout.width} ${layout.height}` },
    s('defs', {}, s('marker', { id: 'arrow', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' }, s('path', { d: 'M0 0L10 5L0 10z', class: 'flow-arrow' }))),
    ...layout.edges.map(e => s('path', { d: e.d, class: e.back ? 'flow-edge back' : 'flow-edge', 'marker-end': 'url(#arrow)' })),
    ...layout.nodes.map(node));
  return [h('h2', { class: 'sec' }, `Map (${plural(screens.length, 'page', 'pages')}, ${plural(atlas.flow.edges.length, 'link', 'links')})`), h('div', { class: 'flow-wrap' }, svg)];
}
