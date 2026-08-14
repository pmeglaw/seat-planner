"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import type { RefObject } from "react";
import { useCallback } from "react";
import { AccountMenu } from "@/components/ui/AccountMenu";
import type { AppRailActive } from "@/components/ui/AppRail";

// Top-bar-first chrome (2026-08-14 owner redesign): ONE full-width bar spans
// the viewport top on every (shell) route — the rail starts BELOW it. Zone
// contract (owner-confirmed): left = brand + surface-owned command cluster;
// center = document identity (the map's floor selector + crumb, or a static
// section title on sub-pages); right = surface-owned action cluster + the
// account menu. This bar replaces both AdminShellBar (the old sub-page brand
// bar) and SeatMap's own <header> — the map surface now portals its bar
// tenants into the slot elements this component registers via onSlotElement
// (see AppShellSlots in AppShell.tsx and the portals in SeatMap.tsx).
//
// The skip link lives here, as the bar's — and therefore the document's —
// first focusable. It moved from AppRail when the bar took the top of the
// tab order; the target ids stay per-surface (AppShell's SKIP_LINKS map).

export type AppTopBarSlot = "left" | "center" | "right";

const SECTION_TITLES: Record<AppRailActive, string | null> = {
  map: null,
  management: "Management",
  settings: "Settings",
  reception: "Reception"
};

export type AppTopBarProps = {
  active: AppRailActive;
  email: string;
  roleLabel: string;
  skipLink: { href: string; label: string };
  onSlotElement: (slot: AppTopBarSlot, element: HTMLElement | null) => void;
  /** Rail expansion state + toggle (owner call 2026-08-14: the hamburger
   *  lives in the bar's corner cell, directly above the rail it controls;
   *  AppShell owns the state). The ref lets the rail return focus here on
   *  Escape/scrim dismissal. */
  railOpen: boolean;
  onToggleRail: () => void;
  railToggleRef: RefObject<HTMLButtonElement | null>;
};

