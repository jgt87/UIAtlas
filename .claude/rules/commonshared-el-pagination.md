---
paths:
  - "**/*{Pagination,pagination,Paginator,paginator,Pager,pager,PageNav,page-nav}*.{tsx,jsx,ts,js,vue,svelte,css,scss,html}"
status: current
verified_by:
  - "templates/ui-kit/kit/test/pagination.test.mjs"
  - "templates/ui-kit/examples.html#el-pagination"
---
<!-- managed by __CommonShared/rules/elements/el-pagination.md; sha256:e5d15bf69c5a14e8; edit it there, put project rules in project-*.md -->
# Pagination rules

Shared defaults from CommonShared. The project's own `.claude/rules/project-*.md`, AGENTS.md,
DESIGN.md and PRODUCT.md win on conflict.

## Look
- Pagination pages a long ordered set (tables, results, logs); feeds load more, carousels keep their own position text. (docs/22 Pagination)
- Range text "21–40 of 312" at the inline start, 12–13px `--muted`, `tabular-nums`, an en dash, `Intl.NumberFormat` from `<html lang>`. (docs/22 Pagination, docs/19 §5)
- Previous, page buttons and Next at the inline end, one height for every control; chevrons mirror under RTL. (docs/22 Pagination, docs/17 §1)
- Page buttons are ghost buttons with a min width of `--control-h-sm`, so every number keeps the same box. (docs/22 Pagination)
- The current page takes `--accent-soft` with `--ink` at 600 (or `--accent` with `--on-accent`), the same box as the rest. (docs/22 Pagination, docs/01 §2)
- A "Rows per page" Select sits beside the range text; a change goes to page 1 and keeps sort and filters. (docs/22 Pagination)
- On coarse pointers each control reaches `--touch-target` by padding or `::after`; the row never reflows. (docs/17 §2)

## Behaviour
- Truncate to first, last, current and one neighbour each side with an ellipsis per gap, in the same number of slots on every page. (docs/22 Pagination)
- An ellipsis that would stand for one page shows that page instead. (docs/22 Pagination)
- Previous on page 1 and Next on the last page stay focusable with `aria-disabled`; never removed, never native `disabled`. (docs/19 §7, docs/22 Pagination)
- Focus stays on the pressed control when the page changes; never dropped to the body or moved into the collection. (docs/22 Pagination)
- A page change scrolls the collection's own scroller to its first row; instant under reduced motion. (docs/22 Pagination, docs/19 §7)
- The page and page size live in the URL or view state; a page past the end falls back to the last page with data. (docs/22 Pagination)
- A response for a page the user already left is dropped. (docs/19 §7)
- While a page loads the pager shows it as current and the collection shows skeleton rows at the same height. (docs/22 Pagination, docs/17 §4)

## Accessibility
- A `nav` with its own `aria-label`; the current page has `aria-current="page"`. (docs/22 Pagination)
- Page buttons are named "Page 4"; Previous and Next are named in words; the ellipsis is `aria-hidden`. (docs/22 Pagination)
- One polite live region, mounted empty, says "Page 5 of 16" once per change after the page loaded; the table does not repeat it. (docs/19 §7, docs/22 Pagination)

## Uses
- Button, Icon button, Icon — page buttons, Previous/Next/First/Last and the chevrons. (docs/22 Pagination)
- Select, Number input — the page size and a "Go to page" box on long sets. (docs/22 Pagination, docs/20 Number input)
- Tooltip, Skeleton — names of icon-only controls and the loading page. (docs/22 Pagination)
