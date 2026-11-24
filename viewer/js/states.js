// The states a view can be in besides showing data: loading, failed (with Retry) and a search that matched nothing.
// What a screen reader should hear goes through the two live regions in index.html (#viewStatus, #viewAlert): they
// are mounted once and only their text changes, because a region inserted already holding its message is not read.
import { h } from './dom.js';

// urgent: an error (role=alert); else progress (role=status). An empty text clears the region.
export function announce(text, urgent = false) {
  const region = document.getElementById(urgent ? 'viewAlert' : 'viewStatus');
  if (region && region.textContent !== text) region.textContent = text;
}

export const loadingState = text => { announce(text);
  return h('div', { class: 'empty' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), ` ${text}`); };

// what: what happened; fix: what to do about it; onRetry: try the same thing again
export const errorState = ({ what, fix }, onRetry) => { announce(`${what} ${fix}`, true);
  return h('div', { class: 'state' },
    h('div', { class: 'error-banner' }, h('p', { class: 'error-what' }, what), h('p', { class: 'error-fix' }, fix)),
    h('button', { type: 'button', class: 'ghost-btn', onclick: onRetry }, 'Retry')); };

export const noMatches = (text, onClear) => h('div', { class: 'empty' },
  h('p', { class: 'state-text' }, `No matches for “${text}”.`),
  h('button', { type: 'button', class: 'ghost-btn', onclick: onClear }, 'Clear search'));
