---
paths:
  - "**/*{Board,Kanban,kanban,BoardColumn,KanbanColumn}*.{tsx,jsx,ts,js,vue,svelte,css,scss,html}"
status: current
verified_by:
  - "templates/ui-kit/examples.html#el-board"
---
<!-- managed by __CommonShared/rules/elements/el-board.md; sha256:ba7670686428d008; edit it there, put project rules in project-*.md -->
# Board rules

Shared defaults from CommonShared. The project's own `.claude/rules/project-*.md`, AGENTS.md,
DESIGN.md and PRODUCT.md win on conflict.

## Look
- Columns 272–320px wide with a 12px gap; the board scrolls sideways, each column inside itself. (docs/22 Board)
- Column header: title 14–16px / 600, an 11px count badge and a `⋯` menu. (docs/22 Board, docs/19 §5)
- Cards use the compact Card variant; a grabbed card lifts with `--shadow-menu`, no tilt or scale. (docs/22 Board, docs/19 §4)
- Drop target: a 2px `--accent` line in the gap; a dashed slot only for boards that open the gap, with hysteresis. (docs/22 Reorder, docs/02 §7)
- Over a WIP limit the count takes the warn role with an icon and a word. (docs/01 §1)
- On phones show one column at a time or stacked lists; never shrink the columns. (docs/22 Board, docs/19 §6)

## Behaviour
- A drag starts from the card's handle after 4px, keeps the grab offset, follows with no transition and captures the pointer. (docs/02 §2, docs/19 §7)
- Other cards stay put during a move; the card changes column and position once, on the drop. (docs/22 Reorder)
- Esc and `pointercancel` cancel a drag and restore the start state. (docs/02 §2)
- Auto-scroll the board and the column near their edges while dragging. (docs/22 Board)
- Every move has a keyboard path (Space pick-up, arrows, Space drop) showing the same line, and a "Move to…" menu. (docs/02 §2, docs/22 Reorder)
- Announce moves in a polite live region with the new position. (docs/22 Board)
- Show a move as pending until saved; revert with a Retry toast on failure; undo through commands. (docs/03 §3, docs/02 §5)
- Focus and selection chrome only for keyboard use, never mid-drag. (docs/17 §8)
- Columns are labelled regions holding lists; an empty column says so and offers Add. (docs/22 Board)

## Uses
- Card — each item, in the compact variant. (docs/22 Board)
- Badge, Menu — counts, and column and card actions. (docs/22 Board)
- Toast — move failures with Retry. (docs/22 Board)
- Tabs — the column switcher on phones. (docs/22 Board)
