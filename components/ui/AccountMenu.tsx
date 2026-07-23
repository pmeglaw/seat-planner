"use client";

import { useId, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { returnFocusAfterClose } from "@/components/ui/returnFocus";

type AccountMenuProps = {
  email: string;
  roleLabel: string;
  // Map surface only: Settings stays behind the identity chip (owner
  // preference) — as a labeled menu item. The callback runs the unsaved-edits
  // guard and, when allowed, performs the navigation itself.
  onSelectSettings?: () => void;
};

const menuItemClassName =
  "flex w-full items-center gap-2.5 px-3 py-2 text-left text-[12.5px] font-medium text-[#E7E1D8] transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--admin-primary)]";

/**
 * The chrome bar's identity chip, opened into a small account menu: signed-in
 * email + role, the map surface's Settings entry, and Sign out. Follows the
 * map kebab's menu-button contract — first item focused on open, arrow-key
 * roving, Escape/Tab close with trigger refocus.
 */
export function AccountMenu({ email, roleLabel, onSelectSettings }: AccountMenuProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();
  const initial = (email.trim()[0] ?? "?").toUpperCase();

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
        className="relative flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-[var(--admin-brand)] text-[11px] font-semibold text-[var(--admin-primary-ink)] transition after:absolute after:-inset-[9px] hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--admin-chrome-bg)]"
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
            className="absolute right-0 top-[34px] z-50 w-60 border border-white/15 bg-[var(--admin-chrome-elevated)] py-1 shadow-elevation-3"
          >
            <div className="border-b border-white/10 px-3 pb-2 pt-1.5">
              <div className="truncate text-[12.5px] font-medium text-[var(--admin-chrome-text)]">{email}</div>
              <div className="text-[11px] text-[var(--admin-chrome-muted)]">{roleLabel}</div>
            </div>
            {onSelectSettings && (
              <button
                type="button"
                role="menuitem"
                tabIndex={-1}
                onClick={() => {
                  setOpen(false);
                  onSelectSettings();
                }}
                className={menuItemClassName}
              >
                <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5 shrink-0">
                  <circle cx="10" cy="10" r="2.6" stroke="currentColor" strokeWidth="1.5" />
                  <path
                    d="M10 3v2.2M10 14.8V17M17 10h-2.2M5.2 10H3M14.9 5.1l-1.5 1.5M6.6 13.4l-1.5 1.5M14.9 14.9l-1.5-1.5M6.6 6.6 5.1 5.1"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
                Open settings
              </button>
            )}
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
