# Changelog

## [Unreleased]

### Changed
- Viewer: why Export is unavailable is now a real tooltip, shown when the button gets keyboard focus, on hover and on a tap, and read by screen readers with the button.
- Viewer: the tokens view's pass switch is called "Mode" like everywhere else; with more than four options it becomes a select drawn like the atlas picker.
- Viewer: switching atlases keeps the page's height while the next one loads; the loading spinner is a drawn ring with a smaller, quieter label.
- Viewer: fonts the viewer can't find are described as "seems not installed", since that is measured, not known; Export ends with "Exported."; the browser tab names the view and the atlas.
- Viewer: closing a dialog or the drawer returns focus without scrolling the page, and Esc while typing with an input method no longer closes them.
- Robots.txt notes ("Crawl-delay of 10 s") keep the number and its unit together.
- Viewer: with reduced motion switched on, the busy spinner keeps turning slowly instead of stopping, so you can still see that work goes on.
- Viewer: on touch screens buttons keep their size and get a larger invisible tap area; only text fields and pickers grow to 44px.
- Viewer: the Export and Create atlas buttons sit in a fixed footer below the dialog's scrolling body, so they are always in view, also with More options open.
- Viewer: spacing follows one 4px scale (2 to 32px) that grows with the browser's text size, so some gaps and paddings moved by a few pixels; corners, layers, the dialog shadow and backdrop come from named tokens.
- Viewer: the sidebar, dialog body, screenshot box, map and job log keep room for their scrollbar, so content no longer shifts when a scrollbar appears.
- Viewer: the focus ring shows only while you move with the keyboard (Tab, the arrow keys). After a click, pressing Shift, Ctrl or Esc no longer lights it up on the button or in a dialog; text fields keep theirs.
- An error that comes without a message now says "The action stopped on an error that gave no message." instead of "Something went wrong."

### Added
- `DECISIONS.md`: every settled design and project decision in one place, each with its id, date, who decided, its goal and the solution chosen; the design notes, agent notes, stylesheet and audit config now point to these entries instead of repeating them.
- `npm run check:a11y`: an automated WCAG A/AA scan (axe-core) of every viewer view with reduced motion, failing on any console error in the same run.

### Fixed
- The CSS and HTML exports are written in one step, like the JSON export, so an interrupted export never leaves a half-written file.
- The "+ New" form checks modes and web addresses by exactly the rules the server uses, so they can't disagree.
- The tests no longer write into `data/`; they run a temporary copy of the program instead.
- Atlas files, the previous atlas and `package.json` are read correctly when an editor saved them with a byte-order mark.

## [0.8.3] - 2026-11-24

### Fixed
- Releases: a check that fails once on a busy machine is run again, and the release notes say when one passed only on its second run; the speed test's own self-check measures over more rounds so load can't fool it.

## [0.8.2] - 2026-11-24

### Added
- Viewer: a skip link, labelled navigation, and focus that moves to the view when you switch views. Below 760px the navigation is a drawer behind a Menu button; the sidebar is wider (240px).
- Viewer: + New offers Dark and Mobile as checkboxes and other modes in a field, with Name, Pages and Modes under More options. Creating an atlas under a name that already exists asks before replacing it.
- Viewer: error states with Retry, a loading state when you switch atlases, and "No matches" with Clear search.
- The command line says when it replaces an existing atlas; the previous version stays in its history.
- Atlases now carry a format number. Atlases made by older versions still open as before.
- When a page, stylesheet or screenshot can't be read, the atlas notes it, so you can see the atlas is partial.
- Clear error messages for wrong options in the viewer and on the command line, naming the option, what it expects and an example.
- `npm run release` makes a release in one step: it waits for green CI, then moves this changelog section, bumps the version, runs every check, tags, packages the source with `SHA256SUMS` and publishes the release.

### Changed
- Viewer: dialogs keep Tab inside, can't be closed while a job runs, and reopening + New shows the running job with what you typed; busy buttons show a spinner and the seconds waited, and errors say what happened and how to fix it.
- Viewer: the atlas picker fits its names, spacing bars line up, the map view is called "Map" everywhere, and tables say "Font size" and "Dimensions" instead of "Size".
- The token sheet titles the variables section the same way the viewer does (for example "CSS variables" for websites).
- The list of export formats, the upload file types and the request header are defined in one place shared by the viewer, the server and the command line.
- Viewer: dialogs are 680px wide with a thin edge, 16px padding and a larger title, placed near the top and scrolling inside (screen details stay wide for the screenshot).
- Viewer: the loading spinner appears only after 300 ms and then stays at least 400 ms, so a fast load doesn't flash it; loading and error messages are announced by screen readers without being repeated.
- Viewer: Export and busy buttons stay focusable when unavailable and say why, instead of being switched off; the page declares its light colour scheme, so native controls match.
- An atlas made by a newer UI Atlas is refused with a clear message instead of being half-read.
- Viewer: taps on buttons and links act at once on touch screens (no double-tap zoom delay).
- Viewer: the HEX/RGB toggle, the measurement-pass switch and the New dialog's source picker are real segmented controls: one tab stop, arrow keys move and select, Home and End jump to the ends.
- Viewer: the atlas picker is drawn like a field, with a drawn chevron; the search field is 34px high like the other top-bar controls; fields keep room for their focus ring, so focusing one moves nothing.

### Fixed
- Starting an atlas under a name already in use no longer silently deletes the existing atlas and its screenshots.
- `atlas.json` is written in one step, so an interrupted run or a reader at the wrong moment never sees a half-written file. The same goes for history snapshots, mode passes, compare reports and the JSON export.
- A malformed web address no longer crashes the viewer server, and a job whose program can't start fails with a message instead of stopping it.
- The server no longer serves files from a folder next to `data/` whose name starts the same way (such as `data-old`).
- Atlas names made only of dots are refused instead of writing outside `data/`.
- A screenshot that could not be taken is no longer listed in the atlas.
- A job checked a different folder than the command line writes for a very long name (the job cut names at 80 characters); there is one folder-name rule now.
- A robots.txt line starting with "constructor:" is no longer read as a rule.
- Kept JSON files are read back and checked before they replace the old file.
- Every function is within the size limits (80 lines, complexity 10); the size baseline is empty, so any new violation fails the lint.

## [0.8.1] - 2026-11-19
### Changed
- Viewer: the dialogs' close button shows a drawn cross instead of a "×" character, the element counts on a screen have a little more room around their text, and a shadow sample is shown without an added outline, so you see only the measured shadow.

## [0.8.0] - 2026-11-15
### Changed
- Requires Node 22 or later (Node 20 is out of support).

### Fixed
- Viewer on phones and tablets: fields are at least 16px so the page no longer zooms in when you tap one, the dialogs' fields and buttons are 44px tall to tap, small print is never below 11px, and the section links wrap onto a second row instead of being cut off at the edge.

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
