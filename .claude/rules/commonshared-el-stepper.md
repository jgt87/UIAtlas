---
paths:
  - "**/*{Stepper,stepper,Wizard,wizard,StepList,step-list}*.{tsx,jsx,ts,js,vue,svelte,css,scss,html}"
status: current
verified_by:
  - "templates/ui-kit/kit/test/guard.test.mjs"
  - "templates/ui-kit/kit/test/stepper.test.mjs"
  - "templates/ui-kit/examples.html#el-stepper"
---
<!-- managed by __CommonShared/rules/elements/el-stepper.md; sha256:760a0d6b1440179d; edit it there, put project rules in project-*.md -->
# Stepper rules

Shared defaults from CommonShared. The project's own `.claude/rules/project-*.md`, AGENTS.md,
DESIGN.md and PRODUCT.md win on conflict.

## Look
- A stepper is for a real sequence of 3–7 steps; peer views use tabs, one short form needs no steps. (docs/22 Stepper, docs/19 §4)
- Numbered 24px markers in an ordered list, joined by a 1px connector that turns `--accent` after a done step. (docs/22 Stepper)
- Upcoming: ring and `--muted`; current: `--accent` fill, `--ink` label at 600 with its width reserved. (docs/22 Stepper, docs/17 §4)
- Done shows a check icon and says "done" in its name; error shows a warning icon and a count; never colour alone. (docs/22 Stepper, docs/01 §2)
- Labels 13–14px, hints and marker numbers 12px; vertical or compact "Step 2 of 5" on narrow widths. (docs/19 §5)
- Back at the inline start, one primary at the inline end named for its result ("Create project", not "Finish"). (docs/01 §5)

## Behaviour
- Next validates the step on submit, focuses the first failing field and marks the step as error. (docs/22 Stepper, docs/19 §7)
- Back never validates and keeps everything entered; leaving and returning keeps it too. (docs/22 Stepper)
- The new step slides in from the direction of travel: forward from the inline end, back from the inline start. (docs/22 Stepper)
- The slide is `translateX` 16–24px plus opacity, 200–250ms `--ease-out`, on the panel only; no crossfade. (docs/22 Stepper, docs/19 §7)
- Under reduced motion there is no slide: the content swaps at once. (docs/19 §7)
- After a change, focus moves to the new step's heading (`tabindex="-1"`). (docs/22 Stepper)
- The step lives in the URL or view state, so a reload lands on the same step with its data. (docs/22 Stepper)

## Accessibility
- A labelled `nav` around an `ol`; the current item has `aria-current="step"`. (docs/22 Stepper)
- Steps that cannot open yet are plain text, not disabled links. (docs/22 Stepper)

## Uses
- Button, Spinner — Back, Next and the final action; Next shows its spinner while a step validates. (docs/22 Stepper)
- Icon, Badge — the check and warning markers and the error count. (docs/22 Stepper)
- Form fields, Dialog — a step's content, and a short wizard inside a dialog of one fixed height. (docs/22 Stepper, docs/17 §2)
