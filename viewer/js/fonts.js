// Shows fonts in themselves: web fonts recorded from the source's @font-face rules (atlas.fontFaces) are loaded
// from their original URL; anything else only renders if it's installed locally. fontStatus() tells which.
const loaded = new Set();

export async function loadFontFaces(faces = []) {
  await Promise.all(faces.map(async f => {
    const key = `${f.family}|${f.weight}|${f.style}|${f.unicodeRange || ''}`; if (loaded.has(key)) return;
    loaded.add(key);
    try { const face = new FontFace(f.family, `url(${JSON.stringify(f.url)})`, { weight: f.weight, style: f.style, ...(f.unicodeRange ? { unicodeRange: f.unicodeRange } : {}) });
      document.fonts.add(await face.load()); } catch { /* blocked (e.g. no CORS header on the font) or gone: falls back */ }
  }));
}

// A family is usable when text set in it measures differently from both generic fallbacks.
const probe = document.createElement('canvas').getContext('2d');
const width = font => { probe.font = `48px ${font}`; return probe.measureText('mmmmmmmmmlliWWQ@#0').width; };
export function fontStatus(family, faces = []) {
  const q = `"${family.replace(/"/g, '')}"`, usable = ['monospace', 'serif'].some(g => width(`${q}, ${g}`) !== width(g));
  if (!usable) return 'missing';
  return faces.some(f => f.family.toLowerCase() === family.toLowerCase()) && [...document.fonts].some(f => f.family.replace(/"/g, '') === family && f.status === 'loaded') ? 'web' : 'installed';
}
export const STATUS_LABEL = { web: 'web font', installed: 'installed', missing: 'not available' };
// For a web font: is there a loaded face with this weight? If not, the browser synthesizes it (fake bold etc.).
export const hasWeight = (family, weight) => [...document.fonts].some(f => {
  if (f.family.replace(/"/g, '') !== family || f.status !== 'loaded') return false;
  const [lo, hi = lo] = String(f.weight).split(' ').map(Number); // '400', or a variable font's range '100 900'
  return lo <= +weight && +weight <= hi;
});
// A visible marker wherever a font is shown in a stand-in instead of itself.
export const fallbackTag = h => h('span', { class: 'tag-fallback', title: 'This font is not available here; a fallback font is shown instead.' }, 'fallback');
export const fontCss = family => `font-family:"${String(family).replace(/"/g, '')}", system-ui, sans-serif`;
