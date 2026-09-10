# Composition — the layer above components

Read this when building a *page* rather than a component: choosing the container for a create or edit task, laying out a data table at scale, composing a dashboard, or reaching for anything in `@carbon/ibm-products` (page headers, tearsheets, side panels, data grids).

## Contents

- Page anatomy
- Create and edit containers
- Carbon for IBM Products — what to use and when
- Maturity model and recent renames
- Data tables at scale
- Dashboards
- The grid in practice

## Page anatomy

Top to bottom: **UI shell** (global header, optional left panel — `ui-shell.md`) → **page header** (breadcrumb, title, status tags, the one primary action, optional tabs) → **content on the 2x Grid**.

- Left panel when there are more than five secondary items or users switch between them often. It never holds three tiers.
- Breadcrumbs on record pages and any full-page flow.
- The page header's primary button is the page's one primary action. Section-level primaries live in their sections.

## Create and edit containers

This extends the three-row table in `SKILL.md` with the Carbon for IBM Products containers. Note that Create flows is a *community* pattern in Carbon's docs — strong guidance, not governance-approved.

| Container | Use when | Specifics |
|---|---|---|
| **Inline** | Quick, simple creation where the page context helps | Page stays visible and interactive |
| **Modal** | One or two fields, or a transition to another page after creating | Never with more than four fields or any scrolling |
| **Side panel** | Medium complexity where the user needs the page behind it | 480px, no overlay, page stays usable |
| **Narrow tearsheet** | Medium complexity with scrolling or sections; no distinct steps | Overlay dims the page; no progress indicator |
| **Wide tearsheet** | Complex or interactive, or two or more distinct steps | Vertical progress rail, 256px (320px for long labels); optional "show all options" toggle that switches to anchor-link navigation |
| **Full page** | Nothing works until this is created | Rare. Not a substitute for a wide tearsheet |

Rules that apply across all of them:

- Trigger is a "New [asset]" button with a plus icon.
- Modal, side panel, and both tearsheets **omit the top-right close** — leaving is a decision, made through Cancel.
- Multi-step buttons are Cancel / Back / Next, and Next becomes **Create** on the last step.
- Leaving a full-page flow by any route other than Cancel gets a confirmation.
- On submit: loading state, then a success banner if the user stays, or navigate to the new object; errors as a notification with the form intact.
- Tearsheets can stack for a nested task; **a modal never nests** — no confirmation dialog on top of a modal. When you spec any modal, say this explicitly and design the exit so it never needs one (Cancel discards without confirming, or the task moves to a side panel or tearsheet, which may open a confirmation).

Side panel behavior matters for accessibility: a **slide-in** panel pushes page content and does not trap focus (it's part of the page); a **slide-over** panel overlays and traps focus (it's a dialog). Choose deliberately — slide-in when the page behind stays relevant, slide-over when the task is self-contained.

## Carbon for IBM Products — what to use and when

`@carbon/ibm-products` (CSS prefix `c4p`) is the library of patterns built on `@carbon/react`. Don't hand-build what it already gives away.

| Component | Reach for it when |
|---|---|
| **PageHeader** | Every record and index page. Composable family (title, breadcrumb, actions, tags, status, tabs); breadcrumb and tabs can stick on scroll |
| **Tearsheet / TearsheetNarrow** | A focused task anchored to the bottom of the viewport; wide for steps, narrow for a single sectioned form |
| **SidePanel** | A task that needs the page alongside it; sizes `xs`–`2xl` |
| **Create\*** (CreateModal, CreateSidePanel, CreateTearsheet, CreateTearsheetNarrow, CreateFullPage) | Resource creation, per the container table above |
| **Datagrid** | Tables beyond base DataTable: nested rows, batch actions, inline edit, sticky columns, column customization, infinite scroll — but see the maturity note |
| **EmptyState** family (NoData, Error, NotFound, Notifications) | No-content states with the standard illustration and a next-step action |
| **RemoveModal** | Destructive confirmation; supports typed resource-name confirmation |
| **ExportModal / ImportModal** | Data export and file import |
| **FullPageError** | Full-page 403 / 404 / custom errors with a recovery path |
| **StatusIcon** | Standard status glyphs (fatal, critical, major, minor, normal, info) |
| **TagSet / TagOverflow** | Many tags collapsing into "+N" |
| **ProductiveCard / ExpressiveCard** | Data-and-action cards vs. visual cards |
| **Coachmark / InterstitialScreen** | Feature spotlight; welcome flow — sparingly |
| **Saving / AboutModal** | Save status; product info |

