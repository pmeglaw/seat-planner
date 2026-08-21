"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { useCallback, useEffect, useRef } from "react";
import { deploySkewMonitor, type SkewDetector } from "@/lib/deploySkew";
import { assignLocation } from "@/lib/fullNavigation";

// v12 left rail (design_handoff_carbon_v12 §structural move 1, prototype lines
// 25-60), reshaped by the top-bar-first chrome (2026-08-14): the rail now
// hangs BELOW AppTopBar (top-[var(--admin-chrome-h)], not top-0), and the
// brand mark + account cell moved into the bar — the rail is navigation only.
// 48px collapsed column, 208px overlay when expanded; item click / outside
// click / Escape collapse it. Nav items are <Link>s with default (auto)
// prefetch — see the prefetch note on the nav items — so they navigate
// natively before hydration; see handleNavClick for how the onNavigate veto
// rides preventDefault. People item lands with the People panel slice — see
// the breadcrumb on NAV_ITEMS below.
//
// Since the persistent shell (components/ui/AppShell.tsx, mounted by
// app/(shell)/layout.tsx) this rail is created ONCE per document load and
// SURVIVES client-side navigation — pages no longer mount their own copies.
// Everything keyed to "the rail unmounts on a successful nav" moved to the
// pathname effect below: it disarms the stalled-nav watchdog and collapses
// the overlay drawer so it can't linger over the incoming page.
//
// Icon sizing follows the plan's restated constraint (17px, stroke 1.5,
// hamburger 1.6) rather than the raw prototype markup, which used 16px for
// the hamburger and 1.8 stroke for the viewer glyph specifically — the plan
// text is the authoritative "exact values" source for this task.

export type AppRailActive = "map" | "management" | "settings" | "reception";

export type AppRailProps = {
  active: AppRailActive;
  /** Expansion state — CONTROLLED by AppShell since the toggle moved into
   *  AppTopBar's corner cell (owner call 2026-08-14). The rail still owns
   *  every dismissal gesture (Escape, scrim, item click) and reports them
   *  through onOpenChange. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Return keyboard focus to the bar's corner toggle after a dismissal that
   *  asked for it (Escape / scrim click) — the contract the in-rail
   *  hamburger's ref used to serve. */
  focusToggle?: () => void;
  /** "admin" (default) shows the full admin nav + Ask Planner. "viewer" is
   *  the /reception-for-viewers shell: only role-safe items (Reception,
   *  Viewer) — admin routes would bounce a viewer at the guard. */
  railMode?: "admin" | "viewer";
  /** Return false to veto a navigation (unsaved-edits guard). When omitted,
   *  items navigate plainly. Receives the target href + human label. */
  onNavigate?: (href: string, label: string) => boolean;
  /** Map surface: open the Ask Planner drawer in place. Sub-pages omit it and
   *  the AI item navigates to /admin?ask-planner=open instead. */
  onOpenAskPlanner?: () => void;
  /** Test seam only — the deploy-skew detector (lib/deploySkew.ts). Defaults
   *  to the module singleton, which is sticky across soft navigations; jsdom
   *  suites inject a fake so cases stay order-independent. */
  skewDetector?: SkewDetector;
};

// overflow-hidden here (not on <nav>, see the nav className comment): each
// item's own box is what needs to clip its whitespace-nowrap label while the
// rail animates between 48px and 208px.
// h-10 = 40px, matching --admin-chrome-h: rail cells and the bar's corner
// cell share one 48×40 grid unit (chrome-unification pass 2026-08-20). The
// hit area is still the full rail width. Hover/active foreground is the
// chrome text token, not text-white — one hovered foreground across the
// chrome (see components/ui/adminChrome.ts doctrine).
const ITEM =
  "relative flex h-10 w-full items-center overflow-hidden text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--admin-primary)]";
const ITEM_IDLE = "text-[var(--admin-chrome-muted)] hover:bg-[var(--admin-chrome-hover)] hover:text-[var(--admin-chrome-text)]";
// Active: #262626 surface + inset 3px #FF5715 left edge (contract #3) — the
// vertical-chrome active marker (adminChrome.ts doctrine).
const ITEM_ACTIVE = "bg-[var(--admin-chrome-hover)] text-[var(--admin-chrome-text)] shadow-[inset_3px_0_0_var(--admin-primary)]";
const CELL = "flex w-12 shrink-0 items-center justify-center";
const LABEL_BASE = "whitespace-nowrap text-[12.5px] transition-opacity duration-150";

type NavItem = { key: AppRailActive; label: string; href: string; icon: ReactNode };

