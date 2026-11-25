---
paths:
  - "**/*{AppShell,Layout,Sidebar,Toolbar,Header,TopBar,Topbar,StatusBar,NavBar,Navbar,SkipLink}*.{tsx,jsx,ts,js,vue,svelte,css,scss,html}"
  - "**/{app-shell,layout,sidebar,toolbar,header,topbar,navbar,status-bar,skip-link}.{tsx,jsx,ts,js,vue,svelte,css,scss,html}"
status: current
verified_by:
  - "templates/ui-kit/examples.html#el-app-shell"
---
<!-- managed by __CommonShared/rules/elements/el-app-shell.md; sha256:8ebcb604eaf48d0d; edit it there, put project rules in project-*.md -->
# App shell rules

Shared defaults from CommonShared. The project's own `.claude/rules/project-*.md`, AGENTS.md,
DESIGN.md and PRODUCT.md win on conflict.

## Look
- The first focusable element is a "Skip to content" link to `#main`, hidden until focused. (docs/22 App shell)
- The skip link has its own class, shown on `:focus`; not `sr-only` plus focus utilities, which a second, unlayered `.sr-only` outranks. (docs/17 §8)
- Header 34–40px dense or 54–64px app; its height is one `--topbar` variable. (docs/01 §4, docs/17 §5)
- Sidebar 240–280px, rail 40–52px with 20px icons, inspector 285–360px; split by `--border`. (docs/01 §4)
- Toolbar buttons share one height, checked by a test at desktop and phone width. (docs/17 §2)
- Current nav item `--accent-soft` + `--ink` with `aria-current="page"`; nav text 13–14px, never wraps. (docs/22 App shell, docs/19 §5)
- Status bar 24–28px, 13px `--muted`, `role="status"`. (docs/22 App shell)
- Shell `100dvh`, width `100%`; only `main` scrolls. (docs/17 §9, §10a)

## Behaviour
- Below about 768px the sidebar becomes a drawer (≤ 300ms) or a bottom bar; bars wrap. (docs/22 App shell, docs/19 §7)
- Primary controls never hide below a breakpoint. (docs/17 §9)
- List → detail may use a shared element transition (`view-transition-name` on the item and its detail) where it is not frequent navigation; none under reduced motion. (docs/19 §7)
- On route change focus moves to the view heading or `main`, and the title updates. (docs/22 App shell)
- Views switched from a menu or dialog: its button sits in a labelled `nav` (`aria-haspopup`, `aria-expanded`) and the list marks the shown view `aria-current="page"`. (docs/22 App shell, docs/17 §8)
- Views kept mounted while another shows carry `hidden`, so only the shown view's landmarks (one `main`) are exposed. (docs/22 App shell, docs/17 §8)
- Toolbars are `role="toolbar"` with one tab stop and arrow keys; overflow goes into "More". (docs/22 App shell)
- Splitters: `col-resize`/`row-resize`, a ≥ 6px bar with a bigger hit area, arrow keys, clamped and persisted. (docs/02 §1, docs/17 §2)
- Floating chrome publishes its measured size as a CSS variable; two mounted instances never share one, so one's cleanup cannot remove the other's. (docs/17 §5, docs/07 §5)
- z-index from named bands: sticky, dropdown, popover, modal, toast, tooltip. (docs/17 §5)
- Landmarks `header`, labelled `nav`, `main` with `tabindex="-1"`, `aside`; a `.sr-only` utility. (docs/22 App shell)
- PWAs pad with `env(safe-area-inset-*)`. (docs/17 §9)

## Uses
- Tabs, Tree, List — views and navigation. (docs/22 App shell)
- Button, Menu, Tooltip, Icon — toolbar and rail. (docs/22 App shell)
- Theme toggle, Avatar — header controls. (docs/22 App shell)
- Dialog / Drawer, Toast, Scrollbar — overlays and scroll regions. (docs/22 App shell)