## Maturity model and recent renames

Components export with a lifecycle prefix. **Stable** has no prefix. **`preview__`** is production-ready with minor API changes possible. **`previewCandidate__`** is feature-complete and in validation. The older `pkg.component.*` canary flags are deprecated in favor of these prefixes (`pkg.feature.*` flags remain). Check the prefix before you depend on something.

Renames and deprecations from 2024–2026 that still trip people up:

| Old | Now |
|---|---|
| HTTPError403 / 404 / Other | FullPageError with a `kind` prop |
| InlineEdit | EditInPlace |
| UserProfileImage | UserAvatar |
| Datagrid `useInlineEdit` | `useEditableCell` |
| Size `max` | `2xl` |
| Size `xlg` | `xl` |
| TagSet `overflowDirection` | `overflowAlign` |
| IconButtonBar, ModifiedTabs | Removed / deprecated |

**Datagrid direction.** From late 2024 IBM steers new work toward composable tables built on TanStack Table with Carbon's DataTable components, rather than the monolithic Datagrid, which is in maintenance (severe bugs only). For a new table, start from the TanStack examples; reach for Datagrid only when you need a feature the examples don't cover and can accept the maintenance status.

Exact pixel values for side panel sizes and other geometry should be read from the component's Storybook at build time rather than memorized — they have shifted between versions.

## Data tables at scale

Base DataTable gives you: single-select (radio) or multi-select (checkbox); single or batch actions on selection; expandable rows; a toolbar with search, settings, and primary actions; sortable headers; zebra striping; simple or advanced pagination.

Senior defaults:

- **Row height by task.** Compact or short when the job is scanning; comfortable only when rows carry rich content. Row hover always on — it carries the eye across.
- **Expandable rows before extra columns.** Progressive disclosure inside the row beats a table that scrolls sideways.
- **Batch actions on selection**, in the toolbar, with the count shown.
- **Pagination when positions are addressable** ("page 3, row 12"); infinite scroll or virtualization when they aren't and the set is huge.
- **Numbers right-aligned, tabular figures.** Text left. Status as icon plus label.
- **Truncate with a tooltip; collapse tags into +N.**
- Empty table keeps its column headers as a preview of structure, and the toolbar CTA stays where it will always be.

## Dashboards

Two kinds: **presentation** (big-picture status) and **exploration** (interactive — search, sort, filter, drill). Decide which before drawing anything.

- **Prioritize by importance, then build hierarchy from it.** The most important data gets the highest contrast and the largest area, top-left (F-pattern). Everything else steps down.
- **Tiles get a designated aspect ratio each**, width measured to the columns. Same-size KPI tiles at 2:1; trend charts at 16:9; don't shoehorn a shared ratio onto unlike content.
- **Legends only when direct labels won't fit.** None for a single category. Top or bottom when space is scarce; left when type alignment matters.
- **Don't overfill the frame.** Whitespace around a chart measurably improves comprehension.
- **Per-tile loading and error states.** One failed query must not blank the dashboard.
- **A "last updated" mark** somewhere visible.
- Network and node diagrams aren't a Carbon Charts type — compose them from the technical-diagram rules in `status-and-dataviz.md` or a graph library.

## The grid in practice

- 16 columns at large breakpoints, 8 at medium, 4 at small. Default gutter 32px; `narrow` (16px) and `condensed` (1px) variants let containers hang into the gutter for typographic alignment.
- Aspect ratios: 16:9, 4:3, 3:2, 2:1, 1:1. Always measure width to the columns and let height follow.
- Type never sits closer than 32px to a container edge it isn't aligned to.
- Breakpoints are **viewport** media queries. There's no container query support in the grid package, so a grid inside a narrow docked panel needs its own handling.
- One full-bleed, container-free moment per flow at most — that's an expressive moment, and it should be deliberate.
