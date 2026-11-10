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

## Not needed now
- CI workflow: one author, no pull requests or forks, and the browser tests need an installed Edge. Local
  `npm run lint && npm test && npm run smoke` plus the commit-msg hook cover it. Revisit when someone else
  contributes or before the first PR from outside.

## Open
- [ ] The HTML export's `<link>` to its CSS file is named after the project (`<slug>-tokens.css`), so the slugged
      source name ends up inside the HTML. Found by the smoke check. Decide: neutral file names (e.g.
      `tokens.css`), or accept it, since the file names already carry the slug.
- [ ] DESIGN.md "Known gaps": dark theme, 34px controls, 14px dialog radius, unmarked 22px glyph, 16px coarse inputs.
- [x] Health refactors (2026-11-10): app.js, bin/atlas.mjs, web-extract (incl. `collect`, split into helpers declared
      inside it), retheme-import, tokens-import, tokens-json, pdf-import, sketch-import, compare. Each locked by
      before/after golden output; size baseline 54 → 19 violations.
- [ ] The viewer (`viewer/js/*.js`) has no tests of its own beyond the CSS rules. A Playwright test on a test port with
      generated atlases in a temp data dir would pin the views (the refactor used a scratch golden over `data/`).
