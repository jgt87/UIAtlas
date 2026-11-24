// Literals the server, the CLI and the viewer share, in one dependency-free module. The viewer loads it
// from viewer/js/; Node imports the same file (src/serve.mjs, src/jobs.mjs, bin/atlas.mjs). Change a value
// here, never a copy: test/shared-literals.test.mjs fails when one of these is written out elsewhere.

// The header the server requires before it starts any work (src/serve.mjs); a page on another origin
// cannot send it without a CORS preflight the server never answers.
export const API_HEADER = 'X-UI-Atlas';

// Export formats: [id, label, what it is], in the order the viewer offers them.
export const EXPORT_FORMATS = [
  ['pdf', 'PDF token sheet', 'printable A4'],
  ['json', 'JSON', 'W3C design tokens'],
  ['css', 'CSS', 'custom properties'],
  ['html', 'HTML + CSS', 'token page with its stylesheet'],
];
export const EXPORT_FORMAT_IDS = EXPORT_FORMATS.map(([id]) => id);

// File types the viewer can upload and the server imports.
export const UPLOAD_EXTENSIONS = ['pptx', 'potx', 'pptm', 'ppsx', 'pdf', 'sketch', 'json', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'avif', 'bmp', 'svg', 'html', 'htm', 'zip'];
export const UPLOAD_ACCEPT = UPLOAD_EXTENSIONS.map((e) => `.${e}`).join(',');
export const isUploadName = (name) => UPLOAD_EXTENSIONS.includes(String(name).split('.').pop().toLowerCase());
// The same types as people name them: the drop box hint, the viewer's "wrong type" fix and the server's 400.
export const UPLOAD_KINDS_TEXT = 'PowerPoint, PDF, Sketch, design-token JSON, images, HTML/SVG or a template .zip';

// The atlas.json shape version: src/atlas-file.mjs writes and reads it, the viewer refuses a newer one.
// 0 = a file without the field (the shape before the marker; identical otherwise). Raise it only when a reader
// would misread the old shape, and teach every reader the old one.
export const ATLAS_FORMAT = 1;
