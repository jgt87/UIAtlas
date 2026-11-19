---
paths:
  - "**/*{Carousel,carousel,Slideshow,slideshow}*.{tsx,jsx,ts,js,vue,svelte,css,scss,html}"
---
<!-- managed by __CommonShared/rules/elements/el-carousel.md; sha256:c6b0b454a66166f8; edit it there, put project rules in project-*.md -->
# Carousel rules

Shared defaults from CommonShared. The project's own `.claude/rules/project-*.md`, AGENTS.md,
DESIGN.md and PRODUCT.md win on conflict.

## Look
- A carousel holds like items where seeing a few is enough; content everyone must see goes in a grid or list. (docs/22 Carousel)
- Native horizontal scroll with `scroll-snap-type: x mandatory`, `overscroll-behavior-x: contain`, a thin scrollbar. (docs/22 Carousel)
- Items keep a fixed width (at most 85% of the track, so the next one peeks) and `scroll-snap-align: start`. (docs/22 Carousel, docs/17 §9)
- Fade an edge with `mask-image` only on the side that has more content; no mask at the start when at the start, none when it all fits. (docs/22 Carousel)
- Previous/next are named icon buttons in the head row, never laid over the items; chevrons mirror under RTL. (docs/22 Carousel)
- Position as "4–6 of 12" text; dots only for ≤ 5 pages and never as the only cue. (docs/22 Carousel)
- Title 14–16px / 600, item text as the Card, position text 12px. (docs/19 §5)

## Behaviour
- Buttons scroll by a page, arrow keys on the focused track by one item, Home/End to the ends. (docs/22 Carousel)
- Buttons are disabled at their end with `aria-disabled` and update on every scroll, swipes included. (docs/22 Carousel)
- Smooth scroll only without reduced motion; under it the scroll jumps. (docs/19 §7)
- No autoplay; if ever, a pause control, stop on hover and focus, off under reduced motion. (docs/22 Carousel, docs/19 §7)
- No slide-in or scale on items: only the native scroll moves. (docs/19 §7)
- A custom drag track resists past either end, springs back, and hands the release velocity to the settle. (docs/22 Carousel, docs/19 §7)
- Coarse pointers: the buttons reach 44px by padding; swipe is the main path. (docs/17 §2)
- Loading shows skeleton items at the final width; empty and error stay inline, one line. (docs/22 Carousel)

## Accessibility
- A `section` with a label holding a `ul` of items; the track is focusable with a label. (docs/22 Carousel)
- While the track has keyboard focus, drop the mask so the ring is whole. (docs/22 Carousel, docs/17 §8)

## Uses
- Card, Icon button, Icon — items and the named previous/next buttons. (docs/22 Carousel)
- Scrollbar, Skeleton, Empty state — the strip, loading and no items. (docs/22 Carousel)
