---
paths:
  - "**/*{Timestamp,timestamp,TimeAgo,timeAgo,time-ago,RelativeTime,relativeTime,relative-time,Timer,timer,Countdown,countdown,Stopwatch,stopwatch}*.{tsx,jsx,ts,js,vue,svelte,css,scss,html}"
status: current
verified_by:
  - "templates/ui-kit/kit/test/timestamp.test.mjs"
  - "templates/ui-kit/examples.html#el-timestamp"
---
<!-- managed by __CommonShared/rules/elements/el-timestamp.md; sha256:9edbc5e63391e6c6; edit it there, put project rules in project-*.md -->
# Timestamp and timer rules

Shared defaults from CommonShared. The project's own `.claude/rules/project-*.md`, AGENTS.md,
DESIGN.md and PRODUCT.md win on conflict.

## Look
- Render a `<time>` with `datetime` holding the ISO instant with offset, or an ISO duration for a timer, at the visible precision. (docs/22 Timestamp and timer)
- Relative ("3 min ago") within a window the product sets (default 7 days), absolute past it. (docs/22 Timestamp and timer)
- A sortable or compared column uses one absolute form for every row. (docs/22 Timestamp and timer)
- Elapsed timers show at most two units ("2m 08s", "1h 02m"); clock timers "2:08" or "1:02:33". (docs/22 Timestamp and timer)
- Meta times are 12px `--muted`; values that change in place use `tabular-nums`. (docs/19 §5, docs/22 Timestamp and timer)
- Paused, ended and overdue carry a word or badge, never colour alone. (docs/01 §2, docs/22 Timestamp and timer)

## Behaviour
- Format with one `Intl` helper (RelativeTimeFormat, DateTimeFormat) using the locale from `<html lang>`; no hand-built month names or "ago". (docs/22 Timestamp and timer, docs/17 §3)
- Show the viewer's time zone unless the record has its own; then write the zone out. (docs/22 Timestamp and timer)
- Update only when the visible text can change: seconds under a minute, about a minute under an hour, never per second for "3 hours ago". (docs/22 Timestamp and timer)
- Schedule the next update for the moment the text changes, from the real clock; a timer derives from its start time, never from counting ticks. (docs/22 Timestamp and timer)
- A tick writes only the node it owns, skips unchanged text, shares one scheduler and stops when unmounted or the page is hidden. (docs/22 Timestamp and timer)
- A time a few seconds in the future reads "just now". (docs/22 Timestamp and timer)
- Before the client knows its clock, render the absolute form or the timer's zero, then switch without a jump in width. (docs/22 Timestamp and timer, docs/19 §7)

## Accessibility
- A timestamp or timer never announces itself: no `aria-live`, no live role. (docs/19 §7, docs/22 Timestamp and timer)
- A countdown that matters speaks at a few chosen points through the feature's one polite region; assertive only when action is due now. (docs/19 §7, docs/22 Timestamp and timer)
- Relative and short values are named by the visible text plus the full date and zone. (docs/22 Timestamp and timer)
- A full-date tooltip opens on keyboard focus too; only then is the time a Tab stop. (docs/21 §2, docs/22 Timestamp and timer)
- Durations read as words ("2 minutes 8 seconds") via `aria-label` from the same helper. (docs/22 Timestamp and timer)
- A live update does not change the accessible name while the element has focus. (docs/22 Timestamp and timer)

## Uses
- Tooltip, Icon button — the full date and copying it. (docs/22 Timestamp and timer)
- Badge, Progress — overdue or paused status and a countdown's bar or ring beside the number. (docs/21 §11, §14)
