// PDF adapter: renders each page with pdf.js inside a browser page (module, worker, fonts and the PDF itself are
// served through page.route on a fake origin: no server, no network) and reads the page's real typography and
// colours: text items give font, size (pt) and position; the operator list gives vector fill colours, the fill
// colour active at each text-showing op, and the image count. Pages become screens, prominent lines elements.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { launchBrowser, tokenTally, toHex, prepareOut, writeAtlas } from './atlas-util.mjs';

const ORIGIN = 'http://atlas.invalid/'; // reserved TLD: never resolves (.local costs a 2 s mDNS lookup)
const PDFJS = path.dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'));
const MIME = { '.mjs': 'text/javascript', '.js': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm' };
const half = v => Math.round(v * 2) / 2;
const median = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; };

// Font name -> { font, family, weight }. Subset prefix (ABCDEF+) and style suffixes are stripped from the family.
const STYLE = /(semi|demi|extra|ultra)?(bold|medium|light|thin|black|heavy|regular|italic|oblique|mt|ps)$/i;
const WEIGHTS = [[/black|heavy/i, '900'], [/semi-?bold|demi/i, '600'], [/bold/i, '700'], [/medium/i, '500'], [/light|thin/i, '300']]; // first match wins
export function parseFontName(raw) {
  const font = String(raw || '').replace(/^[A-Z]{6}\+/, '');
  const weight = WEIGHTS.find(([re]) => re.test(font))?.[1] ?? '400';
  const family = stripStyles(font.split(/[-,]/)[0]).replace(/([a-z])([A-Z])/g, '$1 $2'); // PostScript names glue words: SegoeUI -> Segoe UI (same as the Sketch adapter)
  return { font: font || null, family: family || font || null, weight };
}
// Strips stacked style suffixes (BoldItalicMT) until none is left, but never down to an empty name.
function stripStyles(family) {
  for (let prev; prev !== family;) { prev = family; family = family.replace(STYLE, '') || prev; }
  return family;
}

