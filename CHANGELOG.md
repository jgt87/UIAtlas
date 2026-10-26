# Changelog

## [Unreleased]

## [0.2.0] - 2026-10-26
### Added
- `atlas import <package>`: turns a Retheme PowerPoint template package (folder or .zip) into an atlas — layouts as screens, theme colours with their slot and role, fonts and type sizes, and placeholders/static texts/assets as elements.
- `atlas import` detects the source type, and new adapters cover local HTML/SVG files and folders, local Storybook builds, W3C/Tokens Studio/Style Dictionary design-token JSON, images (flat-colour palettes, labelled as observed), PDFs (rendered pages, fonts, text and fill colours) and Sketch files (schematic artboards, swatches, text styles). `--kind` overrides detection.
- `atlas storybook <url>`: measures every story of a deployed Storybook inside its story root.
- `atlas export <atlas>`: printable PDF token sheet, W3C design-tokens JSON and CSS variables.
- Atlases record their source in `project.kind` and may carry `notes`; the viewer names screens per source (layouts, stories, artboards, pages…), shows notes, colour shares for images, and opens token-only atlases on their tokens.
- SVG fill and stroke colours are measured, on websites too.
- `npm test` runs the test suite.
- `PLAYWRIGHT_CHANNEL=chromium` runs the extractor on Playwright's own Chromium, for machines without Edge or Chrome.

### Fixed
- Corner radii read all four corners (e.g. `8px 8px 0px 0px` for a tab) and keep percentages (`50%` circles were recorded as `50px`).
- Screen cards no longer render as blue underlined links.
- The viewer hides token sections that have no values.
- README described `PLAYWRIGHT_CHANNEL` backwards; it now lists the requirements and each browser option.

## [0.1.0] - 2026-10-26
### Added
- `atlas extract`: crawls same-origin pages with a headless browser and writes screenshots, a per-page element inventory and design tokens (colours, type, spacing, radii, shadows, CSS variables) from computed styles into `data/<name>/atlas.json`.
- `atlas serve`: local read-only viewer with Screens, Design tokens and Elements views.
