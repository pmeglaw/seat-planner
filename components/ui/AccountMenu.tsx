"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { returnFocusAfterClose } from "@/components/ui/returnFocus";

type AccountMenuProps = {
  email: string;
  roleLabel: string;
  /** Persistent-chrome hosts (AppTopBar): pass the current pathname. When it
   *  changes, the menu closes so it can't linger over an incoming page, and —
   *  if closing stranded keyboard focus on <body> (back/forward with the menu
   *  open unmounts the focused menuitem) — focus returns to the trigger, the
   *  same guarantee every other dismissal path gives. Omit on surfaces that
   *  remount per document load (the viewer), which get this for free. */
  autoCloseKey?: string;
};

const menuItemClassName =
  "flex w-full items-center gap-2.5 px-3 py-2 text-left text-[12.5px] font-medium text-[var(--sp-chrome-heading)] transition hover:bg-white/10 hover:text-[var(--sp-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--sp-brand)]";

/**
 * The chrome bar's identity chip, opened into a small account menu: signed-in
 * email + role, and Sign out. Follows the map kebab's menu-button contract —
 * first item focused on open, arrow-key roving, Escape/Tab close with trigger
 * refocus.
 */
export function AccountMenu({ email, roleLabel, autoCloseKey }: AccountMenuProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();
  const initial = (email.trim()[0] ?? "?").toUpperCase();

  // Route-commit close for persistent hosts (see the autoCloseKey prop doc).
  // Adjust-state-during-render, not an effect: React re-renders immediately
  // with the closed state, so the stale menu never paints over the incoming
  // page. The focus restore runs in the keyed effect below, which reads the
  // PREVIOUS commit's open state through openLastCommitRef — the mirror
  // effect is declared after it on purpose (same-commit effects run top-down,
  // so the restore still sees the pre-navigation value). The <body> check
  // keeps a click-driven navigation from having its focus yanked off the
  // clicked control.
  const [lastAutoCloseKey, setLastAutoCloseKey] = useState(autoCloseKey);
  const openLastCommitRef = useRef(false);
  if (autoCloseKey !== lastAutoCloseKey) {
    setLastAutoCloseKey(autoCloseKey);
    setOpen(false);
  }
  useEffect(() => {
    if (autoCloseKey === undefined) return;
    if (openLastCommitRef.current && document.activeElement === document.body) {
      triggerRef.current?.focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed to route commits only
  }, [autoCloseKey]);
  useEffect(() => {
    openLastCommitRef.current = open;
  });

  function openMenu() {
    setOpen(true);
    window.requestAnimationFrame(() => {
      menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    });
  }

  function closeMenu(restoreFocus: boolean) {
    setOpen(false);
    if (restoreFocus) returnFocusAfterClose(triggerRef);
  }

  function focusItem(target: "first" | "last" | 1 | -1) {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    if (items.length === 0) return;
    const activeIndex = items.findIndex(item => item === document.activeElement);
    const nextIndex =
      target === "first" ? 0 : target === "last" ? items.length - 1 : (activeIndex + target + items.length) % items.length;
    items[nextIndex]?.focus();
  }

  function handleMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.stopPropagation();
      closeMenu(true);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusItem(1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      focusItem(-1);
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      focusItem("first");
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      focusItem("last");
      return;
    }
    if (event.key === "Tab") {
      // Tab never walks a menu — close and hand focus back synchronously.
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    }
  }

  return (
    <div className="relative mx-2.5 flex shrink-0 items-center">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`Account — ${email}`}
        title={`Account — ${email} (${roleLabel})`}
        onClick={() => (open ? closeMenu(false) : openMenu())}
        // Offset (non-inset) focus ring — a documented exception to the
        // chrome's ring-inset doctrine (adminChrome.ts): an inset ring on a
        // 26px circle would eat the monogram; the offset halo reads cleanly
        // against the dark bar.
        className="relative flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-[var(--sp-brand-mark)] text-[11px] font-semibold text-[var(--sp-text-on-brand)] transition after:absolute after:-inset-[9px] hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sp-brand)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--sp-background)]"
      >
        {initial}
      </button>
      {open && (
        <>
          {/* Transparent scrim: outside click closes without stealing the click. */}
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            onClick={() => closeMenu(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-label="Account"
            onKeyDown={handleMenuKeyDown}
            // top offset derives from the bar height token (bar 40px, 26px
            // avatar centered ends at 33px, +1px gap) so a chrome-h change
            // can't strand the menu — it used to be a hardcoded pixel
            // literal (tests/app-top-bar.test.mjs pins the token form).
            className="absolute right-0 top-[calc(var(--sp-chrome-height)-6px)] z-50 w-60 border border-[var(--sp-border-strong)] bg-[var(--sp-layer-01)] py-1 shadow-elevation-3"
          >
            <div className="border-b border-white/10 px-3 pb-2 pt-1.5">
              <div className="truncate text-[12.5px] font-medium text-[var(--sp-text-primary)]">{email}</div>
              <div className="text-[11px] text-[var(--sp-text-helper)]">{roleLabel}</div>
            </div>
            <Link href="/my-seat" role="menuitem" tabIndex={-1} className={menuItemClassName} onClick={() => closeMenu(false)}>
              <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5 shrink-0">
                <rect x="4" y="6" width="12" height="7" rx="1" stroke="currentColor" strokeWidth="1.5" />
                <path d="M6.5 13v3.5M13.5 13v3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              My seat
            </Link>
            <form action="/auth/signout" method="post" className="contents">
              <button type="submit" role="menuitem" tabIndex={-1} className={menuItemClassName}>
                <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5 shrink-0">
                  <path d="M8.5 3.5H4.5v13h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M12.5 6.5 16 10l-3.5 3.5M16 10H8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Sign out
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
