// Map view geometry: where each captured page sits and how the links between them run. Pure (no DOM), so Node
// tests can import it; flow-view.js draws the result.
export const BOX = { w: 210, h: 46, gapX: 90, gapY: 18, pad: 20 };

// Breadth-first link depth from the start page; pages it can't reach go in one column after the last.
export function depths(screens, flow, out) {
  const depth = new Map([[flow.start, 0]]), queue = [flow.start];
  while (queue.length) {
    const id = queue.shift();
    for (const to of out.get(id) || []) if (!depth.has(to)) { depth.set(to, depth.get(id) + 1); queue.push(to); }
  }
  const last = Math.max(0, ...depth.values()) + 1;
  for (const x of screens) if (!depth.has(x.id)) depth.set(x.id, last);
  return depth;
}

// Forward links run right side -> left side; links back run left side -> right side (drawn dashed); a link
// within one column loops out to the right.
export function edgePath(a, b) {
  const { w, h, gapX } = BOX, ay = a.y + h / 2, by = b.y + h / 2;
  if (b.x > a.x) return `M${a.x + w} ${ay} C${a.x + w + gapX / 2} ${ay} ${b.x - gapX / 2} ${by} ${b.x} ${by}`;
  if (b.x < a.x) return `M${a.x} ${ay} C${a.x - gapX / 2} ${ay} ${b.x + w + gapX / 2} ${by} ${b.x + w} ${by}`;
  return `M${a.x + w} ${ay} C${a.x + w + 40} ${ay} ${b.x + w + 40} ${by} ${b.x + w} ${by}`;
}

// A node's label: the path of its URL (screen titles are URL paths or layer names), cut at 28 characters.
export function nodeLabel(x) {
  const label = (x.title || x.url || x.id).replace(/^https?:\/\/[^/]+/, '') || '/';
  return label.length > 28 ? label.slice(0, 27) + '…' : label;
}

function positions(screens, depth) {
  const { w, h, gapX, gapY, pad } = BOX, cols = new Map(), pos = new Map();
  for (const x of screens) { const d = depth.get(x.id); if (!cols.has(d)) cols.set(d, []); cols.get(d).push(x); }
  for (const [d, list] of cols) list.forEach((x, i) => pos.set(x.id, { x: pad + d * (w + gapX), y: pad + i * (h + gapY) }));
  const width = pad * 2 + (Math.max(...cols.keys()) + 1) * (w + gapX) - gapX;
  const height = pad * 2 + Math.max(...[...cols.values()].map(l => l.length)) * (h + gapY) - gapY;
  return { pos, width, height };
}

// -> null without links, else { width, height, nodes: [{ id, x, y, label, title, start, out, in }], edges: [{ d, back }] }
export function flowLayout(screens = [], flow) {
  if (!flow?.edges?.length || !screens.length) return null;
  const out = new Map(screens.map(x => [x.id, []]));
  for (const e of flow.edges) out.get(e.from)?.push(e.to);
  const { pos, width, height } = positions(screens, depths(screens, flow, out));
  const edges = flow.edges.filter(e => pos.has(e.from) && pos.has(e.to))
    .map(e => ({ d: edgePath(pos.get(e.from), pos.get(e.to)), back: pos.get(e.to).x <= pos.get(e.from).x }));
  const nodes = screens.map(x => ({ id: x.id, ...pos.get(x.id), label: nodeLabel(x), title: x.url || x.id, start: x.id === flow.start,
    out: out.get(x.id).length, in: flow.edges.filter(e => e.to === x.id).length }));
  return { width, height, nodes, edges };
}
