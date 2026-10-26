# UI Atlas

Extract the **design tokens** of a website, component library or design file into an ordered, browsable atlas.

Point it at a source and it produces, per project:
- **Design tokens** — the colour palette, type scale, font families/weights, spacing rhythm, radii, shadows and declared variables.
- **Screens** — one entry per page, story, layout, artboard or image, with an element inventory (counts per role).
- **Elements** — text-free style samples of notable elements: role, colours, size, weight, radius, font and position.

Everything is viewed in a local dashboard, and tokens can be exported as a PDF token sheet, W3C design-tokens JSON or CSS variables.

## What is stored
UI Atlas captures **design, not content**:
- **Never stored:** text from the source — headings, body copy, button labels, page `<title>`s, slide and PDF text, Sketch text layers — and variables holding quoted strings (copy). Text is only read in memory where needed to measure it (e.g. PDF lines).
- **Stored by default:** design tokens, element counts, text-free style samples, and identifiers such as URL paths, layout/story/artboard names and page numbers.
- **Opt-in with `--screenshots`:** screenshots, copies of imported images, rendered PDF pages, Retheme layout previews and Sketch schematics (which draw the file's text). Without the flag no `screens/` folder is written.
- **Exports** (`atlas export`) contain design tokens only — no source name, file name, URL, screenshots or text, whatever the atlas holds.

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
| Images | `atlas import screenshot.png` or a folder | A palette of each image's deliberate flat colours (see below); the image itself is kept only with `--screenshots`. |
| PDF | `atlas import brand-guide.pdf [--pages N]` | Fonts, text sizes, weights, text and fill colours read from the PDF itself, per page. |
| Sketch | `atlas import file.sketch` | Swatches, colour assets, text styles, radii and shadows as tokens; artboards as screens (schematic drawings with `--screenshots`). |

`atlas import` picks the adapter from the file type or folder contents; override with `--kind retheme|storybook|html|image|tokens|sketch|pdf`. Every command takes `--name <name>` for the output folder (default: the host or file name) and `--screenshots` to also keep screenshots. Atlases land in `data/<name>/` (git-ignored); importing again into the same name replaces it.

```
node bin/atlas.mjs extract https://example.com --pages 5
node bin/atlas.mjs import brand-guide.pdf
node bin/atlas.mjs serve                                    # open http://127.0.0.1:4300/
```

### Image palettes
Not every differently coloured pixel is a design token. Only pixels in **flat regions** count (a pixel must match its neighbours), which drops anti-aliased edges, text smoothing, gradients, shadows and photo noise. Flat pixels are clustered perceptually (CIELAB), each cluster is reported as its most frequent exact colour, and clusters below a minimum share are dropped. Image colours are labelled *observed* and shown with their share of the image (labels never include file names); mostly-photographic images are flagged in the atlas notes.

### PowerPoint via Retheme
Create the package with Retheme: `python -m pptx_template_tool.cli extract Template.pptx -o template-package --zip`. Rendered previews need LibreOffice on the Retheme side; otherwise they are schematic.

## Export
```
node bin/atlas.mjs export <atlas> [--format pdf,json,css] [--out DIR]
```
Writes to `data/<atlas>/exports/` by default:
- `<name>-tokens.pdf` — a printable A4 token sheet titled "Design tokens": palette, type scale, fonts, weights, spacing, radii, shadows and the source's variables. No source name, screenshots or text.
- `<name>.tokens.json` — structured design tokens in the [W3C Design Tokens Format](https://www.designtokens.org/tr/2025.10/format/) (2025.10), importable by Style Dictionary, Tokens Studio and similar tools:
  - **Primitives** — `color` (sRGB colour objects), `font.family`, `font.size`, `font.weight` (named `regular`, `bold`…), `spacing`, `radius`, `shadow` (shadow objects). Names come from the source's labels where it has them (`color.accent1`), otherwise from the value (`spacing.8px`, `color.0f62fe`).
  - **typography** — the most common family/size/weight per element role (`typography.heading`, `typography.button`, or per placeholder type for PowerPoint), as aliases such as `{font.size.24pt}`.
  - **component** — the most common background, text colour and radius per interactive role (`component.button.background` → `{color.0f62fe}`).
  - **source** — the variables the source declared (CSS custom properties, theme slots, token paths), typed and aliased into the palette where they match.
  - Usage counts and shares sit under `$extensions["ui-atlas"]`. The format only has `px`/`rem` dimensions, so `pt` and `in` values are converted to `px` (the original is kept in `$extensions`); values with no token form (e.g. `50%` radii) are listed as `unrepresentable`.
- `<name>-tokens.css` — the same structure as CSS custom properties; aliases become `var()` references (`--component-button-background: var(--color-0f62fe)`).

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