// Runs inside the page (passed to page.evaluate, so it must stay self-contained: its helpers are declared inside it):
// opens the document once (kept on window) and reports one page per call.
async function readPage({ n, maxWidth, png: wantPng }) {
  const lib = window.pdfjsLib ||= await import('/pdfjs/build/pdf.min.mjs');
  lib.GlobalWorkerOptions.workerSrc = '/pdfjs/build/pdf.worker.min.mjs';
  const doc = window.pdfDoc ||= await lib.getDocument({ url: '/doc.pdf', cMapUrl: '/pdfjs/cmaps/', cMapPacked: true,
    standardFontDataUrl: '/pdfjs/standard_fonts/', wasmUrl: '/pdfjs/wasm/', iccUrl: '/pdfjs/iccs/', fontExtraProperties: true }).promise; // extra props = real font name
  if (!n) return { pages: doc.numPages };
  const page = await doc.getPage(n), base = page.getViewport({ scale: 1 });
  const scale = Math.min(maxWidth / base.width, 3), vp = page.getViewport({ scale });
  const canvas = document.createElement('canvas'); canvas.width = Math.ceil(vp.width); canvas.height = Math.ceil(vp.height);
  await page.render({ canvas, canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
  const png = wantPng ? canvas.toDataURL('image/png').split(',')[1] : null; // rendering is still needed: it loads the real font names
  const { fills, runs, images } = scanOps(lib.OPS, await page.getOperatorList());
  const items = textItems(page, await page.getTextContent(), runs, { vp, scale, Util: lib.Util });
  page.cleanup();
  return { width: canvas.width, height: canvas.height, png, fills, items, images };

  // Colours: older pdf.js passes numeric arrays (0-255 RGB, 0-1 gray/CMYK), newer a '#rrggbb' string for all of them.
  function colour(OPS, fn, args) {
    if (typeof args[0] === 'string') return args[0];
    const h = v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0');
    if (fn === OPS.setFillGray) return '#' + h(args[0] * 255).repeat(3);
    if (fn === OPS.setFillCMYKColor) { const [c, m, y, k] = args; return '#' + [c, m, y].map(v => h(255 * (1 - v) * (1 - k))).join(''); }
    const big = args.some(v => v > 1); return '#' + args.slice(0, 3).map(v => h(big ? v : v * 255)).join('');
  }

  // One pass over the operator list: the fill colour in effect (with save/restore), filled shapes, text-showing ops, images.
  function scanOps(OPS, ol) {
    const s = { fill: '#000000', stack: [], fills: [], runs: [], images: 0 }, on = opHandlers(OPS, s);
    for (let i = 0; i < ol.fnArray.length; i++) on.get(ol.fnArray[i])?.(ol.argsArray[i] || [], ol.fnArray[i]);
    return s;
  }

  // Operator code -> handler; table rows keep the order of the former if-ladder (the first row naming a code wins).
  function opHandlers(OPS, s) {
    const FILLS = [OPS.fill, OPS.eoFill, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke];
    const filled = () => { if (s.fill) s.fills.push(s.fill); };
    const shown = (args, fn) => {
      const g = (fn === OPS.nextLineSetSpacingShowText ? args.at(-1) : args[0]) || [];
      s.runs.push({ text: (Array.isArray(g) ? g : []).map(x => x?.unicode ?? '').join('').replace(/\s+/g, ''), color: s.fill });
    };
    const rows = [
      [[OPS.save], () => s.stack.push(s.fill)],
      [[OPS.restore], () => { s.fill = s.stack.pop() ?? s.fill; }],
      [[OPS.setFillRGBColor, OPS.setFillGray, OPS.setFillCMYKColor], (args, fn) => { s.fill = colour(OPS, fn, args); }],
      [[OPS.setFillTransparent, OPS.setFillColorN], () => { s.fill = null; }], // transparent / pattern fill
      [FILLS, filled],
      [[OPS.constructPath], args => { if (FILLS.includes(args[0])) filled(); }],
      [[OPS.showText, OPS.showSpacedText, OPS.nextLineShowText, OPS.nextLineSetSpacingShowText], shown],
      [[OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageXObjectRepeat], () => { s.images++; }],
    ];
    const on = new Map();
    for (const [codes, handler] of rows) for (const code of codes) if (!on.has(code)) on.set(code, handler);
    return on;
  }

  // Text items are located, in order, in the concatenated text of the ops (ops may hold single glyphs) to learn their fill colour.
  function textItems(page, tc, runs, { vp, scale, Util }) {
    const all = runs.map(r => r.text).join(''), owner = runs.flatMap((r, k) => Array(r.text.length).fill(k));
    const items = []; let pos = 0, j = 0;
    for (const it of tc.items) {
      if (!it.str || !it.str.trim()) continue;
      const s = it.str.replace(/\s+/g, ''), at = [s, s.slice(0, 6)].map(x => all.indexOf(x, pos)).find(i => i >= 0);
      if (at != null) { j = owner[at]; pos = at + 1; }
      const t = Util.transform(vp.transform, it.transform), fh = Math.hypot(t[2], t[3]);
      items.push({ str: it.str, x: t[4], base: t[5], w: it.width * scale, h: fh, pt: Math.hypot(it.transform[2], it.transform[3]),
        font: fontName(page, tc, it), color: runs[j]?.color || null });
    }
    return items;
  }

  // The embedded font's real name, else the CSS family pdf.js guessed. get() throws while a font object isn't resolved:
  // that is the expected "unknown here" case, so the error is dropped on purpose and the fallback used.
  function fontName(page, tc, it) {
    let font = null; try { font = page.commonObjs.get(it.fontName)?.name || null; } catch { /* not resolved: use the fallback */ }
    return font || tc.styles[it.fontName]?.fontFamily || null;
  }
}

// Merge items sharing a baseline (and close horizontally) into lines, in reading order.
function lines(items) {
  const out = [];
  for (const it of [...items].sort((a, b) => a.base - b.base || a.x - b.x)) {
    const l = out.find(o => Math.abs(o.base - it.base) < Math.max(o.h, it.h) * 0.4 && it.x - (o.x + o.w) < Math.max(o.h, it.h) * 3 && it.x >= o.x - 1);
    if (!l) { out.push({ ...it, text: it.str }); continue; }
    const gap = it.x - (l.x + l.w);
    l.text += (gap > it.h * 0.15 && !/\s$/.test(l.text) && !/^\s/.test(it.str) ? ' ' : '') + it.str;
    l.w = Math.max(l.x + l.w, it.x + it.w) - l.x;
    if (it.pt > l.pt) Object.assign(l, { pt: it.pt, h: it.h, font: it.font, color: it.color });
  }
  return out.map(l => ({ ...l, text: l.text.replace(/\s+/g, ' ').trim() })).filter(l => l.text);
}

// page.route handler on the fake origin: the PDF, pdf.js files (confined to the package folder), else a blank host page.
function serve(bytes) {
  return route => {
    const p = decodeURIComponent(new URL(route.request().url()).pathname);
    if (p === '/doc.pdf') return route.fulfill({ body: bytes, contentType: 'application/pdf' });
    if (!p.startsWith('/pdfjs/')) return route.fulfill({ body: '<!doctype html><meta charset="utf-8">', contentType: 'text/html' });
    const f = path.join(PDFJS, path.normalize(p.slice(7)));
    if (f.startsWith(PDFJS + path.sep) && existsSync(f)) return route.fulfill({ body: readFileSync(f), contentType: MIME[path.extname(f)] || 'application/octet-stream' });
    return route.fulfill({ status: 404, body: '' });
  };
}

// A page's lines -> text-free elements (headings by size against the page median), tallying their tokens.
function toElements(ls, tally) {
  const med = median(ls.map(l => l.pt));
  return ls.map(l => {
    const f = parseFontName(l.font), color = toHex(l.color), pt = half(l.pt);
    tally.use('text', color); tally.add('fonts', f.family); tally.add('fontSizes', `${pt}pt`); tally.add('fontWeights', f.weight);
    return { role: l.pt >= med * 1.4 ? 'heading' : 'text', tag: 'text', // text is only used in memory to form lines, never stored
      bbox: { x: Math.round(l.x), y: Math.round(l.base - l.h * 0.8), w: Math.round(l.w), h: Math.round(l.h) },
      color, bg: null, fontSize: `${pt}pt`, weight: f.weight, radius: null, font: f.family };
  });
}

export async function importPdf({ source, outDir, maxPages = 40, screenshots = false }) {
  const bytes = readFileSync(source), name = path.basename(source);
  if (bytes.subarray(0, 1024).indexOf('%PDF') < 0) throw new Error(`${name} is not a PDF`);
  const shots = prepareOut(outDir, { screenshots }), tally = tokenTally(), screens = [], notes = [];
  const browser = await launchBrowser(), page = await browser.newPage();
  try {
    await page.route(`${ORIGIN}**`, serve(bytes));
    await page.goto(ORIGIN);
    const { pages } = await page.evaluate(readPage, { n: 0 });
    const count = Math.min(pages, maxPages);
    if (pages > count) notes.push(`Only the first ${count} of ${pages} pages were imported (maxPages).`);
    for (let n = 1; n <= count; n++) { // pages are read and written one at a time: each needs its own in-page render
      const r = await page.evaluate(readPage, { n, maxWidth: 1280, png: screenshots }), id = `p${n}`;
      if (screenshots) writeFileSync(path.join(shots, `${id}.png`), Buffer.from(r.png, 'base64'));
      for (const c of r.fills) tally.use('fill', toHex(c));
      const ls = lines(r.items), elements = toElements(ls, tally);
      const prominent = [...elements].sort((a, b) => parseFloat(b.fontSize) - parseFloat(a.fontSize)).slice(0, 40);
      const inventory = { text: ls.length, heading: elements.filter(e => e.role === 'heading').length, image: r.images };
      screens.push({ id, url: `${name} · page ${n}`, title: `Page ${n}`, screenshot: screenshots ? `screens/${id}.png` : null, width: r.width, height: r.height, inventory, elements: prominent });
      console.log(`  [${n}/${count}] page ${n}  (${ls.length} lines, ${r.fills.length} fills, ${r.images} images)`);
    }
  } finally { await page.close().catch(() => {}); await browser.close(); } // closing the page first avoids a ~6 s Edge shutdown stall
  const first = screens[0] || { width: 0, height: 0 };
  return writeAtlas(outDir, { project: { name: path.basename(name, path.extname(name)), kind: 'pdf', source: name,
    viewport: { width: first.width, height: first.height }, notes }, tokens: tally.finalize(), screens }, { screenshots });
}
