---
paths:
  - "**/*{Toolbar,toolbar,ToolBar,ActionBar,action-bar,ToolRail,tool-rail}*.{tsx,jsx,ts,js,vue,svelte,css,scss,html}"
status: current
verified_by:
  - "templates/ui-kit/kit/test/overflow.test.mjs"
  - "templates/ui-kit/kit/test/toolbar.test.mjs"
  - "templates/ui-kit/examples.html#el-toolbar"
---
<!-- managed by __CommonShared/rules/elements/el-toolbar.md; sha256:a37e12a7d097f625; edit it there, put project rules in project-*.md -->
# Toolbar rules

Shared defaults from CommonShared. The project's own `.claude/rules/project-*.md`, AGENTS.md,
DESIGN.md and PRODUCT.md win on conflict.

## Look
- A toolbar holds controls that act on one surface or selection; navigation and forms are not toolbars. (docs/22 Toolbar)
- One height for every control in the row; icon buttons 32–40px with 16px glyphs. (docs/17 §1, docs/01 §4)
- Related controls sit in groups split by a 1px `--border` separator. (docs/19 §7)
- Toggles use `aria-pressed` with the `--accent-soft` fill. (docs/01 §5)
- On coarse pointers controls reach `--touch-target` with an invisible `::after`; the bar never reflows. (docs/01 §5)

## Behaviour
- The toolbar is one Tab stop with a roving tabindex; Tab enters on the control used last. (docs/22 Toolbar)
- Left/Right move between controls and wrap; Home/End jump to the ends; Up/Down when vertical. (docs/22 Toolbar)
- Under RTL the arrow keys are mirrored with the reading order. (docs/22 Toolbar)
- A text field or slider inside the bar keeps the arrow keys it needs. (docs/22 Toolbar)
- Too narrow: rare controls move into a "More" menu in the same order; never wrap onto a second row. (docs/22 Toolbar, docs/19 §7)
- Fit is measured from an inert hidden copy before paint; folded items keep their order, names and states in the More menu. (docs/22 Overflow list)
- The primary action never folds; re-measure only on a real size change, with a few px of hysteresis, so resizing never flickers. (docs/22 Overflow list)
- When the focused control folds, focus moves to the More button. (docs/22 Overflow list)
- Unavailable controls stay in place with `aria-disabled`, keep their spot in the arrow order and ignore presses. (docs/17 §4, docs/22 Toolbar)
- Every command in the bar also has a shortcut shown in its tooltip. (docs/22 Toolbar, docs/21 §2)

## Accessibility
- `role="toolbar"` with a name; `aria-orientation` only on vertical bars. (docs/22 Toolbar)
- Every icon button has an `aria-label`; separators are decorative. (docs/22 Toolbar, docs/20 Icon button)
- The More button has `aria-haspopup="menu"` and `aria-expanded`. (docs/22 Toolbar, docs/21 §4)

## Uses
- Icon button, Button, Segmented control — the controls. (docs/22 Toolbar)
- Tooltip, Menu — names with shortcuts, and the More menu. (docs/22 Toolbar)
- Popover — a floating toolbar over a selection. (docs/22 Toolbar)
