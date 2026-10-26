# UI Atlas

Extract any website's **screens, UI elements and design tokens** into an ordered, browsable atlas.

Point it at a URL; it drives a headless browser over the site's pages and produces, per project:
- **Screens** — a full-page screenshot and a per-page element inventory (buttons, links, inputs, headings, images, nav).
- **Design tokens** — the real colour palette, type scale, font families/weights, spacing rhythm, radii, shadows and any declared CSS `--variables`, all aggregated from **computed** styles (what the browser actually applied).
- **Elements** — a catalogue of notable elements with their text and key styles.

Everything is viewed in a local dashboard.

## Install
```
npm install          # installs Playwright; uses your system Edge/Chrome (no browser download needed)
```
If Playwright's own browsers aren't downloaded, set `PLAYWRIGHT_CHANNEL` (default `msedge`) to a browser you have installed.

## Use
```
node bin/atlas.mjs extract https://example.com --pages 5    # crawl up to 5 same-origin pages
node bin/atlas.mjs serve                                    # open http://127.0.0.1:4300/
```
- `--name <name>` sets the project folder (default: the hostname).
- `--pages N` follows same-origin links breadth-first up to N pages (default 1).
- Extracted atlases land in `data/<name>/` (git-ignored).

## Architecture
- `src/web-extract.mjs` — the web extractor: Playwright navigation + an in-page `collect()` that measures computed styles and builds the inventory; aggregates tokens across pages into a normalized `atlas.json`.
- `src/serve.mjs` / `bin/atlas.mjs` — static server + CLI.
- `viewer/` — the no-build dashboard (vanilla ES modules) that reads `atlas.json`.

The extractor is one **adapter**. The viewer and the `atlas.json` schema are source-agnostic, so other adapters (native apps, design files) can emit the same schema and reuse the dashboard.

## Notes
- A fresh browser context is used (signed out); pages are only measured, never modified.
- Respect sites' terms and robots when crawling; this is for design/UX review of pages you're allowed to access.
