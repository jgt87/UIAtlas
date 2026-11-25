---
paths:
  - "**/*{MetadataList,metadataList,metadata-list,DescriptionList,descriptionList,description-list,KeyValue,keyValue,key-value,PropertyList,propertyList,property-list}*.{tsx,jsx,ts,js,vue,svelte,css,scss,html}"
status: current
verified_by:
  - "templates/ui-kit/kit/test/metadata.test.mjs"
  - "templates/ui-kit/examples.html#el-metadata-list"
---
<!-- managed by __CommonShared/rules/elements/el-metadata-list.md; sha256:850559e3b5e30adc; edit it there, put project rules in project-*.md -->
# Metadata list rules

Shared defaults from CommonShared. The project's own `.claude/rules/project-*.md`, AGENTS.md,
DESIGN.md and PRODUCT.md win on conflict.

## Look
- One record's attributes as label/value pairs; many records across the same fields are a Table. (docs/22 Metadata list)
- Labels 11–12px `--muted` at 500, sentence case, no trailing colon; values 13–14px `--ink`. (docs/22 Metadata list, docs/19 §5)
- Side by side: a two-track grid, label `max-content` up to ~40% (or one shared width), value `minmax(0, 1fr)`, on one baseline. (docs/22 Metadata list, docs/19 §6)
- Stacked (label above value) in narrow containers, multi-column on wide pages; a container query switches them. (docs/22 Metadata list)
- Values wrap inside their track (`overflow-wrap: anywhere` for ids and URLs); labels never shrink below their text. (docs/22 Metadata list, docs/17 §3)
- An empty value is an em dash in `--faint` or `--muted` with "Not set" as accessible text, never a blank. (docs/22 Metadata list)
- Numbers in `tabular-nums`, dates via Timestamp, status as a Badge with a word, people as Avatar plus name. (docs/22 Metadata list, docs/01 §2)
- Copyable values get an Icon button in a slot reserved on every copyable row, so values stay aligned. (docs/22 Metadata list)

## Behaviour
- Copy writes the raw value, shows "Copied" on the button for ~1.5s and announces it once; no toast as well. (docs/22 Metadata list, docs/19 §7)
- A failed copy says so on the button and announces once. (docs/22 Metadata list)
- Pairs keep one order per kind of record, most used first. (docs/22 Metadata list)
- Long lists show the first 6–8 pairs and a "Show all" button with `aria-expanded`; focus stays on it. (docs/22 Metadata list)
- Loading shows the labels at once and a skeleton line per value. (docs/22 Metadata list)

## Accessibility
- A `dl` with `dt`/`dd` pairs, each pair in a `div`; naming props go on the `dl`. (docs/22 Metadata list)
- Copy buttons are named with what they copy ("Copy invoice id"); label icons are decorative. (docs/22 Metadata list, docs/20 Text field)

## Uses
- Icon, Icon button, Tooltip — label icons, copy and full values. (docs/22 Metadata list)
- Badge, Avatar, Timestamp — status, people and dates as values. (docs/22 Metadata list)
- Skeleton, Button — the loading state and Show all. (docs/22 Metadata list)
