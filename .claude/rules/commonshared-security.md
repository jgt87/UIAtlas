---
paths:
  - "**/*.{ts,tsx,js,jsx,mjs,cjs,py,ps1,psm1,cs,sql}"
  - "**/*.{html,vue,svelte,astro}"
  - ".env*"
  - "**/*.{json,toml,yaml,yml}"
---
<!-- managed by __CommonShared/rules/security.md; sha256:1b6ae1389db02d10; edit it there, put project rules in project-*.md -->
# Security rules

Shared defaults from CommonShared. The project's own `.claude/rules/project-*.md`, AGENTS.md,
DESIGN.md and PRODUCT.md win on conflict.

## Local servers
- Bind `127.0.0.1` unless LAN access is a documented feature of the app. (docs/05 §7)
- Guard state-changing routes with an Origin/Host check plus a custom header (`X-<App>: 1`). (docs/05 §7, L-SEC)
- Parse the Origin; accept scheme `http` and a host that is exactly one of the loopback names the server binds (`127.0.0.1`, `localhost`, `::1`); never a prefix match. (docs/13 §2, L-SEC)
- Test look-alike origins: `localhost.evil.example`, `127.0.0.1.evil.example`, `localhost@evil.example`, `https://localhost`, `null`. (docs/13 §2)
- Serve UI files through an allow-list route, not a directory mount; test that source files and `..%2F` paths 404. (docs/13 §2)
- Store uploads under a fixed name; the original name is display text only, printable, ≤ 80 chars. (docs/13 §2)
- Before fixing a suspected injection, read the whole path; pin existing escaping with a test, never escape twice. (docs/13 §2)
- A browser-side control counts only when the server enforces it; prove it with one harmless direct request. (docs/07 §5, L-SEC)

## Injection
- Make input safe at the sink that uses it, never at the field: the field checks shape for the person, the server parses types and limits. (docs/24 §1)
- Store values as typed; encode once, at each sink, for that sink's context. (docs/24 §1, docs/13 §2)
- SQL and query objects: bound parameters only; identifiers and sort keys from an allow-list; never a filter object straight from the request. (docs/24 §2)
- HTML: text APIs and framework binding; untrusted HTML only through an allow-list sanitiser; URLs in `href`/`src` checked to http(s), mailto or relative. (docs/24 §2)
- Processes: an argument array without a shell (`execFile`, `subprocess.run([...])`, splatting); never `shell: true`, `os.system` or `Invoke-Expression` with a value. (docs/24 §2)
- Paths: resolve, then require the result inside the allowed base; never `eval`, `new Function` or a string timer on data. (docs/24 §2)
- CSV export: a cell starting with `=`, `+`, `-`, `@`, tab or CR gets a leading `'`; headers and logs reject or escape CR/LF. (docs/24 §2)
- Deserialise with schemas and safe loaders only; XML parsers with external entities off; redirects relative or to an allow-listed host. (docs/24 §2)
- Text sent to a language model stays data: delimited, never followed as instructions; its output is untrusted input to every sink. (docs/24 §2)
- A model's reply is parsed into the fields the code expects, checked and clamped, before it reaches state, storage or a response; the rest is dropped. (docs/24 §2, L-SEC)
- A strict CSP (no `unsafe-inline` scripts, no `unsafe-eval`) and least-privilege database roles as second lines. (docs/24 §4)
- Test each sink with hostile values (`'`, `<script>`, `$(id)`, `../`, CR/LF, `=1+1`) that must come back unchanged as data; run the injection copy-in check. (docs/24 §5)

## Ports
- Give each app a fixed, documented port, passed explicitly; never a framework default or a port reserved on the machine. (docs/05 §7, docs/14 §10)
- Never pick a port browsers block (the Fetch spec's bad-port list, e.g. 4190). (docs/05 §7, L-BUILD)
- Tests use their own port and data dir, never the dev or live instance. (docs/05 §7, docs/15 §0)
- A port is free only when no process holds it: bind it or search process command lines (Windows listener tables miss held ports; `lsof -i` elsewhere), never one failed probe. (docs/07 §4)

## Secrets and config
- Commit `*.example` with every key documented and a working default; gitignore `.env`, `.secrets/`, vaults. (docs/05 §4, docs/11 §1)
- Fail fast on missing required config with a fix hint ("Copy .env.example to .env"); optional keys degrade. (docs/05 §4)
- Missing keys, RPCs or migrations fail loudly, never as a 200 or an anon-key fallback. (L-DEPLOY)
- Paid third-party API keys (model providers, payments) never reach the client bundle or a build-time `define`; use a server route. (L-SEC)
- Mask secrets in logs (DB URLs, auth codes, child-process stderr); show them only behind `--reveal`. (docs/05 §4, L-SEC)
- Token caches are credentials: seal them (DPAPI on Windows) and never store the password. (L-SEC)
- Redact verification output before sharing; share only the redacted copy. (docs/05 §4, docs/11 §1)
- On Windows: write paths in JSON config with `/` or `\\`; a raw `C:\path` is invalid JSON and fails silently. (L-WIN)
- Pin CDN assets to an exact version with SRI, never `@latest`. (L-SEC)

## Destructive actions
- Preview side effects first: `--dry-run`, then `confirm: true` on a second call; `--yes` when a run costs money. (docs/05 §5)
- Offer a read-only switch (`<APP>_READ_ONLY`); introduce new logic observe-only before it acts. (docs/05 §5, L-DEPLOY)
- Never retry writes or publishes; retry idempotent calls on transport/408/429/5xx with backoff, jitter, capped `Retry-After`. (docs/05 §5, L-DEPLOY)
- Audit "get" parameters for write flags (`finalize=true`) before calling a source system. (L-SEC)
- A write or delete names the container it means (tenant, vault, project); the server refuses a mismatch. (docs/05 §5)
- An action made reachable later or from another place re-checks its invariants there. (docs/05 §5)
- Verify a new production control on an endpoint that writes nothing when it is off, before any write path. (docs/07 §5)
- Back up before a vendor "repair" tool; an installer that edits settings writes a `.bak` and refuses invalid JSON. (L-BUILD)

## Data safety
- Find every deletion path (retention, cron, cleanup) before relying on data being kept. (L-DATA)
- Never silently drop content; label degraded output (`APPROXIMATE OUTPUT`). (L-DATA)
- Decode an uploaded image before storing it, with a size limit and a visible rejection. (L-DATA)
- Keep the original-state backup; never overwrite it with a post-change snapshot. (L-DATA)
- Captured third-party material is read-only, gitignored under a policy header, and a CI grep fails if it is tracked. (docs/05 §4, docs/11 §1)

## Before a public push
- Set a repo-local noreply git email. (docs/05 §4, L-SEC)
- Grep for home-dir paths (`C:\Users\`, `/home/`, `/Users/`), machine and device names, serials, vendor names and logs; run a personal-data scan in CI. (docs/14 §10, L-SEC)
- Run `git add -A --dry-run` and read what would be tracked. (L-SEC)
- Use fictional fixtures and screenshots only: no real branding, people or mail. (docs/13 §4, L-SEC)
