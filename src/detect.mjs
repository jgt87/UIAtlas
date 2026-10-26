// Picks the adapter for `atlas import <path>` from the file extension or folder contents.
import { readdirSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { readZip } from './zip.mjs';

const IMAGE = /\.(png|jpe?g|webp|gif|avif|bmp)$/i;

export function detectKind(src) {
  if (statSync(src).isDirectory()) {
    const has = f => existsSync(path.join(src, f));
    if (has('template.json')) return 'retheme';
    if (has('iframe.html') && (has('index.json') || has('stories.json'))) return 'storybook';
    const files = readdirSync(src);
    if (files.some(f => /\.html?$/i.test(f))) return 'html';
    if (files.some(f => IMAGE.test(f))) return 'image';
    if (files.some(f => /\.json$/i.test(f))) return 'tokens';
    return null;
  }
  const ext = path.extname(src).toLowerCase();
  if (ext === '.zip') return [...readZip(src).keys()].some(k => /(^|\/)template\.json$/.test(k)) ? 'retheme' : null;
  if (ext === '.sketch') return 'sketch';
  if (ext === '.pdf') return 'pdf';
  if (ext === '.json') return 'tokens';
  if (ext === '.svg' || ext === '.html' || ext === '.htm') return 'html';
  if (IMAGE.test(ext)) return 'image';
  return null;
}

export const KINDS = ['retheme', 'storybook', 'html', 'image', 'tokens', 'sketch', 'pdf'];