export function AppTopBar({ active, email, roleLabel, skipLink, onSlotElement, railOpen, onToggleRail, railToggleRef }: AppTopBarProps) {
  const pathname = usePathname();
  const sectionTitle = SECTION_TITLES[active];

  // Stable ref callbacks, one per slot: an inline `el => onSlotElement(...)`
  // closure would get a new identity every render, making React detach
  // (null) + re-attach (element) the ref on EVERY commit — each pair fires a
  // state update in AppShell and the render loops. useCallback keeps the
  // identity fixed so the refs only fire on real mount/unmount.
  const setLeftSlot = useCallback((element: HTMLElement | null) => onSlotElement("left", element), [onSlotElement]);
  const setCenterSlot = useCallback((element: HTMLElement | null) => onSlotElement("center", element), [onSlotElement]);
  const setRightSlot = useCallback((element: HTMLElement | null) => onSlotElement("right", element), [onSlotElement]);

  return (
    /* z-50 keeps the chrome tier above z-40 page overlays (same rank the old
       per-surface bars held). sticky, not fixed: the bar participates in flow,
       so page roots keep their min-h-[calc(100svh-var(--admin-chrome-h))]
       sizing untouched. NO border-b on the header itself and no left padding:
       the chrome must read as ONE upside-down L (owner call 2026-08-14) — the
       brand mark sits centered in a w-12 corner cell aligned with the rail
       column below, and the bottom hairline starts only to the RIGHT of that
       column (the absolute span below), so no seam ever cuts the corner. */
    <header className="sticky top-0 z-50 flex h-[var(--admin-chrome-h)] shrink-0 items-center bg-[var(--admin-chrome-bg)] text-[var(--admin-chrome-text)]">
      <span aria-hidden="true" className="pointer-events-none absolute bottom-0 left-12 right-0 h-px bg-[var(--admin-chrome-border)]" />
      <a
        href={skipLink.href}
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-[60] focus:border focus:border-[var(--admin-primary)] focus:bg-[var(--admin-chrome-bg)] focus:px-3 focus:py-2 focus:text-[12.5px] focus:font-semibold focus:text-[var(--admin-chrome-text)] focus:outline-none"
      >
        {skipLink.label}
      </a>
      <div className="flex min-w-0 shrink-0 items-center">
        {/* Corner cell: the rail toggle sits in the same 48px column as the
            rail's icon cells, directly above the overlay it controls — the
            L's corner is the menu control (owner call 2026-08-14). Quiet
            styling on purpose: hover brightens the glyph only, no row fill. */}
        <button
          ref={railToggleRef}
          type="button"
          onClick={onToggleRail}
          aria-expanded={railOpen}
          aria-controls="app-rail"
          aria-label={railOpen ? "Collapse navigation" : "Expand navigation"}
          title={railOpen ? "Collapse navigation" : "Expand navigation"}
          className="flex h-full w-12 shrink-0 items-center justify-center text-[var(--admin-chrome-muted)] transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--admin-primary)]"
        >
          <HamburgerIcon />
        </button>
        {/* Brand shifted right of the toggle. leading-[18px], not
            leading-none: truncate's overflow-hidden clips descenders (the g)
            at line-height 1. Wordmark only — the "· Seat Planner" suffix was
            dropped (owner call 2026-08-14): the centered document title
            carries the app identity now. */}
        <span aria-hidden="true" className="flex h-6 w-6 shrink-0 items-center justify-center">
          <Image src="/images/megeredchian-mark.png?v=ma-2026-128" alt="" width={24} height={24} unoptimized className="h-6 w-6 object-contain" />
        </span>
        <div aria-hidden="true" translate="no" className="ml-2 hidden min-w-0 truncate text-[12.5px] font-semibold leading-[18px] sm:block">
          Megeredchian Law
        </div>
      </div>
      {/* Left slot: the map surface portals its command cluster (undo/redo,
          kebab) here; empty on sub-pages. */}
      <div data-topbar-slot="left" ref={setLeftSlot} className="flex h-full min-w-0 shrink-0 items-center" />
      {/* Center: document identity, absolutely centered on the bar like the
          reference layout. pointer-events pass through the empty gutter so the
          flanking clusters stay clickable; slot content opts back in. The
          sub-page title is aria-hidden — each page renders its own real <h1>,
          this is the bar's visual echo of it (same convention as the brand
          text on the map header before this bar existed). */}
      <div className="pointer-events-none absolute left-1/2 top-0 flex h-full max-w-[42%] -translate-x-1/2 items-center">
        {sectionTitle ? (
          <div aria-hidden="true" className="hidden truncate text-[12.5px] font-semibold md:block">
            {sectionTitle}
          </div>
        ) : (
          <div data-topbar-slot="center" ref={setCenterSlot} className="pointer-events-auto flex h-full min-w-0 items-center gap-2" />
        )}
      </div>
      <div className="ml-auto flex h-full shrink-0 items-center">
        {/* Right slot: the map surface portals Ask Planner + the publish
            cluster here; empty on sub-pages. */}
        <div data-topbar-slot="right" ref={setRightSlot} className="flex h-full shrink-0 items-center" />
        {/* autoCloseKey: the bar persists across client navigations, so the
            menu must not linger over an incoming page — and a back/forward
            with the menu open must return focus to the trigger, the same
            guarantee the old rail account cell gave (see AccountMenu). */}
        <AccountMenu email={email} roleLabel={roleLabel} autoCloseKey={pathname} />
      </div>
    </header>
  );
}

function HamburgerIcon() {
  // Moved from AppRail with the toggle (17px, stroke 1.6 — the one glyph
  // that keeps its original heavier stroke; see AppRail's icon-sizing note).
  return (
    <svg aria-hidden="true" width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M3 5.5h14M3 10h14M3 14.5h14" />
    </svg>
  );
}
