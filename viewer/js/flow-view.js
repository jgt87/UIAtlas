// Map view: the captured pages as a flow graph (atlas.flow), laid out in columns by link depth from the start page.
import { h } from './dom.js';

const NS = 'http://www.w3.org/2000/svg';
const s = (tag, attrs = {}, ...kids) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); e.append(...kids); return e; };
const W = 210, H = 46, GX = 90, GY = 18, PAD = 20;

export function renderFlow(atlas) {
  const flow = atlas.flow, screens = atlas.screens || [];
  if (!flow?.edges?.length) return [h('div', { class: 'empty' }, screens.length > 1 ? 'No links between the captured pages.' : 'A flow map needs a crawl of more than one page (websites and local HTML).')];
  // breadth-first depth from the start page; pages it can't reach go in a last column
  const out = new Map(screens.map(x => [x.id, []])); for (const e of flow.edges) out.get(e.from)?.push(e.to);
  const depth = new Map([[flow.start, 0]]), queue = [flow.start];
  while (queue.length) { const id = queue.shift(); for (const to of out.get(id) || []) if (!depth.has(to)) { depth.set(to, depth.get(id) + 1); queue.push(to); } }
  const last = Math.max(0, ...depth.values()) + 1; for (const x of screens) if (!depth.has(x.id)) depth.set(x.id, last);
  const cols = new Map(); for (const x of screens) (cols.get(depth.get(x.id)) || cols.set(depth.get(x.id), []).get(depth.get(x.id))).push(x);
  const pos = new Map(); for (const [d, list] of cols) list.forEach((x, i) => pos.set(x.id, { x: PAD + d * (W + GX), y: PAD + i * (H + GY) }));
  const width = PAD * 2 + (Math.max(...cols.keys()) + 1) * (W + GX) - GX, height = PAD * 2 + Math.max(...[...cols.values()].map(l => l.length)) * (H + GY) - GY;
  const svg = s('svg', { class: 'flow', width, height, viewBox: `0 0 ${width} ${height}` },
    s('defs', {}, s('marker', { id: 'arrow', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' }, s('path', { d: 'M0 0L10 5L0 10z', class: 'flow-arrow' }))));
  // forward links run right side -> left side; links back run left side -> right side (dashed); same column loops right
  for (const e of flow.edges) { const a = pos.get(e.from), b = pos.get(e.to); if (!a || !b) continue;
    const ay = a.y + H / 2, by = b.y + H / 2;
    const d = b.x > a.x ? `M${a.x + W} ${ay} C${a.x + W + GX / 2} ${ay} ${b.x - GX / 2} ${by} ${b.x} ${by}`
      : b.x < a.x ? `M${a.x} ${ay} C${a.x - GX / 2} ${ay} ${b.x + W + GX / 2} ${by} ${b.x + W} ${by}`
      : `M${a.x + W} ${ay} C${a.x + W + 40} ${ay} ${b.x + W + 40} ${by} ${b.x + W} ${by}`;
    svg.append(s('path', { d, class: 'flow-edge' + (b.x > a.x ? '' : ' back'), 'marker-end': 'url(#arrow)' })); }
  for (const x of screens) { const p = pos.get(x.id), label = (x.title || x.url || x.id).replace(/^https?:\/\/[^/]+/, '') || '/';
    svg.append(s('g', { class: 'flow-node' + (x.id === flow.start ? ' start' : '') }, s('title', {}, x.url || x.id), s('rect', { x: p.x, y: p.y, width: W, height: H, rx: 8 }),
      s('text', { x: p.x + 12, y: p.y + 19 }, label.length > 28 ? label.slice(0, 27) + '…' : label),
      s('text', { x: p.x + 12, y: p.y + 35, class: 'sub' }, `${out.get(x.id)?.length || 0} out · ${flow.edges.filter(e => e.to === x.id).length} in`))); }
  return [h('h2', { class: 'sec' }, `Flow (${screens.length} pages, ${flow.edges.length} links)`), h('div', { class: 'flow-wrap' }, svg)];
}
