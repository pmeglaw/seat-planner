"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { FloorId } from "@/lib/floorIds";
import { FLOORS, listFloors } from "@/lib/floors";

// The union lives in lib/floorIds (multi-floor PR-1); re-exported so the map
// surfaces keep importing it from here.
export type { FloorId };

// Multi-floor PR-2: the options come from the registry (lib/floors) — one
// home for what floors exist and what they are called. An unmapped floor is a
// real destination now (every map surface renders a roster for it — the admin
// editor too, since PR-3 retired its placeholder), so the old SOON badge is
// gone; the roster header explains itself. The garage (Floor 1) is
// intentionally absent from the registry.

type FloorSelectorProps = {
  floor: FloorId;
  onChange: (floor: FloorId) => void;
  /** "canvas" (default) is the light floating-card look for the map stage;
   *  "chrome" restyles trigger + menu for the dark AppTopBar center slot
   *  (top-bar-first chrome). Identical structure, roles, and keyboard
   *  behavior in both — the APG menu pattern accessibility-source pins is
   *  variant-independent. */
  variant?: "canvas" | "chrome";
};

export function FloorSelector({ floor, onChange, variant = "canvas" }: FloorSelectorProps) {
  const chrome = variant === "chrome";
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();
  const options = listFloors();
  const current = FLOORS[floor];

  useEffect(() => {
    if (!open) return;

    function handleOutsidePointer(event: PointerEvent) {
      if (rootRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    }

    document.addEventListener("pointerdown", handleOutsidePointer);
    return () => document.removeEventListener("pointerdown", handleOutsidePointer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    window.requestAnimationFrame(() => {
      listRef.current?.querySelector<HTMLButtonElement>("[aria-checked='true']")?.focus();
    });
  }, [open]);

  function closeAndRefocus() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  function moveOptionFocus(direction: 1 | -1) {
    const options = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>("[role='menuitemradio']") ?? []);
    if (!options.length) return;
    const activeIndex = options.findIndex(option => option === document.activeElement);
    const nextIndex = activeIndex === -1 ? 0 : (activeIndex + direction + options.length) % options.length;
    options[nextIndex]?.focus();
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`Change floor. Current floor: ${current.label}`}
        onClick={() => setOpen(current => !current)}
        onKeyDown={event => {
          if (event.key === "ArrowDown" && !open) {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className={
          chrome
            ? "relative flex h-7 items-center gap-2 px-2.5 text-[12.5px] font-semibold text-[var(--sp-text-primary)] transition after:absolute after:-inset-y-2 after:inset-x-0 hover:bg-[var(--sp-background-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--sp-interactive)]"
            : "relative flex items-center gap-2 border border-[var(--sp-border-subtle)] bg-[var(--sp-layer-01)] px-2.5 py-1.5 text-[12.5px] font-semibold text-[var(--sp-text-primary)] shadow-sp transition after:absolute after:-inset-y-2 after:inset-x-0 hover:bg-[var(--sp-background)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sp-focus)]"
        }
      >
        {/* Chrome-variant trigger label (owner calls 2026-08-14): the centered
            bar title stays short and stable-width — the practice-group name
            alone; the floor number stays in the options and the aria-label. */}
        {chrome ? current.shortLabel : current.label}
        <svg aria-hidden="true" viewBox="0 0 20 20" className={chrome ? "h-3 w-3 text-[var(--sp-text-helper)]" : "h-3 w-3 text-[var(--sp-text-helper)]"}>
          <path d="m5.5 8 4.5 4.5L14.5 8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div
          ref={listRef}
          id={menuId}
          role="menu"
          aria-label="Floors"
          onKeyDown={event => {
            if (event.key === "Escape") {
              event.stopPropagation();
              closeAndRefocus();
              return;
            }
            if (event.key === "ArrowDown") {
              event.preventDefault();
              moveOptionFocus(1);
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              moveOptionFocus(-1);
            }
          }}
          className={
            chrome
              ? "absolute left-0 top-[calc(100%+4px)] z-40 min-w-[230px] border border-[var(--sp-border-strong)] bg-[var(--sp-layer-01)] py-1 shadow-sp"
              : "absolute left-0 top-[calc(100%+4px)] z-40 min-w-[230px] border border-[var(--sp-border-subtle)] bg-[var(--sp-layer-01)] py-1 shadow-sp"
          }
        >
          {options.map(option => (
            <button
              key={option.id}
              type="button"
              role="menuitemradio"
              aria-checked={option.id === floor}
              onClick={() => {
                onChange(option.id);
                closeAndRefocus();
              }}
              className={
                chrome
                  ? "flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-[12.5px] text-[var(--sp-text-primary)] transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--sp-interactive)]"
                  : "flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-[12.5px] text-[var(--sp-text-primary)] transition hover:bg-[var(--sp-background)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--sp-focus)]"
              }
            >
              <span className={option.id === floor ? "font-semibold" : undefined}>{option.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
