# Template package fixture (invented values)

One template package in the shape the separate Python template tool writes and `src/retheme-import.mjs` reads:

- `template.json` — the manifest: template name, slide geometry, grid, fonts, theme colours with slots, roles and
  usage, assets, and layouts with backgrounds, placeholders (format levels) and static texts.
- `previews/layout-<slug>.png` — one preview per layout. The slug is the Python tool's `preview.py _slug`
  (lower case, runs of anything but `a-z0-9` become `-`, trimmed; `layout` when empty), so `Title Slide` becomes
  `layout-title-slide.png`. These are 33-byte PNG headers (1920 x 1080): the importer only reads the width.
- `other/` — not part of a package; the importer must ignore it. This README is ignored the same way.

`test/retheme-import.test.mjs` reads this folder (and zips it) instead of building a package in code, so the
file names and the manifest shape are written down once. The Python tool's own tests should read the same shape:
keep a copy of this folder there (or generate it there and copy it here), and change both together when the
package format changes.

All names, colours and texts are invented.
