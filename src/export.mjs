// Exports an atlas's design tokens: a printable PDF token sheet (rendered by the browser from generated HTML),
// a W3C design-tokens JSON file, and a CSS custom-properties file. Written to data/<name>/exports/ unless outDir is given.
// Exports hold design tokens only: no source name, file name, URL, screenshots or text from the source.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { launchBrowser, slug } from './atlas-util.mjs';
import { buildTokens, toCssVars } from './tokens-json.mjs';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ink = hex => { const n = parseInt(String(hex).slice(1, 7), 16) || 0; return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) > 150 ? '#14161a' : '#ffffff'; };
const share = c => c.share != null ? `${(c.share * 100).toFixed(c.share < 0.1 ? 1 : 0)}%` : `${c.count}×`;
const num = v => parseFloat(v) || 0;
const tokenVars = atlas => (atlas.tokens.cssVars || []).filter(v => !/^\s*["']/.test(v.value)); // quoted strings are copy, not tokens

// JSON and CSS share one structure (src/tokens-json.mjs): primitives, typography and component layers, source variables.
export const toDtcg = (atlas, opts) => buildTokens(atlas, opts);
export const toCss = atlas => toCssVars(buildTokens(atlas));

// Printable token sheet. Kept in this file (not the viewer) so the PDF doesn't depend on the dev server.
export function sheetHtml(atlas) {
  const t = atlas.tokens, p = atlas.project, sec = (title, body, n) => body ? `<section><h2>${esc(title)}${n != null ? ` <span>${n}</span>` : ''}</h2>${body}</section>` : '';
  const use = u => Object.entries(u || {}).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k === 'background' ? 'bg' : k} ${n}`).join(' · ');
  const palette = list => list.length ? `<div class="sw">${list.map(c => `<div class="c"><div class="chip" style="background:${esc(c.value)};color:${ink(c.value)}">${esc(c.value)}</div><div class="l">${esc(c.label || '')}</div>${c.usage ? `<div class="u">${esc(use(c.usage))}</div>` : ''}<div class="n">${share(c)}</div></div>`).join('')}</div>` : '';
  const colors = palette(t.colors);
  const lineHeights = t.lineHeights?.length ? `<div class="pills">${t.lineHeights.map(l => `<span>${esc(l.value)} <small>${l.count}×</small></span>`).join('')}</div>` : '';
  const letterSpacings = t.letterSpacings?.length ? `<div class="pills">${t.letterSpacings.map(l => `<span>${esc(l.value)} <small>${l.count}×</small></span>`).join('')}</div>` : '';
  const LEVEL = { fail: 'Fails AA', AA: 'AA', AAA: 'AAA', unknown: 'Over an image' };
  const contrast = atlas.contrast?.length ? `<table class="ct">${atlas.contrast.map(c => `<tr><td><b style="color:${esc(c.fg)};background:${esc(c.bg)}">Aa</b></td><td>${esc(c.fg)} on ${esc(c.bg)}${c.overImage ? ' + image' : ''}</td><td>${c.level === 'unknown' ? '—' : `${c.ratio}:1`}</td><td class="${c.level === 'fail' ? 'f' : ''}">${LEVEL[c.level] || esc(c.level)}${c.large ? ' (large)' : ''}</td><td>${c.count}×</td></tr>`).join('')}</table>` : '';
  const rated = (atlas.contrast || []).filter(c => c.level !== 'unknown');
  const modes = Object.entries(atlas.modes || {}).map(([m, v]) => sec(`Colour palette — ${m}`, palette(v.tokens?.colors || []), v.tokens?.colors?.length)).join('');
  // fonts are shown in themselves (web fonts from the source's @font-face URLs, else installed ones); data-font marks
  // every sample so exportAtlas can stamp 'fallback' on the ones that couldn't use the real font
  const ff = f => `font-family:'${esc(String(f).replace(/'/g, ''))}', system-ui, sans-serif`, primary = t.fonts[0]?.value;
  const sizes = t.fontSizes.length ? t.fontSizes.slice().sort((a, b) => num(b.value) - num(a.value)).map(f => `<div class="row"><span class="k">${esc(f.value)}</span><span class="demo"${primary ? ` data-font="${esc(primary)}"` : ''} style="font-size:${esc(f.value)};${primary ? ff(primary) : ''}">Aa — The quick brown fox</span><span class="n">${f.count}×</span></div>`).join('') : '';
  const fonts = t.fonts.length ? t.fonts.map(f => `<div class="row"><span class="demo" data-font="${esc(f.value)}" style="${ff(f.value)};font-size:20px">${esc(f.value)}</span><span class="n">${f.count}×</span></div>`).join('') : '';
  const weights = t.fontWeights.length ? `<div class="pills">${t.fontWeights.map(w => `<span${primary ? ` data-font="${esc(primary)}"` : ''} style="font-weight:${esc(w.value)};${primary ? ff(primary) : ''}">${esc(w.value)} <small>${w.count}×</small></span>`).join('')}</div>` : '';
  const faces = (atlas.fontFaces || []).map(f => `@font-face { font-family: '${esc(f.family.replace(/'/g, ''))}'; src: url(${JSON.stringify(f.url)}); font-weight: ${esc(f.weight)}; font-style: ${esc(f.style)};${f.unicodeRange ? ` unicode-range: ${esc(f.unicodeRange)};` : ''} }`).join('\n');
  const maxSp = Math.max(1, ...t.spacing.map(s => num(s.value)));
  const spacing = t.spacing.length ? t.spacing.slice().sort((a, b) => num(a.value) - num(b.value)).map(s => `<div class="row"><span class="k">${esc(s.value)}</span><span class="bar" style="width:${Math.max(4, num(s.value) / maxSp * 380)}px"></span><span class="n">${s.count}×</span></div>`).join('') : '';
  const radii = t.radii.length ? `<div class="pills">${t.radii.map(r => `<span><i style="border-radius:${esc(r.value)}"></i>${esc(r.value)} <small>${r.count}×</small></span>`).join('')}</div>` : '';
  const shadows = t.shadows.length ? `<div class="sh">${t.shadows.map(s => `<div><div class="box" style="box-shadow:${esc(s.value)}"></div><code>${esc(s.value)}</code></div>`).join('')}</div>` : '';
  const vars = tokenVars(atlas).length ? `<table>${tokenVars(atlas).map(v => `<tr><td>${esc(v.name)}</td><td>${/^#[0-9a-f]{3,8}$/i.test(v.value) ? `<i style="background:${esc(v.value)}"></i>` : ''}${esc(v.value)}</td></tr>`).join('')}</table>` : '';
  return `<!doctype html><html><head><meta charset="utf-8"><title>Design tokens</title><style>
  ${faces}
  @page { size: A4; margin: 16mm 14mm; }
  .fb { display: inline-block; margin-left: 6px; padding: 0 4px; border: 1px dashed #5b6370; border-radius: 3px; font: 600 7px ui-monospace, Consolas, monospace; letter-spacing: .04em; color: #14161a; vertical-align: middle; }
  * { box-sizing: border-box; } body { margin: 0; font: 11px/1.45 system-ui, -apple-system, 'Segoe UI', sans-serif; color: #14161a; }
  header { border-bottom: 2px solid #14161a; padding-bottom: 10px; margin-bottom: 6px; } h1 { font-size: 24px; margin: 0 0 4px; } header p { margin: 0; color: #5b6370; }
  section { margin-top: 18px; } h2 { font-size: 10px; text-transform: uppercase; letter-spacing: .08em; color: #5b6370; border-bottom: 1px solid #e3e6ea; padding-bottom: 4px; margin: 0 0 10px; break-after: avoid; } h2 span { color: #8a93a0; }
  .sw { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; } .c { break-inside: avoid; border: 1px solid #e3e6ea; border-radius: 6px; overflow: hidden; }
  .chip { height: 46px; display: flex; align-items: flex-end; padding: 4px 6px; font: 600 10px ui-monospace, Consolas, monospace; } .c .l { padding: 3px 6px 0; font-size: 9px; color: #5b6370; min-height: 14px; } .c .n { padding: 0 6px 4px; font-size: 9px; color: #8a93a0; } .c .u { padding: 0 6px; font-size: 8px; color: #5b6370; }
  .row { display: flex; align-items: center; gap: 12px; padding: 4px 0; border-bottom: 1px solid #f0f2f4; break-inside: avoid; } .k { width: 58px; font: 10px ui-monospace, Consolas, monospace; color: #5b6370; flex: none; }
  .demo { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; } .n { margin-left: auto; color: #8a93a0; font-size: 9px; flex: none; }
  .bar { height: 10px; background: #14161a; border-radius: 2px; } .pills { display: flex; flex-wrap: wrap; gap: 8px; } .pills span { border: 1px solid #e3e6ea; border-radius: 999px; padding: 3px 10px; display: inline-flex; align-items: center; gap: 6px; font-size: 12px; }
  .pills i { display: inline-block; width: 16px; height: 16px; background: #14161a; } small { color: #8a93a0; font-size: 9px; }
  .sh { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; } .sh > div { break-inside: avoid; } .box { height: 56px; border-radius: 6px; background: #fff; margin: 8px 8px 8px; } code { font-size: 8px; color: #5b6370; word-break: break-all; }
  table { width: 100%; border-collapse: collapse; font: 9px ui-monospace, Consolas, monospace; } td { padding: 3px 6px; border-bottom: 1px solid #f0f2f4; vertical-align: top; } td:first-child { color: #5b6370; width: 40%; } tr { break-inside: avoid; }
  .ct td:first-child { width: 34px; } .ct b { display: inline-block; padding: 1px 6px; border-radius: 4px; border: 1px solid #e3e6ea; font: 600 11px system-ui, sans-serif; } .ct .f { font-weight: 700; color: #14161a; }
  td i { display: inline-block; width: 9px; height: 9px; border-radius: 2px; margin-right: 5px; vertical-align: -1px; border: 1px solid #0002; }
  </style></head><body>
  <header><h1>Design tokens</h1><p>Extracted ${esc(new Date(p.created).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }))}</p></header>
  ${sec('Colour palette', colors, t.colors.length)}${sec('Type scale', sizes, t.fontSizes.length)}${sec('Font families', fonts, t.fonts.length)}${sec('Font weights', weights)}${sec('Line heights (× font size)', lineHeights)}${sec('Letter spacing', letterSpacings)}
  ${sec('Spacing scale', spacing, t.spacing.length)}${sec('Radii', radii)}${sec('Shadows', shadows, t.shadows.length)}${modes}${sec(`Contrast — ${rated.filter(c => c.level === 'fail').length} of ${rated.length} pairs fail WCAG AA`, contrast)}${sec({ pptx: 'Theme slots & grid', sketch: 'Swatches & text styles', tokens: 'All tokens' }[p.kind] || 'Variables', vars, tokenVars(atlas).length)}
  </body></html>`;
}

