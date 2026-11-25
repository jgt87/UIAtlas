# To do

From the CommonShared audit (2026-11-10).

## Done (2026-11-10)
- [x] Commit-msg hook refusing agent trailers, going forward only (`.githooks/`, `npm run hooks`).
- [x] `.gitignore`: anchor `/data/` (the unanchored form also hid any nested `data/` folder).
- [x] Root `CLAUDE.md` imports `@AGENTS.md` (AGENTS.md was not loaded before).
- [x] Agent deny rules in `.claude/settings.json` (env/secret reads; stash, hard reset, `checkout -- .`, `add -A/-u`,
      force push), with ask for push and commit.
- [x] PRODUCT.md and DESIGN.md for the viewer, including the known gaps against the CommonShared defaults.
- [x] Size/complexity ratchet: `scripts/check-code-size.mjs` + `scripts/code-size-baseline.json`, run by `npm run lint`
      with the EOL check.
- [x] `npm run smoke` (`scripts/smoke.mjs`).
- [x] CommonShared agent hooks installed; row added to `__CommonShared/data/installed.md`.

## Done later
- [x] CI workflow (`.github/workflows/ci.yml`): lint, tests and smoke on each push and pull request that changes more than
      Markdown, and it fails when anything
      under `data/` is tracked. The release script waits for it to be green.
- [x] Viewer tests: the pure modules (`keys`, `view-model`, `new-item-model`, `job-model`, `flow-geometry`,
      `loading-timing`, `tooltip` placement) and the wiring of the renderers are tested in `test/viewer-*.test.mjs`;
      the rendered views are checked by `npm run check:design` and `check:rows` against the invented atlas in
      `scripts/design-check.json`.
- [x] DESIGN.md "Known gaps": the 22px glyph is marked `design:` and coarse-pointer fields are `max(16px, 1em)`.

## Open
- [ ] The HTML export's `<link>` to its CSS file is named after the project (`<slug>-tokens.css`), so the slugged
      source name ends up inside the HTML. Found by the smoke check. Decide: neutral file names (e.g.
      `tokens.css`), or accept it, since the file names already carry the slug.
- [ ] DESIGN.md "Known gaps": dark theme, 34px controls, 14px dialog radius, 44px controls on coarse pointers.
- [x] Health refactors (2026-11-10): app.js, bin/atlas.mjs, web-extract (incl. `collect`, split into helpers declared
      inside it), retheme-import, tokens-import, tokens-json, pdf-import, sketch-import, compare. Each locked by
      before/after golden output; size baseline 54 → 19 violations.
- [ ] A browser test of the views themselves (a test port, generated atlases in a temp data dir) would pin what each
      view draws; today the pure modules and the rendered design rules are tested, not the views' content.
