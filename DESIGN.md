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
  scale: [11, 12, 13, 14, 16, 22]   # 22 = the font-sample glyph in the Fonts view and the dialog close glyph
rounded: { control: 8, segment: 7, row: 10, card: 12, dialog: 14 }
sizes:
  topbar: 58
  control-height: 34        # every top-bar control; 44 on coarse pointers
  touch-target: 44
components:
  button-primary: { background: "{colors.ink}", color: "{colors.on-accent}", radius: "{rounded.control}", font: "600 13px ui" }
  button-ghost: { background: "{colors.panel}", border: "{colors.field}", radius: "{rounded.control}" }
  input: { background: "{colors.bg}", border: "{colors.field}", radius: "{rounded.control}" }
  card: { background: "{colors.panel}", border: "{colors.line}", radius: "{rounded.card}" }
  dialog: { width: "min(1100px, 94vw)", form-width: "min(620px, 94vw)", max-height: "92dvh", shadow: "0 24px 60px #0004" }
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
  Test: "no rule removes the focus outline, and one global ring exists".
- **Contrast Floors** — muted text ≥ 4.5:1 and field edges ≥ 3:1 on both `--bg` and `--panel`.
  Test: "muted text >= 4.5:1 and field edges >= 3:1 on both backgrounds".
- **Dynamic Viewport Heights** — `dvh`, never static `vh`, so mobile browser bars don't cut the layout.
  Test: "no static viewport height units".
- **Hover Where It Exists** — every `:hover` sits inside `@media (hover: hover)`, so a tap leaves no stuck state.
  Test: ":hover rules sit only inside @media (hover: hover)".

Not test-enforced (yet):
- **The Colour Is Data Rule** — the chrome uses ink and greys only; colour on screen is the source's.
- **Flat-By-Default** — the only shadow is on dialogs.
- **Invisible Touch Targets** — coarse pointers get a 44px `::after` hit area; nothing drawn changes size.
- **Wide Tables Scroll Themselves** — tables scroll inside `.table-scroll`, long values wrap, the page never scrolls sideways.
- **Paired-Signal** — contrast levels are written out (AA / AAA / Fails AA / Not measurable), never colour alone.

## Motion
None. The viewer has no transitions or animations, so it needs no reduced-motion rule. A transition added later
uses 120–200ms ease-out on opacity/transform only and comes with a global `prefers-reduced-motion` rule.

## Do's / Don'ts
- Do: hide empty token sections; show "not measurable" and FALLBACK instead of guessing.
- Do: give generated controls names (`aria-pressed` on toggles, `aria-label="Close"` on close buttons).
- Don't: brand-coloured chrome, gradients, glass, glowing shadows, status pills that only say "fine".
- Don't: show source text anywhere, even in tooltips or titles (screen titles are URL paths or layer names).

## Known gaps against the CommonShared defaults
Recorded here so they are deliberate, not forgotten. Fixing one is its own change.
- No dark theme yet (CommonShared: light + dark via `[data-theme]`).
- Control height 34px (CommonShared steps: 24/28/32/36) and dialog radius 14px (cards 10–12).
- The font-sample glyph is 22px, outside the 10–20px app scale (`/* type-scale: glyph */` is not marked in the CSS yet).
- Coarse-pointer inputs are not forced to `max(16px, 1em)`.
