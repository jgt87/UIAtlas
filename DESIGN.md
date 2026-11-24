---
# The viewer's own palette (viewer/css/atlas.css :root). Light only for now; see "Known gaps".
colors:
  bg: "#f6f7f9"            # page
  panel: "#ffffff"         # top bar, sidebar, cards, dialogs
  ink: "#14161a"           # text; also the accent and the focus ring
  ink-2: "#5b6370"         # secondary text
  ink-3: "#646c78"         # muted text: >= 4.5:1 on bg and panel (test-enforced)
  line: "#e6e8ec"          # dividers, card edges
  line-2: "#eef0f3"        # inner dividers, nav hover
  field: "#838b97"         # field and control edges: >= 3:1 on bg and panel (test-enforced)
  accent: "{colors.ink}"   # monochrome: the active nav item, primary button and "on" toggles are ink
  on-accent: "#ffffff"
  backdrop: "#14161ab3"    # dialog backdrop
typography:
  ui: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
  mono: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace"
  body: 14
  scale: [11, 12, 13, 14, 16, 22]   # 22 = the font-sample glyph in the Fonts view
rounded: { control: 8, segment: 6, row: 10, card: 12, dialog: 14 }   # segment = the 8px track minus its 2px padding
sizes:
  topbar: 58
  control-height: 34        # every top-bar control; 44 on coarse pointers
  touch-target: 44
components:
  button-primary: { background: "{colors.ink}", color: "{colors.on-accent}", radius: "{rounded.control}", font: "600 13px ui" }
  button-ghost: { background: "{colors.panel}", border: "{colors.field}", radius: "{rounded.control}" }
  input: { background: "{colors.bg}", border: "{colors.field}", radius: "{rounded.control}" }
  card: { background: "{colors.panel}", border: "{colors.line}", radius: "{rounded.card}" }
  dialog: { width: "min(680px, 100vw - 32px)", details-width: "min(1100px, 100vw - 32px)", top: "12dvh", max-height: "72dvh", border: "1px line", padding: 16, title: "18px/600", body: 14, shadow: "0 24px 60px #0004" }
z-index:
  topbar: 10                # sticky top bar; dialogs use the native top layer
---

# Design — UI Atlas viewer

## Overview
Creative North Star: **"Quiet Instrument"**. The viewer is a measuring tool: white panels on a pale grey page,
ink-black text and controls, thin grey lines for structure. All colour on screen belongs to the measured source
(swatches, samples, fonts, screenshots), so the chrome is strictly monochrome.

Register: **app** (dense tool) for every surface. No brand surfaces.

Tokens live in `viewer/css/atlas.css` `:root`. Components use those variables. The literal colours left in the CSS
are `#fff` (text on ink fills, and the white behind screenshots and the search box), `#14161a` (the dark stage for
light component samples, equal to `--ink`), the dialog shadow and the backdrop.

## Named Rules
Rules enforced by `test/viewer-css.test.mjs` use the same names there and in AGENTS.md:
- **One Focus Ring** — one global `:focus-visible` (2px solid ink, 2px offset); no rule removes the outline.
  Test: "One Focus Ring: no rule removes the focus outline, and one global ring exists".
- **Contrast Floors** — muted text ≥ 4.5:1 and field edges ≥ 3:1 on both `--bg` and `--panel`.
  Test: "Contrast Floors: muted text >= 4.5:1 and field edges >= 3:1 on both backgrounds".
- **Dynamic Viewport Heights** — `dvh`, never static `vh`, so mobile browser bars don't cut the layout.
  Test: "Dynamic Viewport Heights: no static viewport height units".
- **Hover Where It Exists** — every `:hover` sits inside `@media (hover: hover)`, so a tap leaves no stuck state.
  Test: "Hover Where It Exists: :hover rules sit only inside @media (hover: hover)".
- **Motion** — see Motion below.
  Test: "Motion: every transition or animation stops under prefers-reduced-motion".

