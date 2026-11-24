// What the views compute from an atlas before they draw it: tallies, bar widths, the dark-stage test and the format
// check. No DOM here, so Node tests import this module directly (test/viewer-view-model.test.mjs).
import { ATLAS_FORMAT } from './shared.js';

// The colours one screen's element samples use (text, background, border), most used first: [[hex, count]].
export function colorTally(elements = [], limit = 16) {
  const used = new Map();
  for (const e of elements) for (const c of [e.color, e.bg, e.border]) if (c) used.set(c, (used.get(c) || 0) + 1);
  return [...used].sort((a, b) => b[1] - a[1]).slice(0, limit);
}

// The spacing scale smallest first, each with its bar width in px: proportional to the largest value, at most
// `span` px, never under 6px so the smallest step stays visible.
export function spacingBars(spacing = [], span = 240) {
  const max = Math.max(...spacing.map(s => parseFloat(s.value)), 1);
  return spacing.slice().sort((a, b) => parseFloat(a.value) - parseFloat(b.value))
    .map(s => ({ ...s, width: Math.max(6, parseFloat(s.value) / max * span) }));
}

// Element rows per role, most common first: [[role, count]].
export function roleCounts(rows = []) {
  const n = new Map();
  for (const r of rows) n.set(r.role, (n.get(r.role) || 0) + 1);
  return [...n].sort((a, b) => b[1] - a[1]);
}

// Light text (#rrggbb, perceived brightness over 186 of 255): drawn on the dark stage when the sample has no
// background of its own, or it would vanish on the pale one.
export function isLight(hex) {
  const s = String(hex || '');
  if (!/^#[0-9a-f]{6}/i.test(s)) return false;
  const n = parseInt(s.slice(1, 7), 16);
  return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) > 186;
}

// null when the viewer can read this atlas.json (no marker = format 0, or 1), else what to tell the person.
export function formatProblem(doc, name) {
  const format = doc?.format ?? 0;
  if (Number.isInteger(format) && format >= 0 && format <= ATLAS_FORMAT) return null;
  return Number.isInteger(format) && format > ATLAS_FORMAT
    ? { what: `This atlas was made by a newer UI Atlas (format ${format}); this viewer reads format ${ATLAS_FORMAT} and older.`, fix: 'Update UI Atlas and reload this page, or pick another atlas above.' }
    : { what: `The atlas ${name} has an unreadable format marker.`, fix: 'Extract or import it again, or pick another atlas above.' };
}
