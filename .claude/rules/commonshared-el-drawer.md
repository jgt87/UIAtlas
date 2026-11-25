---
paths:
  - "**/*{Drawer,drawer,Sheet,bottom-sheet,SidePanel,sidePanel,side-panel}*.{tsx,jsx,ts,js,vue,svelte,css,scss,html}"
status: current
verified_by:
  - "templates/ui-kit/kit/test/sheet.test.mjs"
  - "templates/ui-kit/examples.html#el-drawer"
---
<!-- managed by __CommonShared/rules/elements/el-drawer.md; sha256:6c2341cbdee5a154; edit it there, put project rules in project-*.md -->
# Drawer rules

Shared defaults from CommonShared. The project's own `.claude/rules/project-*.md`, AGENTS.md,
DESIGN.md and PRODUCT.md win on conflict.

## Look
- Side drawers 285–360px wide, capped at `calc(100vw - 24px)`; bottom sheets full width, max ~85dvh. (docs/01 §4, docs/17 §9)
- `--raised` panel (or `--surface` when docked), 1px `--border` on the inner edge; `--shadow-dialog` only when it floats. (docs/21 §7)
- Title 14–16px/600 in a header whose close button keeps its place in every state. (docs/17 §4, docs/19 §5)
- One scroll area with `scrollbar-gutter: stable`; sheets show a small `--border-strong` grab handle. (docs/17 §4, docs/21 §7)
## Behaviour
- Docked (non-modal, page reflows) is the desktop default for inspectors; overlay (modal) is the phone default. (docs/21 §7)
- Enter ≤ 300ms with `--ease-out`, translated from its own edge; exit faster; reduced motion fades only. (docs/19 §7, §10)
- Never animate `width`; transform from the edge or reserve the space. (docs/19 §7, §10)
- Overlay variant: Esc closes, Tab trapped, focus returns; docked variant: Esc closes only when focus is inside. (docs/17 §6, docs/21 §7)
- Sheets dismiss on velocity (~0.11px/ms) or distance, resist past the open position, ignore extra touches mid-drag; the settle keeps the release velocity. (docs/19 §7)
- Every swipe has a close button too. (docs/02 §2)
- A sheet with detents is one panel at its tallest stop; lower detents are `translateY` positions, never a resize. (docs/21 §7)
- On release a sheet settles on the detent nearest ~0.1s of projected velocity; a reversed release returns to its start; past halfway below the lowest it closes. (docs/21 §7, docs/19 §7)
- The body scrolls inside; a drag moves the sheet only from the top of the body's scroll, decided once within ~10px. (docs/21 §7, docs/19 §7)
- Content below the screen at the current detent is `inert`; detent changes never move focus. (docs/21 §7)
- Esc and mobile Back close the top sheet only; unsaved input asks first and a refused close returns to its detent. (docs/21 §7)
- Height from its container's top and bottom offsets, never `100dvh` minus a guessed header. (docs/17 §5)
- On phones the controls stay in place and only the opened panel changes. (docs/17 §9)
## Accessibility
- Overlay variant: `role="dialog"` + `aria-modal="true"` + a label; docked: `role="complementary"` or a labelled region. (docs/21 §7)
- The toggle has `aria-expanded` and `aria-controls`. (docs/21 §7)
## Uses
- Dialog — behaviour of the overlay variant. (docs/21 §5)
- IconButton — the close control. (docs/21 §7)
- Overlay contract — layers, motion, dismissal. (docs/21 §1)