export async function exportAtlas({ atlasDir, outDir = path.join(atlasDir, 'exports'), formats = ['pdf', 'json', 'css'] }) {
  const atlas = JSON.parse(readFileSync(path.join(atlasDir, 'atlas.json'), 'utf8'));
  mkdirSync(outDir, { recursive: true });
  const base = slug(atlas.project.name), written = [];
  if (formats.includes('json')) { const f = path.join(outDir, `${base}.tokens.json`); writeFileSync(f, JSON.stringify(toDtcg(atlas), null, 2)); written.push(f); }
  if (formats.includes('css')) { const f = path.join(outDir, `${base}-tokens.css`); writeFileSync(f, toCss(atlas)); written.push(f); }
  if (formats.includes('pdf')) {
    const browser = await launchBrowser();
    try {
      const page = await browser.newPage();
      await page.setContent(sheetHtml(atlas), { waitUntil: 'load' });
      // wait for web fonts, then mark every sample whose font isn't really there (measures like a generic fallback)
      await page.evaluate(async () => {
        await Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 8000))]);
        const ctx = document.createElement('canvas').getContext('2d'), w = f => { ctx.font = `48px ${f}`; return ctx.measureText('mmmmmmmmmlliWWQ@#0').width; };
        const missing = fam => !['monospace', 'serif'].some(g => w(`"${fam}", ${g}`) !== w(g));
        for (const el of document.querySelectorAll('[data-font]')) if (missing(el.dataset.font)) el.insertAdjacentHTML(el.parentElement.classList.contains('pills') ? 'beforeend' : 'afterend', '<span class="fb">FALLBACK</span>');
      });
      const f = path.join(outDir, `${base}-tokens.pdf`);
      await page.pdf({ path: f, format: 'A4', printBackground: true, displayHeaderFooter: true, headerTemplate: '<span></span>',
        footerTemplate: `<div style="font:8px system-ui;color:#8a93a0;width:100%;padding:0 14mm;display:flex;justify-content:space-between"><span>Design tokens</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
        margin: { top: '16mm', bottom: '18mm', left: '14mm', right: '14mm' } });
      written.push(f);
    } finally { await browser.close(); }
  }
  return written;
}
