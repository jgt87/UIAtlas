---
paths:
  - "**/*{Tooltip,tooltip,Toggletip,toggletip}*.{tsx,jsx,ts,js,vue,svelte,css,scss,html}"
status: current
verified_by:
  - "templates/ui-kit/kit/test/tooltip.test.mjs"
  - "templates/ui-kit/examples.html#el-tooltip"
---
<!-- managed by __CommonShared/rules/elements/el-tooltip.md; sha256:f0b2abb34273008f; edit it there, put project rules in project-*.md -->
# Tooltip rules

Shared defaults from CommonShared. The project's own `.claude/rules/project-*.md`, AGENTS.md,
DESIGN.md and PRODUCT.md win on conflict.

## Look
- Short one-line label, max ~240px, inverted bubble (`--ink` fill, `--bg` text) or `--raised` + `--border` per DESIGN.md. (docs/01 §6, docs/21 §2)
- Padding `--space-2`–`--space-3` × `--space-3` (4–8 × 8px), radius `--radius-inner`, layer `--z-tooltip`, `pointer-events: none`. (docs/01 §6, docs/21 §2)
- Text 12px app, 13–14px brand; a shortcut shows as a `kbd` badge ≥ 11px. (docs/19 §5, docs/21 §2)
## Behaviour
- First hover waits 500–800ms, keyboard focus 0ms; once one is open, neighbours open instantly with no animation. (docs/19 §7)
- Hover only under `(hover: hover) and (pointer: fine)`; leaving starts a 100–200ms exit guard, cancelled on re-entry; blur, Esc, pointerdown, scroll and wheel hide at once. (docs/19 §7, docs/21 §2)
- Above the trigger with a 6–8px gap, flip near the edge, clamp to the viewport; re-measure the anchor on every open. (docs/17 §5, docs/21 §2)
- Fade in ≤ 120ms with opacity only; warm neighbours appear without a fade. (docs/19 §7, docs/21 §2)
- Touch: no hover tooltips; a hint the user needs becomes a toggletip button that opens a popover on tap. (docs/21 §2, §15)
- Never put links, buttons or must-read information in a tooltip; use a popover or inline text. (docs/21 §2)
- Rich, non-essential hover content is a hover card: hoverable (WCAG 1.4.13), the same exit guard, also reachable by click or focus. (docs/21 §2)
## Accessibility
- `role="tooltip"` with an id, linked from the trigger by `aria-describedby`. (docs/03 §3, docs/01 §6)
- Never the only name of an icon button: that is `aria-label`; native `title` only for secondary hints. (docs/17 §8)
- A disabled trigger is always focusable `aria-disabled`, so it keeps its tooltip to say why it is unavailable. (docs/19 §7, docs/21 §2)
## Uses
- Kbd — shows the shortcut that the control also has. (docs/02 §5)
- Overlay contract — layer band, clamp and flip, reduced motion. (docs/21 §1)
