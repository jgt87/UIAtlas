---
paths:
  - "**/*{Toast,toast,Snackbar,snackbar,Notification,notification}*.{tsx,jsx,ts,js,vue,svelte,css,scss,html}"
status: current
verified_by:
  - "templates/ui-kit/kit/test/kit-entry.test.mjs"
  - "templates/ui-kit/kit/test/toast.test.mjs"
  - "templates/ui-kit/examples.html#el-toast"
---
<!-- managed by __CommonShared/rules/elements/el-toast.md; sha256:a6012966aeae6733; edit it there, put project rules in project-*.md -->
# Toast rules

Shared defaults from CommonShared. The project's own `.claude/rules/project-*.md`, AGENTS.md,
DESIGN.md and PRODUCT.md win on conflict.

## Look
- `--raised` panel, 1px `--border`, `--shadow-menu`, radius `--radius-container`, layer `--z-toast`, max width ~420px. (docs/01 §1, docs/21 §9)
- Text 13px app, 14px brand; status shown by icon and word plus a soft status fill, never colour alone. (docs/01 §1, docs/19 §5)
- At most one action (ghost button: Undo, Retry, Open) and a dismiss button. (docs/21 §9)
- Same verb as the action that caused it ("Publish" → "Published"); errors say what happened and the fix. (docs/19 §4)
## Behaviour
- For background and async results only; forms show success and errors inline. (docs/19 §7, §10)
- Info and success ~4s; errors ≥ 8s or until dismissed; a toast with an action stays long enough to use it. (docs/01 §6, docs/21 §9)
- Enter 150–180ms `--ease-out` with a short translate and opacity; exit faster; stay mounted until the exit ends. (docs/01 §6, docs/19 §7)
- Swipe to dismiss on touch, on velocity or distance. (docs/19 §7)
- Create the live regions empty at startup so the first message is announced; one owner per message, so a banner showing the same words stays silent. (docs/21 §9, docs/19 §7)
- One corner (DESIGN.md decides), a stack of at most three; phone: full width minus 16px above the safe area. (docs/21 §9)
## Accessibility
- Info and success in a `role="status"` region; errors in a `role="alert"` region. (docs/01 §6, docs/21 §9)
- Toasts never take focus; their action also exists elsewhere, e.g. Undo via Ctrl+Z. (docs/02 §5, docs/21 §9)
## Uses
- Icon, Button, IconButton — status, the ghost action, dismiss. (docs/21 §9)
- Error state — a background failure that needs to persist also gets a banner. (docs/21 §13)
