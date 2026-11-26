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
  backdrop: "#14161ab3"    # the one backdrop: dialogs and the narrow-screen drawer
typography:
  ui: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
  mono: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace"
  body: 14
  scale: [11, 12, 13, 14, 16, 22]   # 22 = the font-sample glyph in the Fonts view
  uppercase-labels: true            # opt-in: section labels (h2.sec), table heads and the FALLBACK tag (see Typography)
# CSS --space-1 … --space-7 in rem (2 4 8 12 16 24 32px); every padding, margin and gap uses them
spacing: [2, 4, 8, 12, 16, 24, 32]
# CSS --radius-<name>; sm = the FALLBACK tag, inner = segments (the 8px track minus its 2px padding), badges, tooltip
rounded: { sm: 4, inner: 6, element: 8, container: 10, card: 12, page: 14, full: 999 }
shadow-dialog: "0 24px 60px #0004"   # the only shadow (Flat-By-Default)
sizes:
  topbar: 58
  control-height: 34        # every top-bar control; on coarse pointers only text fields and selects grow to 44
  touch-target: 44
components:
  button-primary: { background: "{colors.ink}", color: "{colors.on-accent}", radius: "{rounded.element}", font: "600 13px ui" }
  button-ghost: { background: "{colors.panel}", border: "{colors.field}", radius: "{rounded.element}" }
  input: { background: "{colors.bg}", border: "{colors.field}", radius: "{rounded.element}" }
  card: { background: "{colors.panel}", border: "{colors.line}", radius: "{rounded.card}" }
  dialog: { width: "min(680px, 100vw - 32px)", details-width: "min(1100px, 100vw - 32px)", top: "12dvh", max-height: "72dvh", border: "1px line", padding: 16, title: "18px/600", body: 14, radius: "{rounded.page}", shadow: "{shadow-dialog}", backdrop: "{colors.backdrop}" }
z-index:                    # CSS --z-<name>; dialogs use the native top layer
  sticky: 10                # the sticky top bar
  tooltip: 15               # inside the top bar's layer (the Export hint), under the drawer
  drawer-backdrop: 20       # below 760px: the backdrop behind the navigation drawer
  drawer: 30                # below 760px: the navigation drawer
  skip-link: 40             # the skip link, above everything when it has focus
---

# Design — UI Atlas viewer

## Overview
Creative North Star: **"Quiet Instrument"**. The viewer is a measuring tool: white panels on a pale grey page,
ink-black text and controls, thin grey lines for structure. All colour on screen belongs to the measured source
(swatches, samples, fonts, screenshots), so the chrome is strictly monochrome.

Register: **app** (dense tool) for every surface. No brand surfaces.

Tokens live in `viewer/css/atlas.css` `:root`. Components use those variables: text on ink fills is `--on-accent`,
spacing is `--space-*`, radii are `--radius-*`, layers are `--z-*`, and dialogs take `--shadow-dialog` and the one
`--backdrop`. The literal colours left in the CSS are `#fff` (the white behind screenshots and the search box) and
`#14161a` (the dark stage for light component samples, equal to `--ink`).

## Typography
Uppercase labels are opted in (D-012): the section labels (`h2.sec`, 13px), the table heads (11px) and the 10px
FALLBACK tag are uppercase with letter-spacing; everything else is sentence case. Each of those CSS lines carries a
`ui-rules: D-012` note.

## Named Rules
Rules enforced by `test/viewer-css.test.mjs` use the same names there and in AGENTS.md:
- **One Focus Ring** — one global `:focus-visible` (2px solid ink, 2px offset), shown for keyboard navigation:
  no rule removes the outline except one, which hides it while the last input was the pointer
  (`<html data-modality="pointer">`, set by `js/modality.js`); fields a person types in keep theirs.
  Test: "One Focus Ring: no rule removes the focus outline, and one global ring exists".
- **Contrast Floors** — muted text ≥ 4.5:1 and field edges ≥ 3:1 on both `--bg` and `--panel`.
  Test: "Contrast Floors: muted text >= 4.5:1 and field edges >= 3:1 on both backgrounds".
- **Dynamic Viewport Heights** — `dvh`, never static `vh`, so mobile browser bars don't cut the layout.
  Test: "Dynamic Viewport Heights: no static viewport height units".
- **Hover Where It Exists** — every `:hover` sits inside `@media (hover: hover)`, so a tap leaves no stuck state.
  Test: "Hover Where It Exists: :hover rules sit only inside @media (hover: hover)".
- **Motion** — see Motion below.
  Test: "Motion: every transition or animation stops under prefers-reduced-motion, except a .motion-alt calm variant".

