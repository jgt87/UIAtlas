# Decisions

The settled decisions of UI Atlas, one entry each: what the operator decided, and every
deviation from a CommonShared rule. Append; never rewrite an entry. A change of mind is a new
entry that replaces the old one (set the old one's status to `replaced` and add `Replaced by`).
Elsewhere, cite the id (`/* design: D-001 */`, `ui-rules: D-001`, an `acceptRules` reason of
`"D-001"`, "(D-001)" after a line in DESIGN.md or AGENTS.md) instead of restating the decision.
Format and checks: CommonShared docs/09 §8, `templates/scripts/decisions.mjs`.

- **By:** `operator`, or `agent` for a call the operator has not confirmed yet.
- **Rule:** the shared rule it is about, as `<rule file id>:<slug>` (the audit's key) with
  `follows` or `deviates`, then in brackets the part of the line it is about when the line
  bundles several; left out when no shared rule covers it.
- **Intent** is the goal, worded so another solution could meet it; **Decision** is the
  solution chosen.

Entries D-001 to D-016 were moved here on 2026-11-25 from "(operator, <date>)" stamps and the
DESIGN.md known gaps; each keeps the date it was first recorded.

## D-001 Old commits keep their agent trailers — active
- Date: 2026-11-10
- By: operator
- Rule: core:no-assistant-or-ai-vendor-names — deviates
- Intent: published history is never rewritten; the rule holds from now on
- Decision: `.githooks/commit-msg` refuses agent trailers in new commits; the 7 older commits keep theirs, so the audit's `--public` finding on them is expected

## D-002 The boundary checker has no dependency — active
- Date: 2026-11-24
- By: operator
- Rule: node:validate-input-at-every-boundary-cli — follows
- Intent: every boundary (HTTP job body, upload query, CLI options) is checked by a schema, without adding a package
- Decision: `src/validate.mjs`, a small schema checker of our own; messages name the field, what it expects and an invented example

## D-003 Below 760px the navigation is a drawer — active
- Date: 2026-11-24
- By: operator
- Intent: on a phone the views get the full width, and the navigation is one tap away
- Decision: the side navigation becomes a drawer behind the top bar's Menu button; focus moves into it, Esc and the backdrop close it and return focus to Menu

## D-004 HEX/RGB stays in the top bar — active
- Date: 2026-11-24
- By: operator
- Rule: design:a-bar-holds-actions-and-navigation — deviates
- Intent: one colour notation for every view that shows a colour, set once
- Decision: the HEX/RGB control sits with the other global controls in the top bar, not in one view's panel

## D-005 Dialog footer sticks to the foot of the scrolling body — replaced
- Date: 2026-11-24
- By: operator
- Rule: el-dialog:one-scroll-area-the-body-the — deviates
- Intent: Export and Create atlas stay in view with More options open
- Decision: the footer is `position: sticky` at the bottom of the scrolling body
- Replaced by: D-006

## D-006 Dialog footer outside the scrolling body — active
- Date: 2026-11-25
- By: agent (to meet D-005's intent and the shared dialog rule; not yet confirmed by the operator)
- Rule: el-dialog:one-scroll-area-the-body-the — follows
- Intent: Export and Create atlas stay in view with More options open
- Decision: a `<footer>` below the body, outside the scroll area, with a line above it; the replace question takes its place there
- Replaces: D-005

## D-007 Table headers are not sticky — replaced
- Date: 2026-11-24
- By: operator
- Rule: ui:long-lists-and-menus-scroll-inside — deviates (table headers sticky)
- Intent: no machinery the viewer's tables do not need yet
- Decision: table headers scroll with their table; lists already scroll inside themselves
- Revisit when: a table in the viewer is taller than the window
- Replaced by: D-017

## D-008 Job state stays in memory — active
- Date: 2026-11-24
- By: operator
- Rule: node:a-call-that-may-pass-about — deviates
- Intent: no record that can only ever show a dead job
- Decision: jobs run one at a time as children of the server, so a restart stops the job itself; their state is kept in memory, not on disk

## D-009 The busy spinner keeps turning under reduced motion — active
- Date: 2026-11-24
- By: operator
- Rule: design:reduced-motion-keeps-opacity-and-colour — deviates
- Intent: a busy button still shows that work goes on, also with reduced motion
- Decision: the spinner opts out with `.motion-alt` and turns slowly, 2.4s a turn

## D-010 Text fields and selects are 44px on touch — active
- Date: 2026-11-24
- By: operator
- Rule: ui:coarse-pointer-reach-44px-via-padding — deviates
- Intent: every control reaches 44px on a coarse pointer, also those that cannot carry an invisible hit area
- Decision: buttons keep 34px with an invisible 44px `::after`; text fields and selects (no `::after`) are drawn 44px high, so a touch top bar mixes the two

## D-011 Controls are 34px — active
- Date: 2026-11-10
- By: agent (a known gap recorded in DESIGN.md; not confirmed by the operator)
- Rule: ui:control-heights-24-28-32-36px — deviates
- Intent: one height for every top-bar control and field
- Decision: `--control-h: 34px`, between the shared 32 and 36px steps
- Revisit when: the top-bar controls and fields can move to 32px together, as one change

## D-012 Uppercase labels — active
- Date: 2026-11-25
- By: agent (the existing look, kept when the audit flagged it; not confirmed by the operator)
- Rule: design:sentence-case-no-eyebrow-kickers-above — follows
- Intent: small section labels and table heads read as labels, apart from the content
- Decision: `h2.sec`, table heads and the FALLBACK tag are uppercase with letter-spacing (the rule's DESIGN.md opt-in); everything else is sentence case

## D-013 Light theme only for now — active
- Date: 2026-11-10
- By: agent (a known gap recorded in DESIGN.md; not confirmed by the operator)
- Rule: ui:light-dark-via-data-theme-or — deviates
- Intent: one finished theme before a second
- Decision: `color-scheme: light`; no `[data-theme]` dark values yet

## D-014 The font-sample glyph is 22px — active
- Date: 2026-10-26
- By: agent (a known gap recorded in DESIGN.md; not confirmed by the operator)
- Rule: ui:font-sizes-10-11-12-13 — deviates
- Intent: a font family is big enough to recognise in the Fonts view
- Decision: the sample glyph is 22px, outside the UI scale; marked `type-scale:` in the CSS

## D-015 The screen-details dialog is 1100px wide — active
- Date: 2026-11-05
- By: agent (a known gap recorded in DESIGN.md; not confirmed by the operator)
- Rule: el-dialog:width-min-680px-100vw-32px-centred — deviates
- Intent: a screenshot is shown at a readable width
- Decision: `min(1100px, 100vw - 32px)` for the screen details; the form dialogs keep 680px

## D-016 The current nav item is an ink fill — active
- Date: 2026-11-24
- By: operator (the monochrome chrome: ink and greys, no accent colour)
- Rule: el-app-shell:current-nav-item-accent-soft-ink — deviates
- Intent: all colour on screen belongs to the measured source; the chrome stays monochrome
- Decision: accent = ink, so the current nav item is an ink fill with `--on-accent` text, not a soft accent tint

## D-017 Short tables keep a static header — active
- Date: 2026-11-25
- By: operator (the shared rule became conditional, so D-007's choice now follows it)
- Rule: ui:long-lists-and-menus-scroll-inside — follows (table headers sticky)
- Intent: a sticky header only where a table can be taller than the box that scrolls it
- Decision: table headers scroll with their table, since no table in the viewer is taller than the window; one that grows taller gets a sticky header in the box that scrolls it
- Replaces: D-007
