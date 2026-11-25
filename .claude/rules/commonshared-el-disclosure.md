---
paths:
  - "**/*{Disclosure,disclosure,Accordion,accordion,Collapsible,collapsible,Collapse,collapse,Expander,expander}*.{tsx,jsx,ts,js,vue,svelte,css,scss,html}"
status: current
verified_by:
  - "templates/ui-kit/kit/test/disclosure.test.mjs"
  - "templates/ui-kit/examples.html#el-disclosure"
---
<!-- managed by __CommonShared/rules/elements/el-disclosure.md; sha256:c6863d16881a070b; edit it there, put project rules in project-*.md -->
# Disclosure rules

Shared defaults from CommonShared. The project's own `.claude/rules/project-*.md`, AGENTS.md,
DESIGN.md and PRODUCT.md win on conflict.

## Look
- Disclose only the rare part; what most people need on most visits stays shown. (docs/19 §7)
- The header is a full-row button, `--control-h` (`--control-h-lg` in an accordion), 14px / 500 `--ink`. (docs/22 Disclosure)
- A chevron at the inline start turns 90° when open and is mirrored under RTL. (docs/22 Disclosure)
- An accordion stacks sections with 1px `--border` hairlines, no card per section. (docs/22 Disclosure)
- Errors inside show on the header as an icon and a count. (docs/22 Disclosure, docs/01 §2)

## Behaviour
- Click, Enter or Space on the header toggles; focus stays on the header. (docs/22 Disclosure)
- Collapse with `grid-template-rows: 0fr ↔ 1fr` and an inner `min-height: 0`, 200–300ms; never `max-height`. (docs/17 §3, docs/01 §9)
- Under reduced motion sections open and close at once; the first placement never animates. (docs/19 §7)
- A closed panel is out of the Tab and reading order (`hidden`, or `inert` with `visibility: hidden`). (docs/22 Disclosure)
- A single-open accordion closes the open section when another opens; all may be closed. (docs/22 Disclosure)
- Remember each section's open state per view. (docs/19 §7)
- Never hide an error in a closed section: open it and focus the first failing field. (docs/19 §7, docs/22 Disclosure)
- Headers are in the normal Tab order; arrow keys do not move between them. (docs/22 Disclosure)

## Accessibility
- The header is a `button` with `aria-expanded` and `aria-controls` naming the panel. (docs/22 Disclosure)
- In an accordion the button is the only child of a heading. (docs/22 Disclosure)
- Native `details`/`summary` is fine for a plain disclosure without animation or a single-open group. (docs/22 Disclosure)

## Uses
- Button, Icon, Badge — the header, chevron and error count. (docs/22 Disclosure)
- Form fields, Error state — the content, and the banner's technical detail. (docs/22 Disclosure, docs/21 §13)
