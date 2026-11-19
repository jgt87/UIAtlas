// Tiny DOM helpers shared by the viewer modules.
export const h = (tag, attrs = {}, ...kids) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === 'class') e.className = v; else if (k === 'html') e.innerHTML = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (v != null) e.setAttribute(k, v); } for (const k of kids.flat()) if (k != null) e.append(k.nodeType ? k : document.createTextNode(k)); return e; };
// the close cross of a dialog: a drawn icon, not a glyph, so it has no font size of its own
export const closeIcon = () => h('span', { 'aria-hidden': 'true', style: 'display:contents', html: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>' });
// a wide table scrolls inside this box instead of making the page scroll sideways
export const scrollBox = table => h('div', { class: 'table-scroll' }, table);
export const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
