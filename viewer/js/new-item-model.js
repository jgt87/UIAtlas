// The "+ New" form without the DOM: which modes the checkboxes and the custom field add up to, whether the form can
// be sent, and the request it becomes. Node tests import this module directly.
import { isUploadName, UPLOAD_KINDS_TEXT } from './shared.js';

// The modes most people want, offered as checkboxes; the rest go in the custom field (README "Modes").
export const COMMON_MODES = [['dark', 'Dark colour scheme'], ['mobile', 'Phone size, 390 × 844']];
export const MODES_HINT = 'Comma-separated: light, tablet, wide, 1024x768, html:data-theme=dark, theme=dark; combine with +, e.g. dark+mobile';

// One part of a mode, as src/modes.mjs parseMode() reads it.
const MODE_PART = [/^(dark|light|mobile|tablet|desktop|wide)$/, /^\d{3,4}x\d{3,4}$/, /^html:[\w-]+=[\w.-]*$/, /^[\w-]+=[\w.-]+$/];
export const splitModes = text => String(text || '').split(',').map(m => m.trim()).filter(Boolean);
// the first part of a mode spec parseMode() would refuse, or undefined
export const badModePart = spec => spec.split('+').map(p => p.trim()).find(p => !MODE_PART.some(r => r.test(p)));
// checked common modes + the custom field -> the comma-separated list the server takes, without repeats
export const modesValue = (checked, custom) => [...new Set([...checked, ...splitModes(custom)])].join(',');

const problem = (field, what, fix) => ({ field, what, fix });

function checkFile({ kind, file }) {
  if (kind !== 'import') return null;
  if (!file) return problem('file', 'No file chosen.', 'Drop a file on the box, or click it to choose one.');
  return isUploadName(file.name) ? null : problem('file', 'That file type can’t be imported.', `Choose one of these: ${UPLOAD_KINDS_TEXT}.`);
}

function checkUrl({ kind, url }) {
  if (kind === 'import') return null;
  const text = String(url || '').trim();
  if (!text) return problem('url', 'No URL entered.', 'Enter the full address, e.g. https://example.com');
  let u = null; try { u = new URL(text); } catch { /* not a URL */ }
  return u && /^https?:$/.test(u.protocol) ? null : problem('url', 'That isn’t a web address UI Atlas can open.', 'Enter a full http(s) address, e.g. https://example.com');
}

function checkPages({ pages }) {
  const text = String(pages ?? '').trim(), n = Number(text);
  return !text || (Number.isInteger(n) && n >= 1 && n <= 500) ? null : problem('pages', 'Pages must be a whole number from 1 to 500.', 'Leave it empty to measure one page.');
}

function checkModes({ kind, custom }) {
  if (kind === 'import') return null;
  const bad = splitModes(custom).map(badModePart).find(Boolean);
  return bad ? problem('modes', `“${bad}” isn’t a mode.`, `Use dark, light, mobile, tablet, desktop, wide, <W>x<H>, html:<attribute>=<value> or <global>=<value>, joined with +.`) : null;
}

// -> null when the form can be sent, else the first problem { field, what, fix }
export const validate = input => [checkFile, checkUrl, checkPages, checkModes].map(c => c(input)).find(Boolean) || null;

// The request that starts the job: { path, file } for an upload (raw body), { path, json } for a URL job.
// replace: true answers the server's "already exists" question (409) with yes.
export function jobRequest({ kind, url, file, name, pages, modes, screenshots, replace = false }) {
  const opts = { name: String(name || '').trim(), pages: String(pages || '').trim() };
  if (kind === 'import') {
    const q = new URLSearchParams({ filename: file.name, ...opts, screenshots: screenshots ? '1' : '' });
    if (replace) q.set('replace', '1');
    return { path: `/api/upload?${q}`, file };
  }
  const json = { type: kind, url: String(url).trim(), ...opts, modes, screenshots: !!screenshots };
  if (replace) json.replace = true;
  return { path: '/api/jobs', json };
}
