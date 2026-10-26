# AGENTS.md

Guidance for coding agents working in this repository.

## Commands
Node >= 20, ES modules, dependencies `playwright` and `pdfjs-dist` (both pinned exactly). No build step, no linter.

```
npm install
npm test                                                            # node --test "test/**/*.test.mjs"; one file: node --test test/export.test.mjs
node bin/atlas.mjs extract <https-url> [--pages N] [--name NAME]   # website
node bin/atlas.mjs storybook <https-url> [--pages N] [--name NAME] # deployed Storybook
node bin/atlas.mjs import <file|folder> [--name NAME] [--kind K]   # anything else; kind auto-detected (src/detect.mjs)
node bin/atlas.mjs export <atlas> [--format pdf,json,css] [--out DIR]
node bin/atlas.mjs serve [--port P]                                 # viewer at http://127.0.0.1:4300/ (default)
node bin/atlas.mjs                                                  # usage + list of extracted atlases
```
- The browser comes from `PLAYWRIGHT_CHANNEL`: an installed one (`msedge` default, `chrome`) or `chromium` for Playwright's own download (`npx playwright install chromium`). Most adapters use it, not only the web extractor (images and PDFs are decoded/rendered in a page; the export PDF is printed by it).
- Tests generate their fixtures at test time (or use invented ones under `test/fixtures/`) and write to `os.tmpdir()`, never to `data/`. Fixture content must be invented, never real brand data.
- To check a change end to end: import or extract something small, then `serve` and look at the viewer. `data/` is git-ignored and regenerable. Port 4300 may be taken on this machine; pass `--port`.

## No content (hard rule)
Atlases store design tokens and text-free style samples, never source content. Element `text` is never stored (only read in memory where measuring needs it), page `<title>`s aren't used, variables holding quoted strings are dropped, and screenshots/image copies/rendered pages/schematics are written only with `--screenshots` (`screenshots: true` in adapter options). `writeAtlas()`/`sanitize()` in `src/atlas-util.mjs` enforce this as a safety net for every adapter; new adapters must still not capture content in the first place. Exports (`src/export.mjs`) carry tokens only — no project name, source, file name or text. Tests assert this with `test/helpers/no-content.mjs`.

## Architecture
Pipeline: **adapter → `atlas.json` → viewer / export**. The `atlas.json` schema is the contract; the viewer and export are source-agnostic.

