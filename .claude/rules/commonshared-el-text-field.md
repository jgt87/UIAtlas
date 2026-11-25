---
paths:
  - "**/*{Input,input,TextField,textField,text-field,Textarea,textarea,TextArea}*.{tsx,jsx,ts,js,vue,svelte,css,scss,html}"
status: current
verified_by:
  - "templates/ui-kit/kit/test/number.test.mjs"
  - "templates/ui-kit/examples.html#el-text-field"
---
<!-- managed by __CommonShared/rules/elements/el-text-field.md; sha256:d663fb3fd4ba2598; edit it there, put project rules in project-*.md -->
# Text field rules

Shared defaults from CommonShared. The project's own `.claude/rules/project-*.md`, AGENTS.md,
DESIGN.md and PRODUCT.md win on conflict.

## Look
- Visible `<label for>` above, 11–12px, 4–6px from the box; placeholder is an example, never the label. (docs/19 §4, §6)
- Box: `--surface`, 1px `--border-strong` (≥ 3:1), radius `--radius-element`, padding 0 8px, height = buttons. (docs/01 §6)
- Text 13–14px; 16px on coarse pointers via `max(16px, 1em)`; never block zoom. (docs/19 §5, docs/17 §2)
- Placeholders and muted text ≥ 4.5:1 in both themes. (docs/17 §7)
- Number fields right-aligned with `tabular-nums`. (docs/01 §6)
- Help text 12px `--muted` below; error text 12px `--danger` with an icon or word. (docs/19 §5, docs/01 §1)
- Textarea: min 3 rows, `resize: vertical`. (docs/20 Text field)
- `min-width:0; max-width:100%`; labelled fields in a row align to the bottom. (docs/17 §1, §3)

## Behaviour
- Focus: solid 2px `--ring` (wrapper `:focus-within` for composites); a soft halo alone is not a ring. (docs/17 §8)
- Borders never change width between states, so focus never shifts the layout; a ring drawn as an outline or shadow needs nothing reserved. (docs/19 §7)
- Validate on submit, then on blur/input once shown; focus the first failing field. (docs/19 §7)
- Errors: `aria-invalid` + message linked by `aria-describedby`, saying what is wrong and the fix. (docs/19 §4, §7)
- Keep what was typed; never block paste. (docs/19 §7)
- Accept common forms (trimmed spaces, decimal comma or point, local dates, spaced digits, pasted lists) and show the normalised value on blur; refuse only what cannot be read, naming the expected form. (docs/20 Text field)
- A failed sign-in may shake the field once (~360ms) on top of the red edge and message; never for ordinary validation; none under reduced motion. (docs/19 §7)
- Set `type`, `inputmode` and `autocomplete` so mobile keyboards and autofill fit. (docs/20 Text field)
- Composers: Enter sends, Shift+Enter adds a line, ignore Enter during IME composition. (docs/02 §5)
- Read-only stays focusable and selectable; disabled stays focusable too: `readonly` + `aria-disabled`, no value submitted, never native `disabled`. (docs/20 Text field, docs/19 §7)
- Number input: `inputmode` decimal or numeric with `role="spinbutton"` and `aria-valuemin/max/now`; never native `type="number"`. (docs/20 Number input)
- Number input keys: arrows step, PageUp/PageDown take 10 steps, Home/End go to min/max; each commits at once, clamped and rounded to the step. (docs/20 Number input)
- Number input drafts commit on blur or Enter: locale comma or point, grouping and typed units accepted, then shown normalised; unreadable text stays with a message at commit. (docs/20 Number input)
- Number input steppers sit in reserved end padding, are not Tab stops, keep focus on the field and turn `aria-disabled` at a bound. (docs/20 Number input)
- The wheel never changes a number unless the product enables it, and then only while the field has focus. (docs/20 Number input, docs/02 §3)

## Uses
- Icon button — clear or reveal inside reserved end padding: text never runs under it and the field's width never changes; tooltip "Clear", name "Clear <field>". (docs/20 Text field)
- Spinner — async validation in the suffix slot. (docs/20 Text field)
