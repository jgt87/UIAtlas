---
paths:
  - "**/*{Breadcrumb,breadcrumb,Breadcrumbs,breadcrumbs,Crumbs,crumbs,PathBar,path-bar}*.{tsx,jsx,ts,js,vue,svelte,css,scss,html}"
status: current
verified_by:
  - "templates/ui-kit/kit/test/breadcrumbs.test.mjs"
  - "templates/ui-kit/examples.html#el-breadcrumbs"
---
<!-- managed by __CommonShared/rules/elements/el-breadcrumbs.md; sha256:8aa63d5976b92ee0; edit it there, put project rules in project-*.md -->
# Breadcrumbs rules

Shared defaults from CommonShared. The project's own `.claude/rules/project-*.md`, AGENTS.md,
DESIGN.md and PRODUCT.md win on conflict.

## Look
- Breadcrumbs show where the page lives in the hierarchy, not where the user has been. (docs/22 Breadcrumbs)
- One row of 13–14px text above the page title; ancestors `--muted`, the current page `--ink` at 600. (docs/22 Breadcrumbs, docs/19 §5)
- Separators are drawn and mirrored under RTL, never typed "/" or ">" characters. (docs/22 Breadcrumbs)
- Long ancestor names truncate at about 24ch with the full name in `title`; the current page truncates last. (docs/22 Breadcrumbs, docs/17 §3)
- Link hover fills are inset and rounded `--radius-inner`. (docs/19 §6)

## Behaviour
- The trail never wraps: middle items fold into a "…" menu, starting next to the first item. (docs/22 Breadcrumbs)
- The first item and the current page always stay visible; room unfolds the middle again. (docs/22 Breadcrumbs)
- The fold is measured before paint and re-measured only on a real size change, so resizing never flickers. (docs/22 Overflow list)
- The trail is built from the route, so a reload or deep link shows the right path. (docs/22 Breadcrumbs)
- A level the user cannot open shows as plain `--muted` text, not a dead link. (docs/22 Breadcrumbs)

## Accessibility
- A `nav` with its own `aria-label` around an `ol`. (docs/22 Breadcrumbs)
- The current page is plain text with `aria-current="page"`, not a link. (docs/22 Breadcrumbs)
- Separators are hidden from assistive technology. (docs/22 Breadcrumbs)
- The "…" button is named and has `aria-haspopup="menu"` and `aria-expanded`. (docs/22 Breadcrumbs, docs/21 §4)

## Uses
- Menu — the folded levels. (docs/22 Breadcrumbs)
- Icon, Tooltip — separators, the Back chevron and full names. (docs/22 Breadcrumbs)