- `bin/atlas.mjs` — CLI. `import` asks `src/detect.mjs` for the kind and lazy-loads the adapter, so one adapter's missing dependency doesn't break the others.
- `src/atlas-util.mjs` — shared by adapters: `launchBrowser()`, `tokenTally()` (`add(key, value, n, label)` → `finalize()` gives the full tokens object), `toHex()` (any colour notation → `#rrggbb[aa]`; `{r,g,b}` objects are read as 0–1 when all channels ≤ 1), `tokenTally().use(kind, hex)` (colour + usage), `prepareOut(outDir, { screenshots })` (clears `screens/`, recreates it only when opted in), `writeAtlas(outDir, atlas, { screenshots })` (sanitizes, archives the previous atlas.json to `history/`, then writes; extra top-level fields such as `contrast`, `fontFaces` pass through), `sanitize()`, `contrastRatio()`/`wcagLevel()`/`contrastReport()`, `slug()`, `sha8()`.
- `src/web-extract.mjs` — websites and local HTML/SVG. `capturePage()` loads one URL, runs `collect()` in the page and (opt-in) screenshots it; screen titles are URL paths; `extractSite()` crawls same-origin links breadth-first (for `file://`, only inside `scope`, and screens record paths relative to it — never absolute local paths).
  - `collect(rootSel)` executes **inside the browser page**: it must stay self-contained (no references to module scope or Node APIs) and read-only. It never reads element text out; it only checks whether an element has text of its own (`hasText`), and typography, text colours and contrast pairs come from those elements. Colours are recorded with their use (`use(kind, hex)`). Contrast uses the composited backdrop (ancestors' backgrounds over white); a background image/gradient on the way makes the pair `overImage` (level `unknown`). For SVG elements the element colour is the `fill`.
  - `capturePage()` also collects `@font-face` rules from loaded stylesheets and inline `<style>` (`parseFontFaces`), kept as `atlas.fontFaces` (Latin subsets of used families; URLs only, never the files; never in JSON/CSS exports). `rootSel` limits measurement and the screenshot to one subtree; element boxes are then made relative to the cropped screenshot.
  - Tokens come from **computed** styles, not declared CSS. Bare SVG documents can't be full-page screenshotted (it hangs), so the viewport is sized to the drawing instead.
- `src/polite.mjs` — robots.txt (RFC 9309) and per-origin pacing: `createGate({ ignoreRobots, delayMs })` → `allow(url)`, `wait(url)`, `notes()`; `userAgentSuffix` is appended to the browser UA (`newMeasuringPage(..., { identify: true })`). Wired into `extractSite` (http(s) only) and deployed Storybooks.
- `src/modes.mjs` — `parseMode()` (`dark`, `mobile`, `<W>x<H>`, `html:<attr>=<v>`, `<global>=<v>`, joined with `+`) and `addModes()`: one extra pass per mode into a temp dir; only its `tokens`/`contrast` are kept in `atlas.modes[spec]`. The CLI's `withModes()` drives it.
- `src/compare.mjs` — `compareAtlases(target, reference)` (CIEDE2000 colours, unit-normalised dimensions, near-duplicates, usage-weighted score), `formatReport()`, `latestSnapshot(atlasDir)` reading `history/`.
- `src/storybook-import.mjs` — reads `index.json` (v7+) or `stories.json` (v6), skips docs entries, measures each story's `iframe.html` inside `#storybook-root`/`#root` via `capturePage`. A local `storybook-static` folder is served on a temporary loopback port (modules don't load from `file://`); the port is never recorded.
- `src/retheme-import.mjs` — PowerPoint via a Retheme template package (`template.json` + `previews/layout-<slug>.png`; github.com/jgt87/Retheme). Layouts → screens, theme colours → `tokens.colors` with a `label` (slot · role), theme slots/fonts/grid → `tokens.cssVars`, placeholders/static texts/assets → elements. Inches are converted to preview pixels (`project.units.ppi`); sizes stay in `pt`. The preview slug must match Retheme's `preview.py _slug`.
- `src/tokens-import.mjs` — W3C DTCG / Tokens Studio / Style Dictionary JSON (file or folder), format detected per token, aliases resolved (cross-set for Tokens Studio, cycle-safe). No screens.
- `src/image-import.mjs` — images decoded in a browser canvas. Palette = flat-region pixels only, clustered in CIELAB, reported as each cluster's mode colour, minimum share; colours carry `share` and an `observed` label.
- `src/pdf-import.mjs` — pdf.js (`pdfjs-dist`) run inside a Playwright page, files served via `page.route` (no server, no network). Pages rendered to PNG; fonts/sizes from text content, colours from the operator list.
- `src/sketch-import.mjs` — `.sketch` zip of JSON read with `src/zip.mjs`; artboards drawn as schematic SVGs (boxes, text, fills — no rotation/paths/masks).
- `src/tokens-json.mjs` — pure (no Node APIs) structured JSON builder: `buildTokens()` (2025.10 format: primitives, then `typography`/`component` layers derived from element samples via `perRole()` and expressed as aliases, then typed `source` variables), `walkTokens()`, `toCssVars()`. Token names may not contain `.`, `{`, `}`; only `px`/`rem` dimensions exist, so other units are converted or listed as `unrepresentable`.
- `src/export.mjs` — `toDtcg()`/`toCss()` (thin wrappers over `tokens-json.mjs`), `sheetHtml()` (the PDF is printed from this HTML), `exportAtlas()` → `data/<name>/exports/`. Output never names the source.
- `src/serve.mjs` — read-only static server bound to 127.0.0.1: `/api/atlases` lists `data/*` folders containing `atlas.json`; `/data/...` serves from `data/`; everything else from `viewer/`. Has a path-traversal guard. It holds its code in memory: restart it after changing `serve.mjs`.
- `viewer/` — no-build vanilla ES modules (`index.html`, `js/app.js`, `js/dom.js` (`h`, `esc`), `js/kinds.js` per-kind labels, `js/contrast.js`, `js/fonts.js` (web-font loading, `fontStatus`, FALLBACK tag), `js/color-format.js` (HEX/RGB toggle, remembered in localStorage), `css/atlas.css`). Hash routing `#/screens`, `#/tokens`, `#/elements`; a small `h()` DOM helper builds the UI. Edits show up on reload.

### `atlas.json` shape
```
{ project: { name, kind, source, created, pages, viewport, screenshots: boolean, notes?: [string] },
  tokens:  { colors, fonts, fontSizes, fontWeights, lineHeights, letterSpacings, spacing, radii, shadows: [{value, count, label?, share?}], cssVars: [{name, value}] },
            // colors[].usage?: { text, background, border, fill } counts; lineHeights are unitless ratio strings ('1.5')
  contrast?: [{ fg, bg, large, count, ratio, level: 'AAA'|'AA'|'fail'|'unknown', overImage? }],
  fontFaces?: [{ family, url, weight, style, unicodeRange? }],
  modes?: { [spec]: { options, tokens, contrast } },
  screens: [{ id, url, title, purpose?, screenshot: "screens/<file>" | null, width, height,
              inventory: { <role>: count }, elements: [{ role, tag, name?, bbox: {x,y,w,h}, color, bg, fontSize, weight, radius, font? }] }] }
```
- `project.kind`: `web`, `file`, `storybook`, `pptx`, `tokens`, `image`, `pdf`, `sketch`. New kinds need an entry in `viewer/js/kinds.js` and `src/export.mjs` `KIND_LABEL`.
- `project.source` is a URL or a **base name only** — never a full local path (repos and atlases get shared).
- `screenshot` is `null` unless `--screenshots` was given; then it may be `.png`, `.jpg`, `.svg` etc. `bbox` is in the (would-be) screenshot's pixel space. `name` is only a design-system name (a Sketch symbol), never layer text.
- Changing this shape means updating every adapter, `viewer/js/app.js` and `src/export.mjs`. The viewer hides empty token sections and opens token-only atlases on the tokens view.

## Notes
- For websites `project.name` is the start URL's hostname; `--name` only changes the output folder (which is what the viewer lists).
- Extraction uses a fresh, signed-out browser context and only measures pages; source files are only read. Keep it that way.