Not test-enforced (yet):
- **The Colour Is Data Rule** — the chrome uses ink and greys only; colour on screen is the source's.
- **Flat-By-Default** — the only shadow is on dialogs. A shadow token sample is the source's shadow on a plain
  white box, with no edge added. Dialog close buttons carry a drawn 16px cross (`closeIcon()` in `viewer/js/dom.js`).
- **Invisible Touch Targets** — on coarse pointers buttons, segments, nav items, the close button and "More options"
  stay drawn as they are (34px controls) and get an invisible 44px `::after` hit area. Hit areas never overlap a
  neighbour: buttons in a row are wider than 44px and 8px or more apart, so theirs only grow up and down; nav items
  sit 12px apart; segments are at least 44px wide. A new control where 44px would overlap stops its area halfway
  to the neighbour, never under the 24px-with-spacing minimum. Only text fields and selects are drawn bigger (see Known gaps).
- **Wide Tables Scroll Themselves** — tables scroll inside `.table-scroll`, long values wrap, the page never scrolls sideways.
- **Paired-Signal** — contrast levels are written out (AA / AAA / Fails AA / Not measurable), never colour alone.
- **The Sample Is The Source's** — the contrast table's "Aa" sample and the component samples draw the source's own
  measured colours, so a failing pair is shown under 4.5:1 on purpose (marked in the CSS; the accessibility scan
  leaves `.contrast .sample` and `.variant-sample` out). The current nav item is an ink fill (accent = ink, D-016),
  which the element check accepts with this reason.

## Layout
- **Sidebar** 240px. Below 760px the side navigation is a drawer behind the top bar's Menu button (D-003).
- **HEX/RGB stays in the top bar** with the other global controls (D-004).
- **Feedback:** errors appear in an error banner (role=alert, ink edge) saying what happened and the fix, never in
  the progress line. Busy buttons keep their width and show a spinner; waits with no visible progress show the
  seconds waited. Lists and searches have loading, error (with Retry) and "No matches" states. Loading and errors
  are announced through two live regions that stay mounted (`#viewStatus`, `#viewAlert`). The loading spinner
  appears only after 300ms and then stays at least 400ms (`viewer/js/loading-timing.js`), so a fast load never
  flashes it; while the next atlas loads, the view keeps its height. The spinner is an SVG ring in `currentColor`,
  14px in a button and 16px beside a 12px muted loading label. Unavailable controls are `aria-disabled` (still
  focusable), never `disabled`, with a tooltip saying why (`viewer/js/tooltip.js`: `role="tooltip"` named by
  `aria-describedby`, an ink bubble with 12px text, shown at once on keyboard focus, after 600ms on hover and on a
  tap; no fade).
- **Dialogs:** 680px wide (screen details 1100px, so the screenshot keeps its width), top at 12dvh, at most 72dvh with
  the body scrolling, 1px line edge, 16px padding, 18px/600 title, 14px body. The footer (status and Export / Create
  atlas) is a `<footer>` outside the scrolling body, so the body is the one scroll area (D-006).
- **Tables:** headers stay static while no table is taller than the window (D-017).

## Motion
Two motions only: the narrow-screen drawer slides in 180ms ease-out (transform), and a busy button shows a spinner.
A global `prefers-reduced-motion: reduce` rule stops the drawer; the spinner opts out with `.motion-alt` and keeps
turning slowly, 2.4s a turn (D-009).

## Do's / Don'ts
- Do: hide empty token sections; show "not measurable" and FALLBACK instead of guessing.
- Do: give generated controls names (`aria-label="Close"` on close buttons). Segmented controls (HEX/RGB, the
  mode, the New dialog's source) are radiogroups with `aria-checked`, one tab stop and arrow keys, all
  built by `viewer/js/segmented.js`. They hold at most four options: the mode control becomes a select drawn like the
  atlas picker when Base and the atlas's modes are more (`choice()`).
- Do: fields and selects keep a transparent 2px outline at rest, so focus only colours the ring in (One Focus Ring);
  the atlas picker is drawn like a field, with a drawn chevron instead of the native arrow.
- Don't: brand-coloured chrome, gradients, glass, glowing shadows, status pills that only say "fine".
- Don't: show source text anywhere, even in tooltips or titles (screen titles are URL paths or layer names).

## Known gaps against the CommonShared defaults
Each is a `DECISIONS.md` entry; fixing one is its own change (a new entry that replaces it).
- No dark theme yet (D-013).
- Control height 34px (D-011); `--control-h` carries `ui-rules: D-011`.
- The font-sample glyph is 22px (D-014).
- The screen-details dialog is 1100px wide (D-015).
- On coarse pointers text fields and selects are drawn 44px high, the one exception to Invisible Touch Targets (D-010).