const NAV_ITEMS: NavItem[] = [
  { key: "map", label: "Seat map", href: "/admin", icon: <MapIcon /> },
  { key: "management", label: "Management", href: "/admin/management", icon: <ManagementIcon /> },
  { key: "settings", label: "Settings", href: "/admin/settings", icon: <SettingsIcon /> },
  // People item lands with the People panel slice (owner ruling 2026-07-31, deliberately omitted here).
  // Reception sits last, after Settings (reception handoff; open question #4
  // notes it may move first if a dedicated front-desk role lands).
  { key: "reception", label: "Reception", href: "/reception", icon: <ReceptionIcon /> }
];

export function AppRail({
  active,
  open,
  onOpenChange,
  focusToggle,
  railMode = "admin",
  onNavigate,
  onOpenAskPlanner,
  skewDetector = deploySkewMonitor
}: AppRailProps) {
  const pathname = usePathname();

  const collapse = useCallback(
    (refocus: boolean) => {
      onOpenChange(false);
      if (refocus) focusToggle?.();
    },
    [onOpenChange, focusToggle]
  );

  // Navigation watchdog. Prod probes (2026-08-05) caught the App Router
  // client stalling on a rail navigation: the RSC response arrived (Vercel
  // logs show the 200) but the transition never committed — URL frozen,
  // second click deduped onto the stuck nav, main thread idle. A full
  // document navigation always recovered. So: if the URL hasn't moved 4s
  // after an allowed click, do the full navigation. This rail now PERSISTS
  // across navigations (AppShell), so unmount cleanup can't be the disarm
  // anymore — the pathname effect below clears the timer the moment ANY
  // route commits (the router is provably alive, including back/forward,
  // which must never be hijacked by a stale timer), leaving the fallback to
  // fire only on a genuinely stuck nav. The unmount cleanup stays for the
  // document-load / test teardown cases.
  const navWatchdogRef = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (navWatchdogRef.current !== null) window.clearTimeout(navWatchdogRef.current);
    },
    []
  );
  // Route-committed overlay close lives in AppShell now (it owns the lifted
  // `open` state and adjusts it during its own render, so the stale overlay
  // never paints); the account menu's equivalent is AccountMenu's
  // autoCloseKey in AppTopBar.
  // Route committed — the client router is provably alive: disarm the
  // watchdog. Also re-probe deploy skew on every route change: the detector
  // throttles itself to one fetch/min, so this keeps the pre-shell "probe on
  // page mount" cadence without per-navigation cost.
  useEffect(() => {
    if (navWatchdogRef.current !== null) {
      window.clearTimeout(navWatchdogRef.current);
      navWatchdogRef.current = null;
    }
    void skewDetector.check();
  }, [pathname, skewDetector]);
  // Deploy-skew probes: merging to main flips the prod alias under open tabs,
  // after which soft navigations fetch RSC from the NEW build and the router
  // falls back with a dead-feeling click + late full reload (2026-08-05
  // incident; Vercel Skew Protection would cover this but needs Pro). Probe on
  // mount (once per document load now that the rail persists in AppShell), on
  // every route commit (the pathname effect above), on tab focus/visibility
  // (deploys land while the tab is backgrounded), and on a slow interval for
  // always-focused tabs. The detector throttles to one fetch/min and goes
  // quiet once skew is known.
  useEffect(() => {
    const check = () => {
      void skewDetector.check();
    };
    check();
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    const interval = window.setInterval(check, 5 * 60_000);
    return () => {
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
      window.clearInterval(interval);
    };
  }, [skewDetector]);

  function armNavWatchdog(href: string) {
    // Pathname-only on purpose, not an oversight: pages shallow-rewrite the
    // query after commit (SeatMap strips ?ask-planner=open and re-mirrors
    // ?seat= via replaceState), so comparing search would read a legitimate
    // post-commit rewrite as "stalled" and fire a state-destroying reload.
    // Every rail nav is cross-path, where pathname alone detects commit.
    const targetPath = href.split("?")[0];
    if (navWatchdogRef.current !== null) window.clearTimeout(navWatchdogRef.current);
    navWatchdogRef.current = window.setTimeout(() => {
      // assignLocation, not bare window.location.assign: same escape hatch as
      // the skew path below, and the only form the jsdom tier can stub (its
      // Location is unforgeable), so the firing path stays testable.
      if (window.location.pathname !== targetPath) assignLocation(href);
    }, 4000);
  }

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") collapse(true);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, collapse]);

  // Nav items are real <Link>s (not buttons + router.push) so they navigate
  // natively before hydration and stream the loading boundary on click, with
  // default (auto) prefetch — see the prefetch note on the nav items. The
  // veto contract survives as preventDefault: Link's own click handler bails
  // when default is prevented. Modified clicks (new tab/window) bypass both
  // the collapse and the guard — the current page, and any unsaved edits,
  // stay put.
  function handleNavClick(event: ReactMouseEvent<HTMLAnchorElement>, href: string, label: string) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    collapse(false);
    if (onNavigate && !onNavigate(href, label)) {
      event.preventDefault();
      return;
    }
    // Stale tab (the live deployment no longer matches this bundle): a soft
    // navigation would only dead-end into the router's own full-reload
    // fallback after a confusing pause, so take the full document load NOW,
    // deliberately. Runs after the veto — unsaved edits still win.
    if (skewDetector.isSkewed()) {
      event.preventDefault();
      assignLocation(href);
      return;
    }
    armNavWatchdog(href);
  }

  return (
    <>
      {open && (
        // Scrim click also returns focus to the hamburger (unlike the
        // account-menu scrim below, which follows AccountMenu.tsx's
        // no-refocus-on-outside-click convention): the rail's own contract
        // treats Escape and outside-click as equivalent dismiss gestures.
        <button
          type="button"
          aria-hidden="true"
          tabIndex={-1}
          data-rail-scrim
          onClick={() => collapse(true)}
          className="fixed inset-0 z-[79] cursor-default"
        />
      )}
      <nav
        id="app-rail"
        aria-label={railMode === "admin" ? "Admin sections" : "Sections"}
        data-expanded={open}
        className={[
          // top-[var(--admin-chrome-h)], not top-0: the rail hangs BELOW the
          // full-width AppTopBar (top-bar-first chrome, 2026-08-14) — the two
          // never overlap, so their z-indexes are independent. Each item that
          // needs to clip its own label during the width transition carries
          // its own overflow-hidden (see ITEM), scoped to that item's box —
          // the rail box itself stays unclipped.
          "fixed bottom-0 left-0 top-[var(--admin-chrome-h)] z-[80] flex flex-col border-r border-[var(--admin-chrome-border)] bg-[var(--admin-chrome-bg)] transition-[width] duration-150 ease-out",
          open ? "w-[208px] shadow-rail-overlay" : "w-12"
        ].join(" ")}
      >
        {/* No toggle row: the hamburger lives in AppTopBar's corner cell,
            directly above this column (owner call 2026-08-14) — the rail
            starts straight at its destinations. */}
        {NAV_ITEMS.filter(item => railMode === "admin" || item.key === "reception").map(item => (
          <Link
            key={item.key}
            href={item.href}
            // Default (auto) prefetch, restored deliberately: the old
            // prefetch={false} existed because every PAGE remounted its own
            // rail, so each navigation refired 2 dynamic RSC prefetches per
            // item (8+ lambda invocations/page), and clicking mid-prefetch
            // intermittently wedged the router (prod 2026-08-05 — the 4s nav
            // watchdog above still backstops that). With the rail persistent
            // in AppShell it mounts once per document load, and auto prefetch
            // for these dynamic routes fetches only down to each section's
            // loading boundary — a handful of tiny requests per session that
            // make the click paint its skeleton instantly.
            title={item.label}
            aria-current={item.key === active ? "page" : undefined}
            onClick={event => handleNavClick(event, item.href, item.label)}
            className={[
              ITEM,
              item.key === active ? ITEM_ACTIVE : ITEM_IDLE,
              item.key === active ? "font-semibold" : "font-medium"
            ].join(" ")}
          >
            <NavItemBody icon={item.icon} label={item.label} open={open} />
          </Link>
        ))}
        <div className="flex-1" />
        {/* Ask Planner — the AI entry. AI blue (--admin-ai-chrome-text /
            --admin-ai-chrome-border) is reserved for AI presence and must not
            appear on any non-AI control in this component. Admin rail only:
            Ask Planner is an admin surface, so the viewer-mode rail hides it. */}
        {railMode !== "admin" ? null : onOpenAskPlanner ? (
          <button
            type="button"
            title="Ask Planner (AI)"
            onClick={() => {
              collapse(false);
              onOpenAskPlanner();
            }}
            className={[ITEM, "text-[var(--admin-ai-chrome-text)] hover:bg-[var(--admin-chrome-hover)]"].join(" ")}
          >
            <AiCell open={open} />
          </button>
        ) : (
          <Link
            href="/admin?ask-planner=open"
            title="Ask Planner (AI)"
            // handleNavClick, not a bare collapse: the modifier guard must
            // run first, or a ctrl-click (new tab) would still arm the
            // watchdog and hijack THIS page into /admin 4s later. The
            // onNavigate veto inside is a no-op here — sub-pages don't
            // pass it.
            onClick={event => handleNavClick(event, "/admin?ask-planner=open", "Ask Planner")}
            className={[ITEM, "text-[var(--admin-ai-chrome-text)] hover:bg-[var(--admin-chrome-hover)]"].join(" ")}
          >
            <AiCell open={open} />
          </Link>
        )}
        {/* Last item: the account cell that used to sit below this moved to
            AppTopBar's right cluster (AccountMenu) with the top-bar-first
            chrome — the rail ends at the Viewer shortcut. */}
        <Link
          href="/"
          title="Viewer — published map"
          aria-label="Open viewer surface"
          onClick={event => handleNavClick(event, "/", "the viewer")}
          className={[ITEM, ITEM_IDLE, "mb-2"].join(" ")}
        >
          <NavItemBody icon={<ViewerIcon />} label="Viewer" open={open} />
        </Link>
      </nav>
    </>
  );
}

