"use client";

import Image from "next/image";
import Link from "next/link";
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { returnFocusAfterClose } from "@/components/ui/returnFocus";

// v12 left rail (design_handoff_carbon_v12 §structural move 1, prototype lines
// 25-60). 48px collapsed column, full viewport height, 208px overlay when
// expanded; item click / outside click / Escape collapse it. Owner rulings
// 2026-07-31: this geometry (not concepts/nav-rail's 36px), account lives in
// the rail bottom cell. People item lands with the People panel slice — see
// the breadcrumb on NAV_ITEMS below.
//
// Icon sizing follows the plan's restated constraint (17px, stroke 1.5,
// hamburger 1.6) rather than the raw prototype markup, which used 16px for
// the hamburger and 1.8 stroke for the viewer glyph specifically — the plan
// text is the authoritative "exact values" source for this task.

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

const ITEM =
  "relative flex h-11 w-full items-center text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--admin-primary)]";
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
  { key: "settings", label: "Settings", href: "/admin/settings", icon: <SettingsIcon /> }
  // People item lands with the People panel slice (owner ruling 2026-07-31, deliberately omitted here).
];

export function AppRail({ active, email, roleLabel, onNavigate, onOpenAskPlanner }: AppRailProps) {
  const [open, setOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const hamburgerRef = useRef<HTMLButtonElement | null>(null);
  const accountTriggerRef = useRef<HTMLButtonElement | null>(null);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);
  const accountMenuId = useId();
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
        aria-label="Admin sections"
        data-expanded={open}
        className={[
          "fixed bottom-0 left-0 top-0 z-[80] flex flex-col overflow-hidden border-r border-[var(--admin-chrome-border)] bg-[var(--admin-chrome-bg)] transition-[width] duration-150 ease-out",
          open ? "w-[208px] shadow-[8px_0_24px_rgba(0,0,0,.35)]" : "w-12"
        ].join(" ")}
      >
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
              src="/images/megeredchian-mark.png?v=ma-2026"
              alt=""
              width={20}
              height={20}
              unoptimized
              className="h-5 w-5 object-contain"
            />
            Seat Planner
          </span>
        </button>
        {NAV_ITEMS.map(item => (
          <button
            key={item.key}
            type="button"
            title={item.label}
            aria-current={item.key === active ? "page" : undefined}
            onClick={() => navigate(item.href, item.label)}
            className={[
              ITEM,
              item.key === active ? ITEM_ACTIVE : ITEM_IDLE,
              item.key === active ? "font-semibold" : "font-medium"
            ].join(" ")}
          >
            <span className={CELL}>{item.icon}</span>
            {/* NOT aria-hidden: this text is the button's only accessible
                name, and must stay mounted (opacity swap) so a collapsed
                rail is still announced correctly. */}
            <span className={[LABEL_BASE, open ? "opacity-100" : "opacity-0"].join(" ")}>{item.label}</span>
          </button>
        ))}
        <div className="flex-1" />
        {/* Ask Planner — the AI entry. AI blue (--admin-ai-chrome-text /
            --admin-ai-chrome-border) is reserved for AI presence and must not
            appear on any non-AI control in this component. */}
        {onOpenAskPlanner ? (
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
            onClick={() => collapse(false)}
            className={[ITEM, "text-[var(--admin-ai-chrome-text)] hover:bg-[var(--admin-chrome-hover)]"].join(" ")}
          >
            <AiCell open={open} />
          </Link>
        )}
        <button
          type="button"
          title="Viewer — published map"
          aria-label="Open viewer surface"
          onClick={() => navigate("/", "the viewer")}
          className={[ITEM, ITEM_IDLE, "mb-0.5"].join(" ")}
        >
          <span className={CELL}>
            <ViewerIcon />
          </span>
          <span className={[LABEL_BASE, open ? "opacity-100" : "opacity-0"].join(" ")}>Viewer</span>
        </button>
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
