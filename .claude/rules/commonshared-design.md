---
paths:
  - "**/*.{css,scss,html,tsx,jsx,vue,svelte,astro}"
  - "DESIGN.md"
  - "PRODUCT.md"
---
<!-- managed by __CommonShared/rules/design.md; sha256:9a4ba739052ce278; edit it there, put project rules in project-*.md -->
# Design quality rules

Shared defaults from CommonShared. The project's own `.claude/rules/project-*.md`, AGENTS.md,
DESIGN.md and PRODUCT.md win on conflict.

## Register and process
- DESIGN.md names the register per surface: app (dense tools) or brand (marketing); rules below say which. (docs/19 §2)
- Plan before code: surface, job, focal element, what's left out, states, each motion with its purpose; ask whether a similar brief would give the same plan; revise the generic parts and say what changed. (docs/19 §3)
- Use the project's component for every standard element; never a lookalike, never reshaped from outside. (docs/19 §3)
- Mark an intentional deviation in place (`/* design: <why> */`; the `D-<n>` id when it is a logged decision) so it isn't reverted. (docs/19 §3, docs/09 §8)
- Fix in order: layout, hierarchy, states, motion, polish; the largest visible fault first; hand over with what was checked, what was assumed and what was not checked. (docs/19 §3)

## Anti-slop (each ban has its replacement)
- No decorative gradients, gradient text, glows or glass; flat surfaces, shadow only on what floats. (docs/19 §4)
- No sparkle or "AI" chip for an AI feature: say what it does in words. (docs/19 §4)
- No emoji or mixed icon styles: one set, one stroke, one size per view. (docs/19 §4)
- Sentence case; no eyebrow kickers above headings; uppercase labels only if DESIGN.md opts in; italics only for a title or a defined term; mono only for code, IDs, keys and aligned values. (docs/19 §4, §10)
- No invented metrics, testimonials or logos; a missing fact shows as a visible placeholder. (docs/19 §4)
- Numbered markers only for real sequences; lines, frames and dividers join only what belongs together. (docs/19 §4)
- One container level: no card in a card; border or shadow, never both, in the page (what floats, a menu, popover, dialog or toast, has both). (docs/19 §4)
- No status pills or dots that only say "fine"; surface status when it needs attention. (docs/19 §4)
- One name per action through the flow ("Publish" → "Published"); errors say what happened and the fix. (docs/19 §4)
- A state the interface infers is worded as likely ("may", "seems") with what comes next; only what it observed is stated as fact. (docs/19 §4)
- A button named for an action performs it and says what came of it; one that only re-reads an unchanged state is not a button. (docs/19 §4)
- One name per thing: a label never reuses a word the interface uses for something else. (docs/19 §4)
- Offer what to pick, never what to remember: recent values, pickers and suggestions instead of typed ids, names or paths. (docs/19 §4)
- One way per question: a second way to see or do the same thing replaces the first or is not built. (docs/19 §4)
- A bar holds actions and navigation; options for what a view draws live in its filter or view panel. (docs/19 §4)
- A state is explained once, in one banner above what it concerns; a disabled control keeps its own short reason; a label never repeats what its value already shows. (docs/19 §4)
- A regrouped view keeps the grouping it replaced visible, named inside each group. (docs/19 §4)
- Every row that looks clickable acts; a read-only list in a navigation bar is styled as plain text. (docs/19 §4)
- No lorem ipsum or `[placeholder]` left in; demo contacts on `.example` domains, test-enforced. (docs/19 §4)
- A look is chosen in DESIGN.md, deliberately, after checking the category's first-idea reflex. (docs/19 §4)