Not test-enforced (yet):
- **The Colour Is Data Rule** — the chrome uses ink and greys only; colour on screen is the source's.
- **Flat-By-Default** — the only shadow is on dialogs. A shadow token sample is the source's shadow on a plain
  white box, with no edge added. Dialog close buttons carry a drawn 16px cross (`closeIcon()` in `viewer/js/dom.js`).
- **Invisible Touch Targets** — coarse pointers get a 44px `::after` hit area; nothing drawn changes size.
- **Wide Tables Scroll Themselves** — tables scroll inside `.table-scroll`, long values wrap, the page never scrolls sideways.
- **Paired-Signal** — contrast levels are written out (AA / AAA / Fails AA / Not measurable), never colour alone.
- **The Sample Is The Source's** — the contrast table's "Aa" sample and the component samples draw the source's own
  measured colours, so a failing pair is shown under 4.5:1 on purpose (marked in the CSS; the accessibility scan
  leaves `.contrast .sample` and `.variant-sample` out). The current nav item is an ink fill (accent = ink), which the
  element check accepts with this reason.

## Layout
- **Sidebar** 240px. Below 760px the side navigation is a drawer behind the top bar's Menu button (operator,
  2026-11-24): focus moves into it, Esc and the backdrop close it and return focus to Menu.
- **HEX/RGB stays in the top bar** (operator, 2026-11-24): the notation applies to every view that shows a colour,
  so it sits with the other global controls, not in one view.
- **Feedback:** errors appear in an error banner (role=alert, ink edge) saying what happened and the fix, never in
  the progress line. Busy buttons keep their width and show a spinner; waits with no visible progress show the
  seconds waited. Lists and searches have loading, error (with Retry) and "No matches" states. Loading and errors
  are announced through two live regions that stay mounted (`#viewStatus`, `#viewAlert`). The loading spinner
  appears only after 300ms and then stays at least 400ms (`viewer/js/loading-timing.js`), so a fast load never
  flashes it. Unavailable controls are `aria-disabled` (still focusable, with a title saying why), never `disabled`.
- **Dialogs:** 680px wide (screen details 1100px, so the screenshot keeps its width), top at 12dvh, at most 72dvh with
  the body scrolling, 1px line edge, 16px padding, 18px/600 title, 14px body.

## Motion
Two motions only: the narrow-screen drawer slides in 180ms ease-out (transform), and a busy button shows a spinner.
A global `prefers-reduced-motion: reduce` rule stops both.

## Do's / Don'ts
- Do: hide empty token sections; show "not measurable" and FALLBACK instead of guessing.
- Do: give generated controls names (`aria-label="Close"` on close buttons). Segmented controls (HEX/RGB, the
  measurement pass, the New dialog's source) are radiogroups with `aria-checked`, one tab stop and arrow keys, all
  built by `viewer/js/segmented.js`.
- Do: fields and selects keep a transparent 2px outline at rest, so focus only colours the ring in (One Focus Ring);
  the atlas picker is drawn like a field, with a drawn chevron instead of the native arrow.
- Don't: brand-coloured chrome, gradients, glass, glowing shadows, status pills that only say "fine".
- Don't: show source text anywhere, even in tooltips or titles (screen titles are URL paths or layer names).

## Known gaps against the CommonShared defaults
Recorded here so they are deliberate, not forgotten. Fixing one is its own change.
- No dark theme yet (CommonShared: light + dark via `[data-theme]`).
- Control height 34px (CommonShared steps: 24/28/32/36) and dialog radius 14px (cards 10–12).
- The font-sample glyph is 22px, outside the 10–20px app scale (marked `/* design: */` in the CSS).
- The screen-details dialog is 1100px wide (CommonShared: 680px) so the screenshot keeps its width; marked `design:`.
- Coarse-pointer inputs are not forced to `max(16px, 1em)`.
