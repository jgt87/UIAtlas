# UI Atlas

Extract the **screens, UI elements and design tokens** of a website, component library or design file into an ordered, browsable atlas.

Point it at a source and it produces, per project:
- **Screens** — a screenshot (or schematic) per page, story, layout, artboard or image, with an element inventory.
- **Design tokens** — the colour palette, type scale, font families/weights, spacing rhythm, radii, shadows and declared variables.
- **Elements** — a catalogue of notable elements with their text and key styles.

Everything is viewed in a local dashboard, and tokens can be exported as a PDF token sheet, W3C design-tokens JSON or CSS variables.

## Install
```
npm install          # installs Playwright and pdf.js (no browser download)
```
Requires Node 20+ and a browser. `PLAYWRIGHT_CHANNEL` picks it:
- `msedge` (default) — Microsoft Edge, preinstalled on Windows.
- `chrome` — an installed Google Chrome (e.g. on macOS/Linux without Edge).
- `chromium` — Playwright's own Chromium, for machines with neither; download it once with `npx playwright install chromium`.

## Sources
| Source | Command | What you get |
|---|---|---|
| Website | `atlas extract <url> [--pages N]` | Pages crawled breadth-first on the same origin; tokens from **computed** styles (what the browser actually applied). |
| Storybook (deployed) | `atlas storybook <url> [--pages N]` | One screen per story, measured inside the story root only — a component-library atlas. |
| Storybook (local build) | `atlas import storybook-static/` | Same, served from the folder for the duration of the import. |
| Local HTML / SVG | `atlas import page.html` · `atlas import logo.svg` · `atlas import site/` | Like a website; a folder is crawled from its `index.html`, never outside the folder. SVG fills and strokes count as colours. |
| PowerPoint template | `atlas import template-package/` or `.zip` | Via a [Retheme](https://github.com/jgt87/Retheme) package: layouts as screens, theme colours with slot and role (`accent1 · primary`), placeholders and assets as elements. |
| Design-token JSON | `atlas import tokens.json` or a folder | W3C DTCG, Tokens Studio (incl. multi-file exports) and Style Dictionary, with aliases resolved. Tokens only, no screens. |
| Images | `atlas import screenshot.png` or a folder | Each image as a screen and a palette of its deliberate flat colours (see below). |
| PDF | `atlas import brand-guide.pdf [--pages N]` | Each page rendered as a screen; fonts, text sizes, text and fill colours read from the PDF itself. |
| Sketch | `atlas import file.sketch` | Artboards as schematic SVG screens; swatches, colour assets, text styles, radii and shadows as tokens. |

`atlas import` picks the adapter from the file type or folder contents; override with `--kind retheme|storybook|html|image|tokens|sketch|pdf`. Every command takes `--name <name>` for the output folder (default: the host or file name). Atlases land in `data/<name>/` (git-ignored); importing again into the same name replaces it.

```
node bin/atlas.mjs extract https://example.com --pages 5
node bin/atlas.mjs import brand-guide.pdf
node bin/atlas.mjs serve                                    # open http://127.0.0.1:4300/
```

### Image palettes
Not every differently coloured pixel is a design token. Only pixels in **flat regions** count (a pixel must match its neighbours), which drops anti-aliased edges, text smoothing, gradients, shadows and photo noise. Flat pixels are clustered perceptually (CIELAB), each cluster is reported as its most frequent exact colour, and clusters below a minimum share are dropped. Image colours are labelled *observed* and shown with their share of the image; mostly-photographic images are flagged in the atlas notes.

### PowerPoint via Retheme
Create the package with Retheme: `python -m pptx_template_tool.cli extract Template.pptx -o template-package --zip`. Rendered previews need LibreOffice on the Retheme side; otherwise they are schematic.

## Export
```
node bin/atlas.mjs export <atlas> [--format pdf,json,css] [--out DIR]
```
Writes to `data/<atlas>/exports/` by default:
- `<name>-tokens.pdf` — a printable A4 token sheet: palette, type scale, fonts, weights, spacing, radii, shadows and the source's variables.
- `<name>.tokens.json` — W3C design-tokens format; token names come from the source's labels where it has them (e.g. `accent1`), usage counts are kept under `$extensions`.
- `<name>-tokens.css` — the same tokens as CSS custom properties, plus the variables the source declared.

## Tests
```
npm test
```
Fixtures are generated at test time; the browser-based tests need the same browser as the extractor.

## Architecture
- `bin/atlas.mjs` — CLI; `src/detect.mjs` picks the import adapter.
- Adapters, each producing the same `atlas.json`: `src/web-extract.mjs` (websites, local HTML/SVG; an in-page `collect()` measures computed styles), `src/storybook-import.mjs`, `src/retheme-import.mjs`, `src/tokens-import.mjs`, `src/image-import.mjs`, `src/pdf-import.mjs`, `src/sketch-import.mjs`. Shared helpers in `src/atlas-util.mjs`; `src/zip.mjs` reads zip-based formats without extra dependencies.
- `src/export.mjs` — token sheet PDF, W3C JSON and CSS export.
- `src/serve.mjs` + `viewer/` — read-only local server and the no-build dashboard (vanilla ES modules) that reads `atlas.json`.

## Notes
- A fresh browser context is used (signed out); pages are only measured, never modified. Source files are only read.
- Respect sites' terms and robots when crawling; this is for design/UX review of pages and files you're allowed to access.
