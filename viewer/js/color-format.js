// Colour notation toggle (HEX / RGB) for every colour the viewer prints. The choice is remembered per browser.
// Storage can be blocked (private windows, site settings): the catches are safe because the choice then stays in
// memory for this visit and HEX is the default; nothing the person made is lost.
let format = 'hex';
try { format = localStorage.getItem('atlas-color-format') === 'rgb' ? 'rgb' : 'hex'; } catch { /* storage blocked: HEX, see above */ }

export const colorFormat = () => format;
export function setColorFormat(f) { format = f === 'rgb' ? 'rgb' : 'hex'; try { localStorage.setItem('atlas-color-format', format); } catch { /* storage blocked: kept in memory, see above */ } }

// '#10069f' -> 'rgb(16 6 159)', '#10069f80' -> 'rgb(16 6 159 / 0.5)'; anything that isn't a hex colour is returned as is.
export function fmtColor(v) {
  const m = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(String(v ?? '').trim());
  if (format !== 'rgb' || !m) return v;
  const hex = m[1].length <= 4 ? [...m[1]].map(c => c + c).join('') : m[1], n = i => parseInt(hex.slice(i, i + 2), 16);
  const a = hex.length === 8 ? Math.round(n(6) / 255 * 100) / 100 : 1;
  return `rgb(${n(0)} ${n(2)} ${n(4)}${a < 1 ? ` / ${a}` : ''})`;
}
