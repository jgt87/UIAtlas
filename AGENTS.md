# AGENTS.md

Guidance for coding agents working in this repository.

## Commands
Node >= 20, ES modules, one dependency (`playwright`). No build step, no linter, no test suite.

```
npm install
node bin/atlas.mjs extract <https-url> [--pages N] [--name NAME]   # writes data/<name>/atlas.json + screens/*.png
node bin/atlas.mjs serve [--port P]                                 # viewer at http://127.0.0.1:4300/ (default)
node bin/atlas.mjs                                                  # usage + list of extracted atlases
```
- The extractor launches an installed browser via `PLAYWRIGHT_CHANNEL` (default `msedge`); Playwright's bundled browsers are not downloaded.
- To check a change end to end: extract a small site (e.g. `https://example.com`), then `serve` and look at the viewer. `data/` already holds sample atlases (`example.com`, `getbootstrap.com`); it is git-ignored and regenerable.

## Architecture
Pipeline: **adapter → `atlas.json` → viewer**. The `atlas.json` schema is the contract; the viewer is source-agnostic so other adapters (native apps, design files) can emit the same schema.

- `bin/atlas.mjs` — CLI; parses `extract`/`serve` and lazy-imports the matching module.
- `src/web-extract.mjs` — the web adapter. `extractSite()` crawls same-origin links breadth-first (URLs normalized: hash stripped, trailing slash trimmed), and per page runs `collect()` through `page.evaluate`, then takes a full-page screenshot named `sha8(url).png`. Per-page token tallies are merged by `mergeTokens()` and trimmed to top-N per category in `finalizeTokens()`.
  - `collect()` executes **inside the browser page**: it must stay self-contained (no references to module scope or Node APIs) and read-only. It returns `{tokens, inventory, elements, links}`.
  - Tokens come from **computed** styles, not declared CSS.
- `src/serve.mjs` — read-only static server bound to 127.0.0.1: `/api/atlases` lists `data/*` folders containing `atlas.json`; `/data/...` serves from `data/`; everything else from `viewer/`. Has a path-traversal guard.
- `viewer/` — no-build vanilla ES modules (`index.html`, `js/app.js`, `css/atlas.css`). Hash routing `#/screens`, `#/tokens`, `#/elements`; a small `h()` DOM helper builds the UI. Edits show up on reload; no server restart needed.

### `atlas.json` shape
```
{ project: { name, source, created, pages, viewport },
  tokens:  { colors, fonts, fontSizes, fontWeights, spacing, radii, shadows: [{value, count}], cssVars: [{name, value}] },
  screens: [{ id, url, title, screenshot: "screens/<id>.png", width, height,
              inventory: { <role>: count }, elements: [{ role, tag, text, bbox, color, bg, fontSize, weight, radius }] }] }
```
Changing this shape means updating both the extractor and `viewer/js/app.js`.

## Notes
- `project.name` is always the start URL's hostname; `--name` only changes the output folder (which is what the viewer lists).
- Extraction uses a fresh, signed-out browser context and only measures pages; keep it that way.
