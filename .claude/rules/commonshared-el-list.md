---
paths:
  - "**/*{List,ListRow,ListItem,Row}*.{tsx,jsx,ts,js,vue,svelte,css,scss,html}"
  - "**/{list,list-row,list-item,row}.{tsx,jsx,ts,js,vue,svelte,css,scss,html}"
status: current
verified_by:
  - "templates/ui-kit/kit/test/swipe.test.mjs"
  - "templates/ui-kit/kit/test/reorder.test.mjs"
  - "templates/ui-kit/examples.html#el-list"
---
<!-- managed by __CommonShared/rules/elements/el-list.md; sha256:503f29383db70bae; edit it there, put project rules in project-*.md -->
# List rules

Shared defaults from CommonShared. The project's own `.claude/rules/project-*.md`, AGENTS.md,
DESIGN.md and PRODUCT.md win on conflict.

## Look
- Every row shares one grid template with fixed tracks; optional content leaves its track empty. (docs/19 §6)
- One-line rows 32–36px, two-line 48–56px, ≥ 44px on coarse pointers. (docs/22 List)
- Title 13–14px `--ink`, subtitle 12px `--muted` 4–6px below; text ≥ 12px from the row edge. (docs/19 §5, §6)
- The title keeps its width; the description truncates with the full text in `title`. (docs/17 §3)
- Hover `--hover` and selection `--accent-soft` are inset and rounded; negative margins go on the list. (docs/19 §6)
- Rows sit in one container, not a card each; dividers only mark groups. (docs/19 §4)
- Meta goes in separate tracks, never joined with middle dots. (docs/19 §4)

## Behaviour
- The whole row is one button or link; secondary actions are separate and visible on focus and touch. (docs/22 List, docs/02 §7)
- Selectable lists use arrows, Space/Enter, Home/End and type-ahead; Shift/Ctrl extend and add. (docs/02 §2)
- Reorder starts only from a named grip handle, after 4px, with the pointer captured. (docs/22 Reorder, docs/02 §2)
- While a row moves it stays in place, dimmed; an `--accent` insertion line marks the target and the other rows stay put. (docs/22 Reorder)
- The order commits once, on the drop; Esc and `pointercancel` restore it at once. (docs/22 Reorder)
- Keyboard: Space picks up, Up/Down move the same line, Space drops, Esc cancels; Alt+Up/Down moves one place. (docs/22 Reorder)
- Focus stays on the handle during and after a move; each step is announced politely with the position. (docs/22 Reorder)
- A row changed by a sync or another person highlights once (`--accent-soft`, ≤ 600ms); never for the person's own action. (docs/19 §7)
- Long lists scroll inside themselves and virtualise past a few hundred rows. (docs/17 §3)
- Live lists follow new items only while the user is within 80px of the bottom. (docs/17 §10a)
- Every list has empty, loading (skeleton rows) and error states. (docs/01 §6)
- `ul`/`li`, or `listbox`/`option` with `aria-selected`; `aria-current` for navigation. (docs/22 List)
- Swipe actions are a touch shortcut only: every swiped action is also in the row's visible `⋯` menu. (docs/22 Swipe actions, docs/02 §2)
- A swipe decides its axis within ~10px and keeps it; mouse drags and the wheel never swipe a row. (docs/19 §7, docs/22 Swipe actions)
- Release opens on a fast flick or past half the panel, else closes; a flick never fires an action; one row open at a time. (docs/22 Swipe actions)
- A swiped delete removes the row at once with an Undo toast; no swipe-delete where undo is impossible. (docs/22 Swipe actions, docs/21 §9)
- Under reduced motion swiped rows jump open or closed and removed rows fade; the drag still follows the finger. (docs/19 §7, docs/22 Swipe actions)
- A closed swipe panel is out of the tree and tab order; open, it holds real buttons named with the row. (docs/22 Swipe actions)

## Uses
- Avatar, Icon — the leading slot. (docs/22 List)
- Badge, Checkbox, Menu — trailing state, selection and row actions. (docs/22 List)
- Skeleton, Empty state, Scrollbar — the states and the inner scroll. (docs/22 List)
