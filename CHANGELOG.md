# Changelog

## [Unreleased]

## [0.7.1] - 2026-11-10
### Changed
- Internal restructuring of the extractors, importers, comparison, viewer and CLI for maintainability. Nothing you see changes: every import, export, view and error message was checked to give identical output before and after.

## [0.7.0] - 2026-11-10
### Added
- **+ New** in the viewer: measure a website or Storybook by URL, or import a dropped file (PowerPoint, PDF, Sketch, token JSON, images, HTML/SVG, template .zip), with progress shown and the new atlas opened when done. Only the UI Atlas page itself can start jobs; uploads are imported from a temporary copy that is deleted afterwards.
- **Export** in the viewer: choose PDF, JSON, CSS and/or HTML + CSS for the selected atlas and download the files.
- HTML export (`--format html`): the token sheet as a web page with its CSS file.
- A logo (a folded map with a token swatch), next to the name and as the favicon.

### Changed
- The search box moved from the top bar into the page, above the listed items, centred and white.
- The atlas picker is twice as wide; the top bar wraps on narrow screens instead of overflowing.
- The atlas details (type, counts, date, notes) sit at the bottom of the sidebar.
- Clicking a screen card opens it in a modal (screenshot when stored, size, element counts, colours used) instead of navigating away to the image; Esc, the close button or a click outside closes it, and cards open with Enter/Space too.

### Fixed
- Viewer keyboard focus is visible everywhere: one 2px ring for every control (+ New, Export, screen cards, close buttons, downloads and the drop zone showed none).
- Viewer contrast: muted text is at least 4.5:1 and field edges at least 3:1 on both backgrounds (they were 2.9:1 and 1.2:1).
- Wide tables (Elements, CSS variables, Contrast) scroll inside their own box, and long names and values wrap, so the page no longer scrolls sideways on narrow windows.
- On phones the atlas picker keeps a readable width (it shrank to 24px); the side links stay on one line.
- The top bar controls share one height (34px, 44px on touch screens); other small controls get a 44px hit area on touch screens, and hover styles apply only to devices that hover. Font and type-scale samples wrap instead of widening the page on phones.
- Toggles (HEX/RGB, modes, the New dialog's kinds) report their state to screen readers, the current view is marked in the side links, and long screen titles show in full as a tooltip.

## [0.6.0] - 2026-10-26
### Added
- Component variants: buttons, links, inputs, navigation, symbols and shapes are clustered into style variants (filled, outline, plain, …) with counts and screen coverage — a Components view in the viewer, a section in the PDF sheet, and per-variant tokens in the JSON export (`component.button.filled.background`, `…padding-inline`).
- Flow map: crawled sites record which captured pages link to which; the viewer's Map view draws it as a graph.
- Element samples record border colour and padding.

### Fixed
- Colours defined in modern colour spaces (oklch, lab, `color()`) were dropped; they are now converted to sRGB (Bootstrap 6 lost most of its palette before).
- Contrast pairs at ~1:1 (text on a backdrop that couldn't be measured) are marked *not measurable* instead of failing.

## [0.5.0] - 2026-10-26
### Added
- PowerPoint files (`.pptx`, `.potx`, `.pptm`, `.ppsx`) are read directly — no other tool needed: theme colours with slot names, heading/body fonts, layout backgrounds, placeholders inherited from the master, shapes (fills, borders, rounded corners, shadows), pictures, and the styling used on slides. Slide text is never read.

### Fixed
- A failed import no longer prints a stack trace or local paths (use `--debug` for the full error) and no longer leaves an empty folder in `data/`.

### Changed
- README: the separate template-package route is no longer described; PowerPoint files are imported directly. The viewer labels these atlases "PowerPoint".

## [0.4.0] - 2026-10-26
### Added
- Colour usage: every colour records whether it was used as text, background, border or fill; the JSON export ranks them as `color-usage.text.primary` etc., and unlabelled palette colours are named after the source's own declared variables where they match.
- Line height and letter spacing are measured (websites, Storybook) and exported, including in the typography tokens.
- Contrast: measured text/background pairs with WCAG 2 ratio and level, against the real (composited) backdrop; text over images or gradients is marked rather than guessed. Shown in the viewer and the PDF sheet.
- Modes (`--modes`): extra passes in dark/light colour scheme, at other screen sizes, with an `<html>` attribute (theme switches like `data-bs-theme`, `data-carbon-theme`) or a Storybook global; kept side by side and switchable in the viewer.
- `atlas compare`: brand check against a reference atlas or drift since the previous extraction (`--previous`), with off-reference colours (CIEDE2000), missing fonts/sizes/weights/spacing/radii and near-duplicate colours. Re-extracting keeps the previous atlas in `history/`.
- Polite crawling: robots.txt is honoured, requests to a site are spaced (`--delay`, Crawl-delay), and the browser identifies itself as UI Atlas; `--ignore-robots` for your own sites.
- Fonts are shown in themselves in the viewer and the PDF sheet (web fonts from the source's `@font-face` URLs, else installed fonts), with a FALLBACK tag wherever that isn't possible and *synthesized* on weights a web font lacks.
- HEX / RGB toggle in the viewer.

### Changed
- Typography and text colours are measured on elements that carry text of their own (previously every element, which over-counted inherited values).

## [0.3.0] - 2026-10-26
### Added
- Structured JSON export in the W3C Design Tokens Format 2025.10: grouped primitives (colour objects, `{value, unit}` dimensions, named font weights, shadow objects), a `typography` layer per element role and a `component` layer (background, text colour, radius) that alias the primitives, and the source's declared variables typed and aliased into the palette. The CSS export is generated from the same structure, with aliases as `var()` references.
- Element style samples from websites and Storybook record their font family.

### Changed
- Atlases no longer capture content: element text, page titles, slide/PDF/Sketch text and quoted-string variables are never stored, and screenshots, image copies, rendered PDF pages, layout previews and Sketch schematics are only written with the new `--screenshots` flag. A shared sanitizer enforces this for every adapter.
- Exports (PDF token sheet, JSON, CSS) contain design tokens only: no source name, file name, source type or text.
- Image colour labels no longer include file names.
- The viewer shows compact screen cards when screenshots aren't stored, and an Element column (tag or symbol name) instead of Text.

### Fixed
- SVG text elements report their fill as their colour (was the inherited CSS colour).

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
