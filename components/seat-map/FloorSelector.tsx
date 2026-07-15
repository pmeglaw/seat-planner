"use client";

import { useEffect, useId, useRef, useState } from "react";

export type FloorId = "3" | "2";

export const FLOOR_LABELS: Record<FloorId, string> = {
  "3": "Floor 3 · Pre-Litigation",
  "2": "Floor 2 · Litigation"
};

// Multi-floor is UI scaffolding only (redesign spec §4/§9): Floor 2 exists in
// the selector but is not yet mapped — selecting it shows a placeholder. Real
// Floor 2 support (seats, floor-plan image, calibration) is a separate future
// project. The garage (Floor 1) is intentionally omitted.
const FLOORS: { id: FloorId; label: string; soon?: boolean }[] = [
  { id: "3", label: FLOOR_LABELS["3"] },
  { id: "2", label: FLOOR_LABELS["2"], soon: true }
];

type FloorSelectorProps = {
  floor: FloorId;
  onChange: (floor: FloorId) => void;
};

export function FloorPlaceholder() {
  return (
    <div role="status" className="grid min-h-[360px] w-full place-items-center p-6 text-center sm:min-h-[520px] lg:h-full lg:min-h-0">
      <div>
        <div className="text-sm font-semibold text-[var(--admin-text-primary)]">{FLOOR_LABELS["2"]}</div>
        <p className="mt-1 text-xs text-[var(--admin-text-muted)]">Not yet mapped — reserved for a future rollout.</p>
      </div>
    </div>
  );
}

export function FloorSelector({ floor, onChange }: FloorSelectorProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();

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
        aria-label={`Change floor. Current floor: ${FLOOR_LABELS[floor]}`}
        onClick={() => setOpen(current => !current)}
        onKeyDown={event => {
          if (event.key === "ArrowDown" && !open) {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className="flex items-center gap-2 border border-[var(--admin-border)] bg-[var(--admin-surface)] px-2.5 py-1.5 text-[12.5px] font-semibold text-[var(--admin-text-primary)] transition hover:bg-[var(--admin-surface-alt)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-focus)]"
      >
        {FLOOR_LABELS[floor]}
        <svg aria-hidden="true" viewBox="0 0 20 20" className="h-3 w-3 text-[var(--admin-text-muted)]">
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
          className="absolute left-0 top-[calc(100%+4px)] z-40 min-w-[230px] border border-[var(--admin-border)] bg-[var(--admin-surface)] py-1 shadow-elevation-3"
        >
          {FLOORS.map(option => (
            <button
              key={option.id}
              type="button"
              role="menuitemradio"
              aria-checked={option.id === floor}
              onClick={() => {
                onChange(option.id);
                closeAndRefocus();
              }}
              className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-[12.5px] text-[var(--admin-text-primary)] transition hover:bg-[var(--admin-surface-alt)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--admin-focus)]"
            >
              <span className={option.id === floor ? "font-semibold" : undefined}>{option.label}</span>
              {option.soon && (
                <span className="shrink-0 border border-[var(--admin-border)] px-1.5 py-0.5 text-[9.5px] font-medium text-[var(--admin-text-muted)]">SOON</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
