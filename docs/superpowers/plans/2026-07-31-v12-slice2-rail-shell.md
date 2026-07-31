# v12 Slice 2 — Rail Shell + Top-Bar Density Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the admin surfaces' top-bar navigation with the Carbon v12 left rail (48px column → 208px overlay) and rebuild the two admin bars to the v12 density spec (24px fields, kebab Menu, conditional Publish, Ask Planner AI tool, account in the rail).

**Architecture:** New presentational client component `components/ui/AppRail.tsx` rendered by each admin surface (NOT via `app/admin/layout.tsx` — see Constraints). On `/admin`, `SeatMap` renders the rail so nav routes through its unsaved-edits guard; sub-pages render it beside a stripped `AdminShellBar`. The map header loses Management/Show-names/surface-shortcuts/AccountMenu/idle-publish-status and gains the kebab Menu + AI tool + conditional Draft chip.

**Tech Stack:** Next.js App Router, Tailwind v3 arbitrary values over `--admin-*` / `--admin-ai-*` tokens, plain-node source tests + jsdom ct tier.

## Global Constraints

- **Spec:** `docs/design_handoff_carbon_v12/README.md` + `Seat Planner v12 Prototype.dc.html` (top bar lines 62–97, rail lines 25–60, kebab lines 99–108) + `screenshots/01-prototype.png`. Recreate high-fidelity; `.dc.html` is reference, not production code. **Do not install `@carbon/react`.**
- **Owner rulings (settled 2026-07-31 — do not re-ask):** rail = full-height **48px** column, hamburger in rail top cell, top bar starts right of it, expands 48→**208px** as overlay (NOT the 36px/232px `app/concepts/nav-rail` geometry). Account moves to **rail bottom**; AccountMenu chip leaves both bars. Rail replaces Viewer/Admin shortcuts everywhere. Accent stays `#FF5715`; Publish stays on the CTA ladder (`#D23F0A`/`#B83708`/`#9E2F06`).
- **Scope fence:** admin surfaces only (`/admin`, `/admin/management`, `/admin/settings`). Viewer `/` + `ViewerSeatFinder.tsx` untouched (slice 3). Login untouched. Map canvas/floating controls untouched (slice 3). No People rail item this slice (People panel doesn't exist yet — leave a breadcrumb comment).
- **Do-not-touch:** draft/published two-layer model; `requireAdmin()` server actions; `SeatMarker` + `lib/mapLayoutTransform.ts`; pan/zoom never writes coordinates; viewer isolation (`tests/accessibility-source.test.mjs` viewer arm).
- **Deliberate deviations from the prototype (approved, keep):** (1) **Redo stays** as a second icon beside Undo — `tests/accessibility-source.test.mjs:43` pins `aria-label="Redo last undone change"`, a capability/a11y guardrail; the prototype's undo-only row is a mock simplification. (2) Rail **account cell opens a menu** (email/role/Sign out) instead of the prototype's bare sign-out click — an unconfirmed sign-out on a 26px target is a safety regression. (3) Rail labels stay **mounted** (opacity), not conditionally rendered, so the collapsed rail is still announced.
- **AI family:** the bar AI tool + rail AI item are the FIRST consumers of the slice-1 tokens. Use `--admin-ai-chrome-text` / `--admin-ai-chrome-border` (`#78a9ff`; 7.69:1 on `#161616`, 6.43:1 on `#262626` — both measured). **AI blue never appears on any non-AI control.**
- **Contrast:** body text ≥ 4.5:1, graphics ≥ 3:1. White never on `#FF5715` or `#F1C21B`. Any NEW color pairing gets verified with a small node script (relative-luminance WCAG formula) and recorded in a source comment; the script's output governs over any table in this plan.
- **Test evolution rule:** source-test pins that name the OLD structure (AccountMenu-in-bars, idle publish popover, sub-page section nav) are updated in the SAME task as the structural change, preserving the underlying semantic (guarded nav, menu keyboard contract, review-before-mutate, one-underline). Never delete a semantic; re-pin it on the new structure. `bulk-destructive-action-safety-source` must keep passing UNCHANGED (the reset call-site stays inside `confirmDiscardDraftChanges`).
- **Existing invariants:** `resetDraftToPublishedAction` keeps exactly ONE call site in SeatMap, inside `confirmDiscardDraftChanges` (`tests/bulk-destructive-action-safety-source.test.mjs:109-110`). The `<header className="sticky top-0 ` literal prefix in both bar files is pinned (`accessibility-source:548-550`) — keep the header element's class list inline, starting with exactly that string.
- Repo conventions: no `git add -A`; delete `.next` if new arbitrary Tailwind classes don't apply; test with `localhost`, never `127.0.0.1`.

---

### Task 1: `AppRail` component + ct tests

**Files:**
- Create: `components/ui/AppRail.tsx`
- Test: `tests/ct/app-rail.test.tsx` (jsdom ct tier — mirror an existing `tests/ct/*.test.tsx` file's harness/imports; see the `test-tiers` skill notes in the repo if wiring is unclear)

**Interfaces (Produces — Tasks 2/3 consume exactly this):**

```ts
export type AppRailActive = "map" | "management" | "settings";

export type AppRailProps = {
  active: AppRailActive;
  email: string;
  roleLabel: string;
  /** Return false to veto a navigation (unsaved-edits guard). When omitted,
   *  items navigate plainly. Receives the target href + human label. */
  onNavigate?: (href: string, label: string) => boolean;
  /** Map surface: open the Ask Planner drawer in place. Sub-pages omit it and
   *  the AI item navigates to /admin?ask-planner=open instead. */
  onOpenAskPlanner?: () => void;
};
```

- [ ] **Step 1: Write failing ct tests** — assert: (a) `nav[aria-label="Admin sections"]` renders with items Seat map / Management / Settings, `aria-current="page"` only on `active`; (b) hamburger has `aria-expanded=false` → click → `true`, and rail width class flips (`w-12` → `w-[208px]`); (c) clicking an item calls `onNavigate` with the href and does NOT navigate when it returns false; (d) Escape and outside-scrim click collapse an expanded rail and return focus to the hamburger; (e) account cell opens a menu containing the email, role label, and a Sign out submit button inside `<form action="/auth/signout" method="post">`; (f) with `onOpenAskPlanner` present the AI item calls it; without it the AI item is a link to `/admin?ask-planner=open`.
- [ ] **Step 2: Run and verify FAIL** — `npm run test:ct` (new file fails: module not found).
- [ ] **Step 3: Implement `AppRail`.** Reference implementation (adjust to compile; keep every aria/geometry decision):

```tsx
"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

// v12 left rail (design_handoff_carbon_v12 §structural move 1, prototype lines
// 25-60). 48px collapsed column, full viewport height, 208px overlay when
// expanded; item click / outside click / Escape collapse it. Owner rulings
// 2026-07-31: this geometry (not concepts/nav-rail's 36px), account lives in
// the rail bottom cell. People item lands with the People panel slice.

const ITEM =
  "relative flex h-11 w-full items-center text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--admin-primary)]";
const ITEM_IDLE = "text-[var(--admin-chrome-muted)] hover:bg-[var(--admin-chrome-hover)] hover:text-white";
// Active: #262626 surface + inset 3px #FF5715 left edge (contract #3).
const ITEM_ACTIVE = "bg-[var(--admin-chrome-hover)] text-white shadow-[inset_3px_0_0_var(--admin-primary)]";
const CELL = "flex w-12 shrink-0 items-center justify-center";
const LABEL_BASE = "whitespace-nowrap text-[13px] transition-opacity duration-150";

type NavItem = { key: "map" | "management" | "settings"; label: string; href: string; icon: JSX.Element };

const NAV_ITEMS: NavItem[] = [
  { key: "map", label: "Seat map", href: "/admin", icon: /* map glyph, prototype line 32 path, 17px stroke 1.5 */ },
  { key: "management", label: "Management", href: "/admin/management", icon: /* stacked-rows glyph, line 40 */ },
  { key: "settings", label: "Settings", href: "/admin/settings", icon: /* gear glyph, line 44 */ },
];

export function AppRail({ active, email, roleLabel, onNavigate, onOpenAskPlanner }: AppRailProps) {
  const [open, setOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const hamburgerRef = useRef<HTMLButtonElement | null>(null);
  const router = useRouter();
  const initial = (email.trim()[0] ?? "?").toUpperCase();

  const collapse = useCallback((refocus: boolean) => {
    setOpen(false);
    if (refocus) hamburgerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") collapse(true);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, collapse]);

  function navigate(href: string, label: string) {
    collapse(false);
    if (onNavigate && !onNavigate(href, label)) return;
    router.push(href);
  }

  return (
    <>
      {open && (
        <button type="button" aria-hidden="true" tabIndex={-1} onClick={() => collapse(false)}
          className="fixed inset-0 z-[79] cursor-default" />
      )}
      <nav
        id="app-rail" aria-label="Admin sections" data-expanded={open}
        className={[
          "fixed bottom-0 left-0 top-0 z-[80] flex flex-col overflow-hidden border-r border-[var(--admin-chrome-border)] bg-[var(--admin-chrome-bg)] transition-[width] duration-150 ease-out",
          open ? "w-[208px] shadow-[8px_0_24px_rgba(0,0,0,.35)]" : "w-12",
        ].join(" ")}
      >
        <button ref={hamburgerRef} type="button" onClick={() => setOpen(c => !c)}
          aria-expanded={open} aria-controls="app-rail"
          aria-label={open ? "Collapse navigation" : "Expand navigation"}
          title={open ? "Collapse navigation" : "Expand navigation"}
          className={[ITEM, ITEM_IDLE, "shrink-0 text-[var(--admin-chrome-text)]"].join(" ")}>
          <span className={CELL}>{/* hamburger: three 14px lines, stroke 1.6 */}</span>
          <span className={[LABEL_BASE, "flex items-center gap-2 text-[12.5px] font-semibold text-[var(--admin-chrome-text)]", open ? "opacity-100" : "opacity-0"].join(" ")} aria-hidden={!open}>
            <Image src="/images/megeredchian-mark.png?v=ma-2026" alt="" width={20} height={20} unoptimized className="h-5 w-5 object-contain" />
            Seat Planner
          </span>
        </button>
        {NAV_ITEMS.map(item => (
          <button key={item.key} type="button" title={item.label}
            aria-current={item.key === active ? "page" : undefined}
            onClick={() => navigate(item.href, item.label)}
            className={[ITEM, item.key === active ? ITEM_ACTIVE : ITEM_IDLE, item.key === active ? "font-semibold" : "font-medium"].join(" ")}>
            <span className={CELL}>{item.icon}</span>
            <span className={[LABEL_BASE, open ? "opacity-100" : "opacity-0"].join(" ")}>{item.label}</span>
          </button>
        ))}
        <div className="flex-1" />
        {/* Ask Planner — the AI entry. AI blue is reserved for AI presence. */}
        {onOpenAskPlanner ? (
          <button type="button" title="Ask Planner (AI)"
            onClick={() => { collapse(false); onOpenAskPlanner(); }}
            className={[ITEM, "text-[var(--admin-ai-chrome-text)] hover:bg-[var(--admin-chrome-hover)]"].join(" ")}>
            <AiCell open={open} />
          </button>
        ) : (
          <Link href="/admin?ask-planner=open" title="Ask Planner (AI)" onClick={() => collapse(false)}
            className={[ITEM, "text-[var(--admin-ai-chrome-text)] hover:bg-[var(--admin-chrome-hover)]"].join(" ")}>
            <AiCell open={open} />
          </Link>
        )}
        <button type="button" title="Viewer — published map" aria-label="Open viewer surface"
          onClick={() => navigate("/", "the viewer")}
          className={[ITEM, ITEM_IDLE, "mb-0.5"].join(" ")}>
          <span className={CELL}>{/* concentric-circles viewer glyph, prototype line 53 */}</span>
          <span className={[LABEL_BASE, open ? "opacity-100" : "opacity-0"].join(" ")}>Viewer</span>
        </button>
        {/* Account cell: menu, not a bare sign-out (approved deviation #2). */}
        <div className="relative mb-2 shrink-0">
          <button type="button" aria-haspopup="menu" aria-expanded={accountOpen}
            aria-label={`Account — ${email}`} title={`Account — ${email} (${roleLabel})`}
            onClick={() => setAccountOpen(c => !c)}
            className={[ITEM, ITEM_IDLE].join(" ")}>
            <span className={CELL}>
              <span className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-[var(--admin-brand)] text-[11px] font-semibold text-[var(--admin-primary-ink)]">{initial}</span>
            </span>
            <span className={["min-w-0 text-left", LABEL_BASE, open ? "opacity-100" : "opacity-0"].join(" ")} aria-hidden={!open}>
              <span className="block max-w-[140px] truncate text-[11.5px] text-[var(--admin-chrome-text)]">{email}</span>
              <span className="block text-[10.5px] text-[var(--admin-chrome-muted)]">{roleLabel}</span>
            </span>
          </button>
          {accountOpen && (
            <div role="menu" aria-label="Account"
              className="absolute bottom-1 left-full z-[81] ml-1 w-60 border border-white/15 bg-[var(--admin-chrome-elevated)] py-1 shadow-elevation-3">
              {/* email + roleLabel header block, then the sign-out form —
                  reuse AccountMenu's keyboard contract (Escape/Tab close +
                  trigger refocus, arrow roving) and its exact
                  <form action="/auth/signout" method="post"> submit. */}
            </div>
          )}
        </div>
      </nav>
    </>
  );
}
```

  Notes: `AiCell` = ✦ glyph 15px + bordered `AI` mini-chip (`border-[var(--admin-ai-chrome-border)]`, 7.5px 700, absolute top-1/right of the 48px cell — prototype line 49) + `Ask Planner` label. Copy the keyboard-menu mechanics (focus first item on open, arrow roving, Escape/Tab restore) from `components/ui/AccountMenu.tsx` rather than reinventing; extracting a tiny shared helper into `components/ui/` is fine if it stays behavior-identical.
- [ ] **Step 4: Run ct tests to green** — `npm run test:ct`.
- [ ] **Step 5: Full quick gate** — `npm run typecheck && npm run lint && npm test` (nothing mounts the rail yet; suite must stay at baseline).
- [ ] **Step 6: Commit** — `git add components/ui/AppRail.tsx tests/ct/app-rail.test.tsx && git commit -m "feat(shell): AppRail v12 left rail component"`

---

### Task 2: `/admin` — mount rail, rebuild map header, kebab Menu

**Files:**
- Modify: `components/seat-map/SeatMap.tsx` (header block ~2684–3200, root layout ~2715–2728, kebab replaces the More-tools menu ~2943–3056)
- Modify: `components/ui/adminChrome.ts` (retire now-dead collapse variants if unused)
- Modify: `tests/accessibility-source.test.mjs` (pins at :34–:67, :52, :65–:67, :787+ — evolve, keep semantics)

**Interfaces:**
- Consumes: `AppRail` from Task 1 (exact props above).
- Produces: `?ask-planner=open` query contract on `/admin` (Task 3's sub-page rail links to it).

**The target bar (admin map, left→right, all on the existing 36px `--admin-chrome-h` bar):**
brand block (pl-3, unchanged) · divider · **Filter button h-6** (24px, bordered `--admin-chrome-border`, count badge unchanged) · **Search field h-6** (24px, `max-w-[460px]`, Ctrl K kbd + clear unchanged) · **match label** (`N of M match`, `text-[11.5px] font-semibold text-[var(--admin-primary)]`, rendered when search/filter narrows: reuse `legendSourceSeats.length` / `localSeats.length`) · divider · **Undo + Redo icon buttons** (existing `chromeIconBtn`, aria-labels byte-identical) · **kebab ⋮** (32×36 grid cell) · flex-spacer · **Ask Planner AI tool** (full-height 36px: `✦` in `text-[var(--admin-ai-chrome-text)]` + label + bordered `AI` chip `border-[var(--admin-ai-chrome-border)] text-[var(--admin-ai-chrome-text)]`; active state = `bg-[var(--admin-chrome-hover)]` + 2px bottom border `--admin-ai-chrome-border`; keep the existing aria-label/aria-controls/aria-expanded/haspopup and highlight-count badge) · **conditional publish cluster**: when `publishSummary.hasChanges` render `Draft · {n} change{s}` (`text-[12px] text-[var(--admin-chrome-muted)]`) + Publish CTA (existing has-changes classes, `h-full px-[15px]`, white count badge with `--admin-primary-ink` text — all shipped in slice 1); when no changes render **nothing**.

**Removed from the bar (rail/kebab own them now):** Management link (both tiers), Show names button (→ kebab), Ask Planner's old muted flat-tool styling + below-lg collapse arm, the whole `xl:hidden` More-tools menu, both surface shortcuts (Viewer link + static Admin cell), the idle `Published` status button and `publish-status-popover`, `<AccountMenu>`.

- [ ] **Step 1: Mount the rail.** In `SeatMap`'s root div add `pl-12`; render `<AppRail active="map" email={accountEmail ?? ""} roleLabel={accountRoleLabel ?? "Admin"} onNavigate={(href, label) => beforeGuardedNavigation(href as GuardedNavigationHref, label)} onOpenAskPlanner={openAskPlannerDrawer} />` as its first child (fixed, so the padded content clears it). `beforeGuardedNavigation` returns `true` when navigation may proceed — in that case AppRail performs `router.push` itself; when it returns `false` the guard dialog takes over (verify the guard's resume path still ends in the real navigation, as it does for today's links). Skip-link stays the first focusable INSIDE the content column; the pinned `<header className="sticky top-0 ` literal stays byte-intact.
- [ ] **Step 2: Rebuild the bar** to the composition above. Fields: change the filter/search containers `h-7` → `h-6` and keep everything inside them working (dropdown anchor, results panel hop, shortcut hint). Kebab button + Menu (replaces the `xl:hidden` More-tools block wholesale):

```tsx
{/* Kebab — v12 Menu subsystem (contract #12). Items: names toggle
    (checkmark), reset view, divider, danger discard. */}
<div data-chrome-menu className="relative flex h-full shrink-0 items-center">
  <button ref={chromeMenuButtonRef} type="button" aria-haspopup="true"
    aria-expanded={chromeMenuOpen} aria-controls={chromeMenuOpen ? "chrome-kebab-menu" : undefined}
    aria-label="More tools" title="More tools"
    onClick={() => setChromeMenuOpen(c => !c)}
    className={/* 32px-wide grid cell, h-full, muted → hover chrome-hover; open state bg-chrome-hover */}>
    ⋮
  </button>
  {chromeMenuOpen && (
    <div id="chrome-kebab-menu" role="group" aria-label="More tools" onKeyDown={/* Escape close + returnFocusAfterClose(chromeMenuButtonRef), as today */}
      className="absolute left-0 top-full z-50 w-[230px] border border-white/15 bg-[var(--admin-chrome-elevated)] py-1 shadow-elevation-3">
      <button /* Show occupant names: aria-pressed={showNames}, trailing ✓ in text-[var(--admin-status-ok)] when on */ />
      <button /* Reset zoom & position: call the existing fit/reset handler that MapZoomControl's fit button uses */ />
      <div className="mx-0 my-1 h-px bg-white/10" />
      <button /* Discard draft changes: danger text (see contrast step), onClick opens the EXISTING discard confirm dialog — the resetDraftToPublishedAction call stays inside confirmDiscardDraftChanges, untouched */ />
    </div>
  )}
</div>
```

  Find where the discard confirm dialog is triggered today (the control near SeatMap:3905 that calls `confirmDiscardDraftChanges` lives inside an existing confirm flow — relocate the TRIGGER into the kebab, moving whatever menu/dialog plumbing it needs; do not duplicate the action call). If "Reset zoom & position" has no existing single handler, compose it from the zoom control's exported fit/reset callbacks; if the map has no resettable pan/zoom state yet, drop the item and leave a `{/* v12 kebab: Reset zoom & position lands with slice 3's zoom/fit work */}` breadcrumb instead — do not build new zoom state this slice.
- [ ] **Step 3: Danger + AI contrast check.** Node one-liner computing WCAG ratios for the kebab danger text color on `#262626` (start from `#ff8389`, Carbon red-30; if < 4.5:1 pick the nearest passing red and record it) and re-confirm `#78a9ff` on `#161616`/`#262626`. Record measured values in source comments beside the classes.
- [ ] **Step 4: `?ask-planner=open`.** In a `SeatMap` mount effect: if `window.location.search` contains `ask-planner=open` and `canEdit`, call `openAskPlannerDrawer()` and `window.history.replaceState(null, "", "/admin")` to strip the param.
- [ ] **Step 5: Evolve the accessibility-source pins in the same commit.** Keep byte-identical: Redo aria-label + "No undone map changes to redo", header prefix, viewer-isolation arm. Update: the `<AccountMenu` + guarded-Settings pin (:52) → pin `<AppRail` receiving `onNavigate` wired to `beforeGuardedNavigation`; the idle publish-status pins (:65–:67) → pin the conditional cluster (`publishSummary.hasChanges &&` guarding the ONLY publish control, and no `publish-status-popover` requirement); the kebab keeps a `returnFocusAfterClose` pin. Preserve the test names' intent — each replacement pin must still fail if the guarded-nav / focus-return / conditional-render semantic breaks.
- [ ] **Step 6: Clean `adminChrome.ts`** — delete `chromeToolbarBtnCollapsible*` derivations in SeatMap if now unused; keep `adminChromeTool`/`Active`/`Disabled` (still used by remaining full-height tools) and the string-replace contract comment accurate.
- [ ] **Step 7: Gate** — `npm run typecheck && npm run lint && npm test && npm run test:ct`. Then `npm run build`.
- [ ] **Step 8: Commit** — `git commit -m "feat(shell): v12 map header — rail mount, 24px fields, kebab menu, AI tool, conditional publish"` (add only the files this task touched).

---

### Task 3: Sub-pages — rail + stripped `AdminShellBar`

**Files:**
- Modify: `components/ui/AdminShellBar.tsx`
- Modify: `app/admin/management/page.tsx`, `app/admin/settings/page.tsx` (wrap content: `AppRail` + `pl-12` column; pass `email`/`roleLabel` they already hold for AdminShellBar)
- Modify: `tests/accessibility-source.test.mjs` (:540, :581, :590, :827 arms), `tests/role-fitted-tabs-source.test.mjs`, `tests/auth-session-source.test.mjs` (check its AdminShellBar reference and evolve equivalently)

**Interfaces:** Consumes `AppRail` (no `onNavigate`, no `onOpenAskPlanner` — plain nav + AI item links to `/admin?ask-planner=open`).

- [ ] **Step 1: Strip `AdminShellBar`** to: skip link (unchanged id `#admin-subpage-main`) + brand block. Delete the section `<nav>`, the Viewer shortcut, `<AccountMenu>`, and now-unused imports. Header element keeps its pinned `sticky top-0` prefix and `--admin-chrome-h` height. Keep the component's docstring honest: it now carries identity only; nav/account live in the rail.
- [ ] **Step 2: Mount rail on both pages** — `<AppRail active="management" email={email} roleLabel={roleLabel} />` (resp. `"settings"`), content column `pl-12`. Bar + page content both sit in the padded column.
- [ ] **Step 3: Evolve sub-page test pins in the same commit.** `role-fitted-tabs-source`: the "one cross-surface exit" semantic now lives in the rail — pin `aria-label="Open viewer surface"` in `AppRail.tsx` and pin that `AdminShellBar.tsx` contains NO viewer link and NO section nav (the one-underline hazard is structurally gone; assert its absence). `accessibility-source` sub-page arms: AccountMenu-in-shell-bar pin moves to AppRail's account menu (menu role + sign-out form). Run the two test files directly first, then the full suite.
- [ ] **Step 4: Gate** — `npm run typecheck && npm run lint && npm test && npm run test:ct && npm run build`.
- [ ] **Step 5: Commit** — `git commit -m "feat(shell): rail on sub-pages, AdminShellBar stripped to identity"`.

---

### Task 4: Docs, superseded-mock cleanup, CI push trigger

**Files:**
- Delete: `app/concepts/nav-rail/` (both files — superseded by the real rail on different owner-ruled geometry; precedent: superseded mocks deleted in `880d489`)
- Modify: `CLAUDE.md` (concepts list: drop `nav-rail`), `docs/DESIGN_DIRECTION.md` (shell section: rail replaces top-bar nav; account in rail; breadcrumbs for People item + publish-history entry point now Management → publishHistory tab), `docs/handoff-v12-shell.md` (append: §1 rail SHIPPED in slice 2 with carbon_v12 geometry per owner ruling 2026-07-31; the layout.tsx risks were sidestepped — rail is page-mounted, no admin layout was created)
- Modify: `.github/workflows/ci.yml` — restore merged-main coverage:

```yaml
on:
  push:
    branches: [main]
  pull_request:
```

  (Keep everything else in the workflow untouched.)
- [ ] **Step 1: Apply the edits above.** Check `tests/*-source.test.mjs` for any pin referencing `app/concepts/nav-rail` before deleting (grep `nav-rail` across `tests/`; update if found).
- [ ] **Step 2: Full gate** — `npm run lint && npm run typecheck && npm test && npm run test:ct && npm run coverage:check && npm run build`.
- [ ] **Step 3: Commit** — `git commit -m "docs+chore: rail shipped notes, drop superseded nav-rail mock, restore CI push trigger"`.

---

## Verification (controller, after final review)

1. `npm run test:e2e` after the build (needs `PW_CHROMIUM_PATH`).
2. Visual check against `screenshots/01-prototype.png` at 1440×900 (`run-seat-planner` + `chrome-pixel-capture` skills): rail collapsed + expanded, kebab open, AI tool hover/active, publish cluster present ONLY with draft changes (draft-layer edit + undo to produce/clear changes — never Publish), account menu, sub-pages with rail, guard dialog when navigating away with a dirty inspector. Requires the owner-run role-flip SQL (see memory: v12-implementation-state).
3. Confirm `/` viewer surface is byte-untouched (`git diff main -- app/page.tsx components/seat-map/ViewerSeatFinder.tsx` is empty).
