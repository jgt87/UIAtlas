// Picks the adapter for `atlas import <path>` from the file extension or folder contents.
import { readdirSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { readZip } from './zip.mjs';

const IMAGE = /\.(png|jpe?g|webp|gif|avif|bmp)$/i;

// a folder: a known marker file first, else the first kind of file it holds
function folderKind(src) {
  const has = f => existsSync(path.join(src, f));
  if (has('template.json')) return 'retheme';
  if (has('iframe.html') && (has('index.json') || has('stories.json'))) return 'storybook';
  const files = readdirSync(src);
  if (files.some(f => /\.html?$/i.test(f))) return 'html';
  if (files.some(f => IMAGE.test(f))) return 'image';
  if (files.some(f => /\.json$/i.test(f))) return 'tokens';
  return null;
}

// single files by extension, in this order; a .zip is only a Retheme package when it holds a template.json
const BY_EXTENSION = [
  [/^\.sketch$/, 'sketch'], [/^\.(pptx|potx|pptm|potm|ppsx|ppsm)$/, 'pptx'], [/^\.pdf$/, 'pdf'], [/^\.json$/, 'tokens'],
  [/^\.(svg|html|htm)$/, 'html'], [IMAGE, 'image'],
];
function fileKind(src) {
  const ext = path.extname(src).toLowerCase();
  if (ext === '.zip') return [...readZip(src).keys()].some(k => /(^|\/)template\.json$/.test(k)) ? 'retheme' : null;
  return BY_EXTENSION.find(([re]) => re.test(ext))?.[1] ?? null;
}

export const detectKind = src => statSync(src).isDirectory() ? folderKind(src) : fileKind(src);

export const KINDS = ['pptx', 'retheme', 'storybook', 'html', 'image', 'tokens', 'sketch', 'pdf'];
