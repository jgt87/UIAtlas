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
export function parseFontName(raw) {
  const font = String(raw || '').replace(/^[A-Z]{6}\+/, '');
  const weight = /black|heavy/i.test(font) ? '900' : /semi-?bold|demi/i.test(font) ? '600' : /bold/i.test(font) ? '700'
    : /medium/i.test(font) ? '500' : /light|thin/i.test(font) ? '300' : '400';
  let family = font.split(/[-,]/)[0]; for (let prev; prev !== family;) { prev = family; family = family.replace(STYLE, '') || prev; }
  family = family.replace(/([a-z])([A-Z])/g, '$1 $2'); // PostScript names glue words: SegoeUI -> Segoe UI (same as the Sketch adapter)
  return { font: font || null, family: family || font || null, weight };
}

// Runs inside the page: opens the document once (kept on window) and reports one page per call.
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

  // Colours: older pdf.js passes numeric arrays (0-255 RGB, 0-1 gray/CMYK), newer a '#rrggbb' string for all of them.
  const { OPS, Util } = lib, op = (fn, args) => {
    if (typeof args[0] === 'string') return args[0];
    const h = v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0');
    if (fn === OPS.setFillGray) return '#' + h(args[0] * 255).repeat(3);
    if (fn === OPS.setFillCMYKColor) { const [c, m, y, k] = args; return '#' + [c, m, y].map(v => h(255 * (1 - v) * (1 - k))).join(''); }
    const big = args.some(v => v > 1); return '#' + args.slice(0, 3).map(v => h(big ? v : v * 255)).join('');
  };
  const FILLS = new Set([OPS.fill, OPS.eoFill, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke]);
  const SETFILL = new Set([OPS.setFillRGBColor, OPS.setFillGray, OPS.setFillCMYKColor]);
  const TEXT = new Set([OPS.showText, OPS.showSpacedText, OPS.nextLineShowText, OPS.nextLineSetSpacingShowText]);
  const IMAGES = new Set([OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageXObjectRepeat]);
  const ol = await page.getOperatorList(), fills = [], runs = [], stack = [];
  let fill = '#000000', images = 0;
  for (let i = 0; i < ol.fnArray.length; i++) {
    const fn = ol.fnArray[i], args = ol.argsArray[i] || [];
    if (fn === OPS.save) stack.push(fill); else if (fn === OPS.restore) fill = stack.pop() ?? fill;
    else if (SETFILL.has(fn)) fill = op(fn, args);
    else if (fn === OPS.setFillTransparent || fn === OPS.setFillColorN) fill = null; // transparent / pattern fill
    else if (FILLS.has(fn) || (fn === OPS.constructPath && FILLS.has(args[0]))) { if (fill) fills.push(fill); }
    else if (TEXT.has(fn)) {
      const g = (fn === OPS.nextLineSetSpacingShowText ? args.at(-1) : args[0]) || [];
      runs.push({ text: (Array.isArray(g) ? g : []).map(x => x?.unicode ?? '').join('').replace(/\s+/g, ''), color: fill });
    } else if (IMAGES.has(fn)) images++;
  }

  // Text items are located, in order, in the concatenated text of the ops (ops may hold single glyphs) to learn their fill colour.
  const all = runs.map(r => r.text).join(''), owner = runs.flatMap((r, k) => Array(r.text.length).fill(k));
  const tc = await page.getTextContent(), items = []; let pos = 0, j = 0;
  for (const it of tc.items) {
    if (!it.str || !it.str.trim()) continue;
    const s = it.str.replace(/\s+/g, ''), at = [s, s.slice(0, 6)].map(x => all.indexOf(x, pos)).find(i => i >= 0);
    if (at != null) { j = owner[at]; pos = at + 1; }
    const t = Util.transform(vp.transform, it.transform), fh = Math.hypot(t[2], t[3]);
    let font = null; try { font = page.commonObjs.get(it.fontName)?.name || null; } catch {}
    items.push({ str: it.str, x: t[4], base: t[5], w: it.width * scale, h: fh, pt: Math.hypot(it.transform[2], it.transform[3]),
      font: font || tc.styles[it.fontName]?.fontFamily || null, color: runs[j]?.color || null });
  }
  page.cleanup();
  return { width: canvas.width, height: canvas.height, png, fills, items, images };
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

export async function importPdf({ source, outDir, maxPages = 40, screenshots = false }) {
  const bytes = readFileSync(source), name = path.basename(source);
  if (bytes.subarray(0, 1024).indexOf('%PDF') < 0) throw new Error(`${name} is not a PDF`);
  const shots = prepareOut(outDir, { screenshots }), tally = tokenTally(), screens = [], notes = [];
  const browser = await launchBrowser(), page = await browser.newPage();
  try {
    await page.route(`${ORIGIN}**`, route => {
      const p = decodeURIComponent(new URL(route.request().url()).pathname);
      if (p === '/doc.pdf') return route.fulfill({ body: bytes, contentType: 'application/pdf' });
      if (p.startsWith('/pdfjs/')) {
        const f = path.join(PDFJS, path.normalize(p.slice(7)));
        if (f.startsWith(PDFJS + path.sep) && existsSync(f)) return route.fulfill({ body: readFileSync(f), contentType: MIME[path.extname(f)] || 'application/octet-stream' });
        return route.fulfill({ status: 404, body: '' });
      }
      return route.fulfill({ body: '<!doctype html><meta charset="utf-8">', contentType: 'text/html' });
    });
    await page.goto(ORIGIN);
    const { pages } = await page.evaluate(readPage, { n: 0 });
    const count = Math.min(pages, maxPages);
    if (pages > count) notes.push(`Only the first ${count} of ${pages} pages were imported (maxPages).`);
    for (let n = 1; n <= count; n++) {
      const r = await page.evaluate(readPage, { n, maxWidth: 1280, png: screenshots }), id = `p${n}`;
      if (screenshots) writeFileSync(path.join(shots, `${id}.png`), Buffer.from(r.png, 'base64'));
      for (const c of r.fills) tally.add('colors', toHex(c));
      const ls = lines(r.items), med = median(ls.map(l => l.pt));
      const elements = ls.map(l => {
        const f = parseFontName(l.font), color = toHex(l.color), pt = half(l.pt);
        tally.add('colors', color); tally.add('fonts', f.family); tally.add('fontSizes', `${pt}pt`); tally.add('fontWeights', f.weight);
        return { role: l.pt >= med * 1.4 ? 'heading' : 'text', tag: 'text', // text is only used in memory to form lines, never stored
          bbox: { x: Math.round(l.x), y: Math.round(l.base - l.h * 0.8), w: Math.round(l.w), h: Math.round(l.h) },
          color, bg: null, fontSize: `${pt}pt`, weight: f.weight, radius: null, font: f.family };
      });
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
