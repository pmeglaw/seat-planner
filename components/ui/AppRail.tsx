"use client";

import Image from "next/image";
import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { returnFocusAfterClose } from "@/components/ui/returnFocus";
import { deploySkewMonitor, type SkewDetector } from "@/lib/deploySkew";
import { assignLocation } from "@/lib/fullNavigation";

// v12 left rail (design_handoff_carbon_v12 §structural move 1, prototype lines
// 25-60). 48px collapsed column, full viewport height, 208px overlay when
// expanded; item click / outside click / Escape collapse it. Nav items are
// <Link>s with default (auto) prefetch — see the prefetch note on the nav
// items — so they navigate natively before hydration; see handleNavClick
// for how the onNavigate veto rides preventDefault. Owner rulings
// 2026-07-31: this geometry (not concepts/nav-rail's 36px), account lives in
// the rail bottom cell. People item lands with the People panel slice — see
// the breadcrumb on NAV_ITEMS below.
//
// Since the persistent shell (components/ui/AppShell.tsx, mounted by
// app/(shell)/layout.tsx) this rail is created ONCE per document load and
// SURVIVES client-side navigation — pages no longer mount their own copies.
// Everything keyed to "the rail unmounts on a successful nav" moved to the
// pathname effect below: it disarms the stalled-nav watchdog, collapses the
// overlay drawer so it can't linger over the incoming page, and closes the
// account menu.
//
// Icon sizing follows the plan's restated constraint (17px, stroke 1.5,
// hamburger 1.6) rather than the raw prototype markup, which used 16px for
// the hamburger and 1.8 stroke for the viewer glyph specifically — the plan
// text is the authoritative "exact values" source for this task.

export type AppRailActive = "map" | "management" | "settings" | "reception";

export type AppRailProps = {
  active: AppRailActive;
  email: string;
  roleLabel: string;
  /** "admin" (default) shows the full admin nav + Ask Planner. "viewer" is
   *  the /reception-for-viewers shell: only role-safe items (Reception,
   *  Viewer, account) — admin routes would bounce a viewer at the guard. */
  railMode?: "admin" | "viewer";
  /** Return false to veto a navigation (unsaved-edits guard). When omitted,
   *  items navigate plainly. Receives the target href + human label. */
  onNavigate?: (href: string, label: string) => boolean;
  /** Map surface: open the Ask Planner drawer in place. Sub-pages omit it and
   *  the AI item navigates to /admin?ask-planner=open instead. */
  onOpenAskPlanner?: () => void;
  /** Rendered as the rail's first child, before the hamburger — makes the
   *  skip link the FIRST focusable on the page instead of the 8th (after
   *  all 7 rail controls), which defeated its purpose. Each mounting
   *  surface owns its own target id/copy; AppRail only positions it. */
  skipLink?: { href: string; label: string };
  /** Test seam only — the deploy-skew detector (lib/deploySkew.ts). Defaults
   *  to the module singleton, which is sticky across soft navigations; jsdom
   *  suites inject a fake so cases stay order-independent. */
  skewDetector?: SkewDetector;
};

// overflow-hidden here (not on <nav>, see the nav className comment): each
// item's own box is what needs to clip its whitespace-nowrap label while the
// rail animates between 48px and 208px.
const ITEM =
  "relative flex h-11 w-full items-center overflow-hidden text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--admin-primary)]";
