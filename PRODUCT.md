<!-- impeccable:product-schema 1 -->
# Product — UI Atlas

## Register
product  <!-- a tool people work in: the local viewer at http://127.0.0.1:4300/ -->

## Users
Designers and front-end developers who need to know what a website, Storybook, PowerPoint template, PDF,
Sketch file or token file really uses: before a redesign, when rebuilding a design system, or when checking
a theme for contrast. They work on a desktop browser, in sessions of minutes, on one atlas at a time.
The phone layout is for a quick look, not for daily use.

## Purpose
Turn a design source into an ordered atlas of its tokens, components and screens, then export the tokens.
Success pattern: **measure → browse → compare → export → leave**.

## Brand Personality
Precise, quiet, neutral. The source's colours and type are what the user came to see, and the chrome is
monochrome so it never competes with them.

## Anti-references
- Generic SaaS dashboards: stat-card grids, decorative gradients, glow, glass, brand-coloured chrome.
- Design-tool clones: the viewer reads a design, it does not edit one.
- Anything that looks like it stores or shows the source's content (copy, titles, people).

## Design Principles
1. **Design, not content.** No source text is shown or stored, and screenshots appear only when the user opted in
   (README "What is stored"; AGENTS.md "No content").
2. **The source's colours are data.** Swatches, samples and fonts show the source's literal values. The chrome only
   uses the viewer's own ink and grey tokens.
3. **Measured, not guessed.** Anything that can't be measured is shown as "not measurable" (contrast over images,
   fonts that fall back) instead of as a value.
4. **Every view has an empty state.** Empty token sections are hidden, and token-only atlases open on the tokens view.

## Accessibility & Inclusion
- Keyboard-operable everywhere, with one visible `:focus-visible` ring; cards open with Enter/Space.
- Muted text ≥ 4.5:1 and field edges ≥ 3:1 on both backgrounds (test-enforced).
- 44px hit areas on coarse pointers; hover styles only where the device can hover.
- Toggles report `aria-pressed`, the current view is marked in the side links, and status lines use `role="status"`.
- Meaning is never in colour alone: contrast levels are written out (AA, AAA, Fails AA) and fallbacks are tagged FALLBACK.
