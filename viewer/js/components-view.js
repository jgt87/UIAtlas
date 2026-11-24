// Components view: each role's style variants (atlas.components), drawn as a sample with that variant's styles.
// The sample's label is the role name — no text from the source.
import { h } from './dom.js';
import { fmtColor } from './color-format.js';
import { fontCss } from './fonts.js';
import { isLight } from './view-model.js';

const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const css = st => [st.bg && `background:${st.bg}`, st.color && `color:${st.color}`, `border:1px ${st.border ? `solid ${st.border}` : 'dashed var(--line)'}`,
  st.radius && `border-radius:${st.radius}`, st.fontSize && `font-size:${st.fontSize}`, st.weight && `font-weight:${st.weight}`, st.padding && `padding:${st.padding}`, st.font && fontCss(st.font)].filter(Boolean).join(';');
// light text without a background of its own needs a dark stage to be visible
const stageClass = st => 'variant-stage' + (!st.bg && isLight(st.color) ? ' dark' : '');
const swatch = v => v ? h('span', {}, h('span', { class: 'dot', style: `background:${v}` }), fmtColor(v)) : '—';

// noMatch(): the state for a search that matches no role
export function renderComponents(atlas, q, noMatch) {
  const all = Object.entries(atlas.components || {}), roles = all.filter(([role]) => !q || role.includes(q));
  if (all.length && !roles.length) return [noMatch()];
  if (!roles.length) return [h('div', { class: 'empty' }, 'No component variants in this atlas (they come from buttons, links, inputs, shapes and symbols).')];
  return roles.flatMap(([role, list]) => [
    h('h2', { class: 'sec' }, `${cap(role)} (${list.length} variant${list.length > 1 ? 's' : ''})`),
    h('div', { class: 'variants' }, list.map(v => h('div', { class: 'variant' },
      h('div', { class: stageClass(v.style) }, h('span', { class: 'variant-sample', style: css(v.style) }, cap(role))),
      h('div', { class: 'variant-body' },
        h('div', { class: 'card-title' }, v.name, h('small', { class: 'count' }, `  ${v.count}× · ${v.screens} screen${v.screens > 1 ? 's' : ''} · ${Math.round(v.share * 100)}%`)),
        h('table', { class: 'kv' }, h('tbody', {}, [['Background', swatch(v.style.bg)], ['Text', swatch(v.style.color)], ['Border', swatch(v.style.border)],
          ['Radius', v.style.radius || '—'], ['Type', [v.style.fontSize, v.style.weight, v.style.font].filter(Boolean).join(' · ') || '—'], ['Padding', v.style.padding || '—']]
          .map(([k, val]) => h('tr', {}, h('td', {}, k), h('td', { class: 'mono' }, val))))))))),
  ]);
}
