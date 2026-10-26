// Image adapter: turns one image or a folder of images (screens, mockups, mood boards) into an atlas.
// Each image becomes a screen. Its palette is OBSERVED, not declared: the image is decoded in the browser (no image
// deps), only pixels in flat regions count (all 8 neighbours alike: drops anti-aliasing, text smoothing, shadows,
// noise), exact colours are clustered in CIELAB (ΔE < 3, largest first) and each cluster is reported as its mode.
import { readFileSync, readdirSync, statSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import { launchBrowser, tokenTally, slug, prepareOut, writeAtlas } from './atlas-util.mjs';

const TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.avif': 'image/avif', '.bmp': 'image/bmp' };
const ORIGIN = 'http://atlas.invalid/'; // reserved TLD: never resolves (.local costs a 2 s mDNS lookup)
const DE = 3, MIN_SHARE = 0.001, PER_IMAGE = 12, PHOTO_FLAT = 0.15;
const isImage = f => Object.hasOwn(TYPES, path.extname(f).toLowerCase());
const hex = n => '#' + n.toString(16).padStart(6, '0');
const pct = v => `${Math.round(v * 100)}%`;

// sRGB (24-bit int) -> CIELAB (D65).
function lab(n) {
  const [r, g, b] = [n >> 16 & 255, n >> 8 & 255, n & 255].map(v => (v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const f = t => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
  const x = f((r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047), y = f(r * 0.2126 + g * 0.7152 + b * 0.0722), z = f((r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
const dE = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// Greedy ΔE merge, largest first: a cluster keeps its seed (the most frequent exact colour = the mode).
// `top` = count of the seed itself; a cluster whose mode is a small part of it is a gradient/texture, not a fill.
function cluster(list) {
  const out = [];
  for (const c of [...list].sort((a, b) => b.n - a.n)) {
    const near = out.find(o => dE(o.lab, c.lab) < DE);
    if (near) { near.n += c.n; c.names?.forEach(x => near.names.add(x)); } else out.push({ rgb: c.rgb, lab: c.lab, n: c.n, top: c.n, names: new Set(c.names || []) });
  }
  return out;
}

// Runs inside the page: decode, downscale huge images with nearest-neighbour (keeps exact colours), keep flat pixels.
async function analyse(url) {
  const img = await createImageBitmap(await (await fetch(url)).blob());
  const W = img.width, H = img.height, k = Math.min(1, Math.sqrt(1500000 / (W * H)));
  const w = Math.max(1, Math.round(W * k)), h = Math.max(1, Math.round(H * k));
  const cv = new OffscreenCanvas(w, h), ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = false; ctx.drawImage(img, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data, counts = new Map(), T = 2; // T = per-channel tolerance (JPEG noise)
  let opaque = 0, flat = 0;
  const like = (i, j) => d[j + 3] > 0 && Math.abs(d[i] - d[j]) <= T && Math.abs(d[i + 1] - d[j + 1]) <= T && Math.abs(d[i + 2] - d[j + 2]) <= T;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4; if (d[i + 3] === 0) continue; // fully transparent pixels don't count
    opaque++;
    let ok = true; // image borders: only the neighbours that exist
    for (let dy = -1; dy <= 1 && ok; dy++) for (let dx = -1; dx <= 1 && ok; dx++) {
      const X = x + dx, Y = y + dy; if ((dx || dy) && X >= 0 && Y >= 0 && X < w && Y < h) ok = like(i, (Y * w + X) * 4);
    }
    if (!ok) continue;
    flat++; const n = d[i] << 16 | d[i + 1] << 8 | d[i + 2]; counts.set(n, (counts.get(n) || 0) + 1);
  }
  const scale = (W * H) / (w * h); // sampled pixel -> real pixel count
  return { width: W, height: H, opaque: opaque * scale, flat: flat * scale,
    colors: [...counts].sort((a, b) => b[1] - a[1]).slice(0, 4000).map(([rgb, n]) => ({ rgb, n: n * scale })) };
}

// One image's palette: clusters that are real fills (mode-dominated) and at least MIN_SHARE of its flat pixels.
const palette = (r, name) => cluster(r.colors.map(c => ({ ...c, lab: lab(c.rgb), names: [name] })))
  .filter(c => c.top >= c.n * 0.3 && c.n >= r.flat * MIN_SHARE).slice(0, PER_IMAGE);

export async function importImages({ source, outDir, screenshots = false }) {
  const isDir = statSync(source).isDirectory();
  const files = isDir
    ? readdirSync(source).filter(f => isImage(f) && statSync(path.join(source, f)).isFile()).sort((a, b) => a.localeCompare(b)).map(f => path.join(source, f))
    : [source];
  if (!files.length || !files.every(isImage)) throw new Error(`No supported images (${Object.keys(TYPES).join(' ')}) in ${source}`);
  const shots = prepareOut(outDir, { screenshots }), tally = tokenTally(), screens = [], ids = new Set(), all = [], notes = [];
  const browser = await launchBrowser(), page = await browser.newPage();
  try {
    await page.route(`${ORIGIN}**`, route => {
      const name = decodeURIComponent(new URL(route.request().url()).pathname.slice(1));
      const f = files.find(x => path.basename(x) === name);
      return f ? route.fulfill({ body: readFileSync(f), contentType: TYPES[path.extname(f).toLowerCase()] }) : route.fulfill({ body: '<!doctype html>', contentType: 'text/html' });
    });
    await page.goto(ORIGIN);
    for (const file of files) {
      const name = path.basename(file), ext = path.extname(name).toLowerCase(), base = slug(path.basename(name, path.extname(name)));
      let id = base; for (let i = 2; ids.has(id); i++) id = `${base}-${i}`; ids.add(id);
      let r;
      try { r = await page.evaluate(analyse, ORIGIN + encodeURIComponent(name)); } catch (e) { console.warn(`  skipped ${name}: ${e.message.split('\n')[0]}`); continue; }
      const pal = palette(r, name), flatShare = r.flat / (r.opaque || 1);
      all.push(...pal);
      const purpose = flatShare < PHOTO_FLAT ? `photo-heavy: only ${pct(flatShare)} flat pixels; palette from flat regions only` : null;
      if (purpose) notes.push(`${name}: ${purpose}`);
      if (screenshots) copyFileSync(file, path.join(shots, id + ext)); // the image itself is content: only kept when opted in
      screens.push({ id, url: name, title: name, purpose, screenshot: screenshots ? `screens/${id}${ext}` : null, width: r.width, height: r.height, inventory: {}, elements: [],
        flatShare: +flatShare.toFixed(3), palette: pal.slice(0, 6).map(c => ({ value: hex(c.rgb), share: +(c.n / (r.flat || 1)).toFixed(4) })) });
      console.log(`  [${screens.length}/${files.length}] ${name}  (${r.width}x${r.height}, ${pct(flatShare)} flat, ${pal.length} colours)`);
    }
  } finally { await page.close().catch(() => {}); await browser.close(); } // closing the page first avoids a ~6 s Edge shutdown stall
  // Aggregate across images by pixel count; shares are of all counted (palette) pixels in the atlas.
  const merged = cluster(all), counted = merged.reduce((a, c) => a + c.n, 0) || 1;
  for (const c of merged) tally.add('colors', hex(c.rgb), Math.round(c.n), 'observed'); // no file names in labels: they travel into exports
  const tokens = tally.finalize();
  tokens.colors = tokens.colors.map(c => ({ ...c, share: +(c.count / counted).toFixed(4) }));
  const first = screens[0] || { width: 0, height: 0 };
  return writeAtlas(outDir, { project: { name: isDir ? path.basename(path.resolve(source)) : path.basename(source, path.extname(source)), kind: 'image', source: path.basename(path.resolve(source)),
    viewport: { width: first.width, height: first.height }, notes }, tokens, screens }, { screenshots });
}