## Type minimums (app register; brand per DESIGN.md, body ≥ 16px)
- Nothing below 10px; functional text ≥ 11px; 10px only for a non-essential glyph, marked. (docs/19 §5)
- Body 13–14px; meta 12px; labels and table heads 11–12px; chips 11px; tooltips 12px. (docs/19 §5)
- Buttons and menu rows 13–14px; inputs 16px on coarse pointers; code ≥ 13px. (docs/19 §5)
- Phone widths: no functional text under 11px; small text line-height ≥ 1.3. (docs/19 §5)
- Few sizes per screen; weight carries hierarchy; a number and its unit never break apart. (docs/19 §5)

## Spacing and alignment
- Text ≥ 12px from a container edge (8px minimum); only decoration may bleed. (docs/19 §6)
- Fixed 8–12px gaps between text and neighbours; never leftover `space-between`. (docs/19 §6)
- Edges align exactly or differ by ≥ 8px; nested radius = inner radius + padding. (docs/19 §6)
- List rows share one grid template; controls hug content; fit content rather than widen. (docs/19 §6)
- A label over data marks gets reserved room in the layout at its drawn size, tested on geometry; a halo only hides it. (docs/17 §10)
- Every text field is its own visible area: an edge (or fill) of 3:1 against what is behind it, at rest; never borderless text in a card. (docs/17 §2)
- A view that fills the window grows by flex in a `min-height` container; no counted `calc(100dvh - Npx)`. (docs/17 §9)
- Twice the space above a heading as below; `overflow-x: clip`; reflow narrow, never scale down. (docs/19 §6)
- Space inside a group is smaller than the space between groups; a title sits 4–6px above its subtitle. (docs/19 §6)

## Motion and states
- Decide by frequency: nothing seen 100+ times a day or started from the keyboard animates. (docs/19 §7)
- 120–150ms state, ≤ 200ms popover and dialog, ≤ 300ms drawer; exits ~20% shorter, back toward their trigger. (docs/19 §7)
- Never `ease-in` alone, `transition: all`, `scale(0)` entries or bounce; ease-out to enter or leave, ease-in-out to move in view; enter from 0.95 + opacity 0. (docs/19 §7)
- Transitions, not keyframes, for rapid triggers; interrupted motion continues from where it is; a state swap overlaps old and new, never an empty frame. (docs/19 §7)
- Overlays stay mounted until their exit ends; popovers scale from their trigger, sized before frame one. (docs/19 §7)
- Reduced motion keeps opacity and colour, drops movement; motion over 5s gets a pause control. (docs/19 §7)
- Stagger and entrance motion: brand register only, one first-load group. (docs/19 §7, §10)
- Design all 8 states: default, hover, focus, active, disabled, loading, error, success. (docs/19 §7)
- Progress shows only steps the interface observes; an unobservable wait is a spinner with the time waited. (docs/19 §7)
- Known toggling labels reserve the widest; a spinner is already turning when shown. (docs/19 §7)
- Unfinished work stays visible and resumable: drafts are marked, and a flow left halfway reopens where it stopped. (docs/19 §7)

## Verification
- Check rendered pages at 1440, 1024, 768, 720 (a half-snapped window), 390 and a 320 walk, light and dark, keyboard only; a reported visual fault also at 100/125/150% scale, enlarged. (docs/19 §8, docs/07 §5)
- The view's main control starts on the first screen at every width; run `check-design-rules.mjs` for it. (docs/19 §8)
- Before a release, review the whole interface rendered in a fresh context, every view and state, with screenshots and the checklist only; findings as Before / After / Why. (docs/19 §3, §8, §9)
- A rule counts as checked only for the states its check visits; the check lists them. (docs/19 §8)
- Load once with scripts off and once with reduced motion: no content may stay hidden. (docs/19 §8)
- Run the rendered-DOM layout lint; "never intentional" findings fail, candidates get a judgement. (docs/19 §8)
- Hiding or marking an element to clear a finding is a bug; waivers carry a reason, max 5. (docs/19 §8)
- Gates cap rounds (~3) and never trap; an empty capture is inconclusive, not a pass. (docs/19 §8)
