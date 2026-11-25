---
paths:
  - "**/*{Splitter,splitter,SplitPane,split-pane,SplitView,split-view,ResizeHandle,resize-handle,Resizable,resizable,PanelGroup,panel-group}*.{tsx,jsx,ts,js,vue,svelte,css,scss,html}"
status: current
verified_by:
  - "templates/ui-kit/kit/test/splitter.test.mjs"
  - "templates/ui-kit/examples.html#el-splitter"
---
<!-- managed by __CommonShared/rules/elements/el-splitter.md; sha256:98beb345021e846d; edit it there, put project rules in project-*.md -->
# Splitter rules

Shared defaults from CommonShared. The project's own `.claude/rules/project-*.md`, AGENTS.md,
DESIGN.md and PRODUCT.md win on conflict.

## Look
- The bar is at least 6px across with a 1px `--border` hairline; `--border-strong` on hover, `--accent` while dragging. (docs/22 Splitter)
- The hit area reaches past the bar by an invisible pseudo-element: 4px a side on fine pointers, 10px on coarse. (docs/02 §2)
- `col-resize` between side-by-side panes, `row-resize` between stacked ones, on the whole split while dragging. (docs/02 §1)
- Each pane scrolls inside itself; the sized pane has a `flex-basis`, the other takes the rest. (docs/22 Splitter)

## Behaviour
- Drag with Pointer Events and `setPointerCapture`; the pane follows the pointer with no transition. (docs/02 §2)
- Esc and `pointercancel` during a drag restore the size from its start. (docs/02 §2)
- Arrows step 8–16px (Shift: bigger), Home/End go to the limits; mirrored under RTL. (docs/22 Splitter)
- Enter collapses the pane to its minimum and restores the size it had. (docs/22 Splitter)
- Double-click resets the pane to its default size. (docs/22 Splitter)
- Every pane has a minimum that keeps its content usable; the maximum leaves the other pane its minimum. (docs/22 Splitter)
- A smaller window re-clamps the sizes but keeps the chosen size for when room returns. (docs/22 Splitter)
- Persist the size per split; read and write storage in `try/catch`. (docs/22 Splitter)
- Send one change per finished drag or key press, never one per pointer move. (docs/22 Splitter)

## Accessibility
- `role="separator"`, focusable, named, with `aria-valuenow`, `aria-valuemin`, `aria-valuemax` and `aria-orientation`. (docs/22 Splitter)
- `aria-controls` names the pane it sizes; a disabled splitter uses `aria-disabled`, stays focusable and resizes nothing. (docs/22 Splitter)

## Uses
- Resize cursors and hit slop from the interaction rules. (docs/02 §1, §2)
- App shell, Drawer — sidebars, inspectors and resizable side panels. (docs/22 Splitter)