const ITEM_IDLE = "text-[var(--admin-chrome-muted)] hover:bg-[var(--admin-chrome-hover)] hover:text-white";
// Active: #262626 surface + inset 3px #FF5715 left edge (contract #3).
const ITEM_ACTIVE = "bg-[var(--admin-chrome-hover)] text-white shadow-[inset_3px_0_0_var(--admin-primary)]";
const CELL = "flex w-12 shrink-0 items-center justify-center";
const LABEL_BASE = "whitespace-nowrap text-[13px] transition-opacity duration-150";
// Copied verbatim from AccountMenu.tsx's menu item style, since the account
// submenu here reuses that component's exact keyboard/visual contract.
const menuItemClassName =
  "flex w-full items-center gap-2.5 px-3 py-2 text-left text-[12.5px] font-medium text-[#E7E1D8] transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--admin-primary)]";

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
  email,
  roleLabel,
  railMode = "admin",
  onNavigate,
  onOpenAskPlanner,
  skipLink,
  skewDetector = deploySkewMonitor
}: AppRailProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const hamburgerRef = useRef<HTMLButtonElement | null>(null);
  const accountTriggerRef = useRef<HTMLButtonElement | null>(null);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);
  const accountMenuId = useId();
  const initial = (email.trim()[0] ?? "?").toUpperCase();

  const collapse = useCallback((refocus: boolean) => {
    setOpen(false);
    if (refocus) hamburgerRef.current?.focus();
  }, []);

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
  // Route committed, part 1 — transient chrome. Close the overlay drawer +
  // account menu the moment the pathname changes so neither lingers over the
  // incoming page (the pre-shell rail got this for free by unmounting).
  // Adjust-state-during-render on purpose, not an effect: React re-renders
  // immediately with the closed state, so the stale overlay never paints.
  const [lastPathname, setLastPathname] = useState(pathname);
  const accountOpenLastCommitRef = useRef(false);
  if (lastPathname !== pathname) {
    setLastPathname(pathname);
    setOpen(false);
    setAccountOpen(false);
  }
  // Route committed, part 2 — the client router is provably alive: disarm the
  // watchdog. Restore keyboard focus if closing the account menu stranded it:
  // the menu's focused menuitem unmounts with the menu (back/forward while it
  // is open), dropping focus to <body> with no way back — every other
  // dismissal path refocuses the trigger, so this one must too. The ref reads
  // the PREVIOUS commit's open state (see the mirror effect below), and the
  // <body> check keeps a click-driven navigation from having its focus yanked
  // off the clicked rail item. Also re-probe deploy skew on every route
  // change: the detector throttles itself to one fetch/min, so this keeps
  // the pre-shell "probe on page mount" cadence without per-navigation cost.
  useEffect(() => {
    if (navWatchdogRef.current !== null) {
      window.clearTimeout(navWatchdogRef.current);
      navWatchdogRef.current = null;
    }
    if (accountOpenLastCommitRef.current && document.activeElement === document.body) {
      accountTriggerRef.current?.focus();
    }
    void skewDetector.check();
  }, [pathname, skewDetector]);
  // Mirror accountOpen into the ref AFTER the pathname effect — declaration
  // order is load-bearing: same-commit effects run top-down, so on the commit
  // that closes the menu the pathname effect still sees the pre-navigation
  // value (true) before this line overwrites it with the closed state.
  useEffect(() => {
    accountOpenLastCommitRef.current = accountOpen;
  });
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

  // --- Account menu: keyboard/scrim contract copied from AccountMenu.tsx,
  // except focus-on-open rides a useEffect rather than AccountMenu's
  // window.requestAnimationFrame — same observable result (first item is
  // focused right after the menu opens) without depending on jsdom's
  // real-timer rAF polyfill (jsdom only implements it under
  // pretendToBeVisual, which runs a genuine 60Hz interval; that proved racy
  // under `npm test`'s full parallel test-file run, occasionally throwing
  // under memory pressure, though it was solid in isolation).
  useEffect(() => {
    if (!accountOpen) return;
    accountMenuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [accountOpen]);

  function closeAccountMenu(restoreFocus: boolean) {
    setAccountOpen(false);
    if (restoreFocus) returnFocusAfterClose(accountTriggerRef);
  }

  function focusAccountItem(target: "first" | "last" | 1 | -1) {
    const items = Array.from(accountMenuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    if (items.length === 0) return;
    const activeIndex = items.findIndex(item => item === document.activeElement);
    const nextIndex =
      target === "first" ? 0 : target === "last" ? items.length - 1 : (activeIndex + target + items.length) % items.length;
    items[nextIndex]?.focus();
  }

  function handleAccountMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      // Never let this bubble to the rail's own Escape-collapses-rail
      // listener above — the account menu closes on its own terms.
      event.stopPropagation();
      closeAccountMenu(true);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusAccountItem(1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      focusAccountItem(-1);
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      focusAccountItem("first");
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      focusAccountItem("last");
      return;
    }
    if (event.key === "Tab") {
      // Tab never walks a menu — close and hand focus back synchronously.
      event.preventDefault();
      setAccountOpen(false);
      accountTriggerRef.current?.focus();
    }
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
          // NOT overflow-hidden: the account popup below is an absolutely
          // positioned descendant that renders outside this box (left-full),
          // and an ancestor's overflow-hidden clips positioned descendants
          // too, not just in-flow ones — it doesn't matter that the popup is
          // itself positioned against a nearer ancestor. Each item that needs
          // to clip its own label during the width transition carries its own
          // overflow-hidden instead (see ITEM), scoped to that item's box.
          "fixed bottom-0 left-0 top-0 z-[80] flex flex-col border-r border-[var(--admin-chrome-border)] bg-[var(--admin-chrome-bg)] transition-[width] duration-150 ease-out",
          open ? "w-[208px] shadow-[8px_0_24px_rgba(0,0,0,.35)]" : "w-12"
        ].join(" ")}
      >
        {skipLink && (
          <a
            href={skipLink.href}
            className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-[60] focus:border focus:border-[var(--admin-primary)] focus:bg-[var(--admin-chrome-bg)] focus:px-3 focus:py-2 focus:text-[12.5px] focus:font-semibold focus:text-[var(--admin-chrome-text)] focus:outline-none"
          >
            {skipLink.label}
          </a>
        )}
        <button
          ref={hamburgerRef}
          type="button"
          onClick={() => setOpen(current => !current)}
          aria-expanded={open}
          aria-controls="app-rail"
          aria-label={open ? "Collapse navigation" : "Expand navigation"}
          title={open ? "Collapse navigation" : "Expand navigation"}
          className={[ITEM, ITEM_IDLE, "shrink-0 text-[var(--admin-chrome-text)]"].join(" ")}
        >
          <span className={CELL}>
            <HamburgerIcon />
          </span>
          {/* Decorative duplicate of the button's own aria-label — hidden
              from AT so the rail isn't announced twice. */}
          <span
            aria-hidden="true"
            className={[
              LABEL_BASE,
              "flex items-center gap-2 text-[12.5px] font-semibold text-[var(--admin-chrome-text)]",
              open ? "opacity-100" : "opacity-0"
            ].join(" ")}
          >
            <Image
              src="/images/megeredchian-mark.png?v=ma-2026-128"
              alt=""
              width={20}
              height={20}
              unoptimized
              className="h-5 w-5 object-contain"
            />
            Seat Planner
          </span>
        </button>
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
        <Link
          href="/"
          title="Viewer — published map"
          aria-label="Open viewer surface"
          onClick={event => handleNavClick(event, "/", "the viewer")}
          className={[ITEM, ITEM_IDLE, "mb-0.5"].join(" ")}
        >
          <NavItemBody icon={<ViewerIcon />} label="Viewer" open={open} />
        </Link>
        {/* Account cell: menu, not a bare sign-out (approved deviation #2,
            plan §Global Constraints). Keyboard/scrim contract copied from
            components/ui/AccountMenu.tsx — focus-first-item on open, arrow
            roving, Home/End, Escape/Tab close + trigger refocus, transparent
            scrim. */}
        <div className="relative mb-2 shrink-0">
          <button
            ref={accountTriggerRef}
            type="button"
            aria-haspopup="menu"
            aria-expanded={accountOpen}
            aria-controls={accountOpen ? accountMenuId : undefined}
            aria-label={`Account — ${email}`}
            title={`Account — ${email} (${roleLabel})`}
            onClick={() => (accountOpen ? closeAccountMenu(false) : setAccountOpen(true))}
            className={[ITEM, ITEM_IDLE].join(" ")}
          >
            <span className={CELL}>
              <span className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-[var(--admin-brand)] text-[11px] font-semibold text-[var(--admin-primary-ink)]">
                {initial}
              </span>
            </span>
            {/* Decorative duplicate of the button's own aria-label. */}
            <span aria-hidden="true" className={["min-w-0 text-left", LABEL_BASE, open ? "opacity-100" : "opacity-0"].join(" ")}>
              <span className="block max-w-[140px] truncate text-[11.5px] text-[var(--admin-chrome-text)]">{email}</span>
              <span className="block text-[10.5px] text-[var(--admin-chrome-muted)]">{roleLabel}</span>
            </span>
          </button>
          {accountOpen && (
            <>
              {/* Transparent scrim: outside click closes without stealing the click. */}
              <button
                type="button"
                aria-hidden="true"
                tabIndex={-1}
                data-account-menu-scrim
                onClick={() => closeAccountMenu(false)}
                className="fixed inset-0 z-40 cursor-default"
              />
              <div
                ref={accountMenuRef}
                id={accountMenuId}
                role="menu"
                aria-label="Account"
                onKeyDown={handleAccountMenuKeyDown}
                className="absolute bottom-1 left-full z-[81] ml-1 w-60 border border-white/15 bg-[var(--admin-chrome-elevated)] py-1 shadow-elevation-3"
              >
                <div className="border-b border-white/10 px-3 pb-2 pt-1.5">
                  <div className="truncate text-[12.5px] font-medium text-[var(--admin-chrome-text)]">{email}</div>
                  <div className="text-[11px] text-[var(--admin-chrome-muted)]">{roleLabel}</div>
                </div>
                <form action="/auth/signout" method="post" className="contents">
                  <button type="submit" role="menuitem" tabIndex={-1} className={menuItemClassName}>
                    <SignOutIcon />
                    Sign out
                  </button>
                </form>
              </div>
            </>
          )}
        </div>
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

function HamburgerIcon() {
  return (
    <svg aria-hidden="true" width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M3 5.5h14M3 10h14M3 14.5h14" />
    </svg>
  );
}

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
  return (
    <svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="12" r="8.2" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function SignOutIcon() {
  // Copied from AccountMenu.tsx's sign-out glyph for visual identity.
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5 shrink-0">
      <path d="M8.5 3.5H4.5v13h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12.5 6.5 16 10l-3.5 3.5M16 10H8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AiCell({ open }: { open: boolean }) {
  return (
    <>
      <span className={[CELL, "relative"].join(" ")}>
        <span aria-hidden="true" className="text-[15px]">
          ✦
        </span>
        <span
          aria-hidden="true"
          className="absolute right-1 top-1 border border-[var(--admin-ai-chrome-border)] px-[2px] text-[7.5px] font-bold text-[var(--admin-ai-chrome-text)]"
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