// Shared body for the Link-based rail items. useLinkStatus must be called
// from a component rendered INSIDE the Link, so this can't inline into
// AppRail. While the navigation is pending (dynamic admin routes block on
// auth + data before the loading boundary paints), the icon cell pulses so
// the click visibly landed.
function NavItemBody({ icon, label, open }: { icon: ReactNode; label: string; open: boolean }) {
  const { pending } = useLinkStatus();
  return (
    <>
      <span className={[CELL, pending ? "animate-pulse motion-reduce:animate-none" : ""].join(" ")}>{icon}</span>
      {/* NOT aria-hidden: this text is the item's only accessible name, and
          must stay mounted (opacity swap) so a collapsed rail is still
          announced correctly. */}
      <span className={[LABEL_BASE, open ? "opacity-100" : "opacity-0"].join(" ")}>{label}</span>
    </>
  );
}

// --- Icons -------------------------------------------------------------
// Recreated from docs/design_handoff_carbon_v12/Seat Planner v12 Prototype.dc.html
// (lines 25-60): hamburger 28, map 32, management (stacked rows) 40, gear 44,
// viewer (concentric circles) 53. All 17px, stroke 1.5 except the hamburger
// (1.6) — see the file-header note on sizing.

function MapIcon() {
  return (
    <svg aria-hidden="true" width="17" height="17" viewBox="0 0 20 20" fill="none">
      <path
        d="M3 5.5 8 3.5v11L3 16.5v-11ZM8 3.5l4 2v11l-4-2M12 5.5l5-2v11l-5 2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ManagementIcon() {
  return (
    <svg aria-hidden="true" width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M4 4h12v3.5H4zM4 9.5h12V13H4zM4 15h7.5v1.5H4z" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg aria-hidden="true" width="17" height="17" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="2.6" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M10 3v2.2M10 14.8V17M17 10h-2.2M5.2 10H3M14.9 5.1l-1.5 1.5M6.6 13.4l-1.5 1.5M14.9 14.9l-1.5-1.5M6.6 6.6 5.1 5.1"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ReceptionIcon() {
  // Headset (reception handoff): band + two earcups + mic boom, 17px/1.5 like
  // the other rail glyphs.
  return (
    <svg aria-hidden="true" width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 11V9.5a6 6 0 0 1 12 0V11" />
      <path d="M4 11h2v3.5H4.6A.6.6 0 0 1 4 13.9V11ZM16 11h-2v3.5h1.4a.6.6 0 0 0 .6-.6V11Z" />
      <path d="M16 14.5v1a2 2 0 0 1-2 2h-2.5" />
    </svg>
  );
}

function ViewerIcon() {
  // 20-unit viewBox like every other rail glyph (chrome-unification
  // 2026-08-20 — this one was drawn on a 24 grid, which rendered its 1.5
  // stroke ~17% lighter than its neighbors at the same 17px size).
  return (
    <svg aria-hidden="true" width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="10" cy="10" r="6.8" />
      <circle cx="10" cy="10" r="2.5" />
    </svg>
  );
}

function AiCell({ open }: { open: boolean }) {
  return (
    <>
      {/* Sparkle 13px + square 9px "AI" badge — the ONE badge spec, matching
          the bar's Ask Planner tenant (SeatMap.tsx) since the
          chrome-unification pass 2026-08-20 (was 15px / 7.5px here). */}
      <span className={[CELL, "relative"].join(" ")}>
        <span aria-hidden="true" className="text-[13px]">
          ✦
        </span>
        <span
          aria-hidden="true"
          className="absolute right-0.5 top-0.5 border border-[var(--admin-ai-chrome-border)] px-[3px] text-[9px] font-bold leading-none text-[var(--admin-ai-chrome-text)]"
        >
          AI
        </span>
      </span>
      {/* NOT aria-hidden: the sole accessible name for the AI item, mounted
          at every width (opacity swap) like the nav items. */}
      <span className={[LABEL_BASE, open ? "opacity-100" : "opacity-0"].join(" ")}>Ask Planner</span>
    </>
  );
}
