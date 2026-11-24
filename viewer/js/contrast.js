// Contrast section of the tokens view: measured text/background pairs with their WCAG 2 ratio and level.
import { h, scrollBox } from './dom.js';
import { fmtColor } from './color-format.js';

const LEVEL = { fail: 'Fails AA', AA: 'AA', AAA: 'AAA', unknown: 'Not measurable' }; // over an image/gradient, or a backdrop that wasn't seen

export function contrastSection(list) {
  if (!list?.length) return [];
  const rated = list.filter(c => c.level !== 'unknown'), fails = rated.filter(c => c.level === 'fail').length;
  const rows = list.map(c => h('tr', { class: c.level === 'fail' ? 'fail' : '' },
    // a specimen of the measured pair in the source's own colours, even when they fail: an image of the pair
    // (role=img); its values and level are written out in the next cells
    h('td', {}, h('span', { class: 'sample', role: 'img', 'aria-label': `Sample: ${c.fg} text on ${c.bg}`, style: `color:${c.fg};background:${c.bg}` }, 'Aa')),
    h('td', { class: 'mono' }, h('span', { class: 'dot', style: `background:${c.fg}` }), fmtColor(c.fg)),
    h('td', { class: 'mono' }, h('span', { class: 'dot', style: `background:${c.bg}` }), fmtColor(c.bg), c.overImage ? ' + image' : ''),
    h('td', { class: 'mono' }, c.level === 'unknown' ? '—' : `${c.ratio}:1`),
    h('td', {}, LEVEL[c.level] || c.level, c.large ? h('small', {}, ' large text') : null),
    h('td', { class: 'count' }, `${c.count}×`)));
  return [h('h2', { class: 'sec' }, `Contrast (${fails} of ${rated.length} pairs fail WCAG AA)`),
    scrollBox(h('table', { class: 'tbl contrast' }, h('thead', {}, h('tr', {}, ['', 'Text', 'Background', 'Ratio', 'Level', 'Seen'].map(x => h('th', {}, x)))), h('tbody', {}, rows)))];
}
