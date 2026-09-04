"use client";

// The control row's floor selector (PHASE3DS §1.14 `.sp-menu-button` +
// `.sp-menu`, Phase 4 PR 3a): a menu button on the field surface with a
// place marker and a chevron, opening a menu whose current item takes the
// 3px bar + layer-selected. Replaces FloorSelector's two variants — one
// look now that the tenant row is gone. Roles, names and keyboard behaviour
// are the APG menu-button pattern accessibility-source pins: the trigger is
// "Change floor. Current floor: …", the options are menuitemradio with
// aria-checked, ArrowDown opens, Escape closes and refocuses.

import { useEffect, useId, useRef, useState } from "react";
import type { FloorId } from "@/lib/floorIds";
import { FLOORS, listFloors } from "@/lib/floors";
import { ChevronIcon, PinIcon } from "@/components/seat-map/mapIcons";

export type { FloorId };

type FloorMenuButtonProps = {
  floor: FloorId;
  onChange: (floor: FloorId) => void;
  /** Optional per-floor meta ("68 seats" / "40 people") for the menu rows. */
  meta?: Partial<Record<FloorId, string>>;
};

export function FloorMenuButton({ floor, onChange, meta }: FloorMenuButtonProps) {
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
    const items = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>("[role='menuitemradio']") ?? []);
    if (!items.length) return;
    const activeIndex = items.findIndex(option => option === document.activeElement);
    const nextIndex = activeIndex === -1 ? 0 : (activeIndex + direction + items.length) % items.length;
    items[nextIndex]?.focus();
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        className="sp-menu-button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`Change floor. Current floor: ${current.label}`}
        onClick={() => setOpen(value => !value)}
        onKeyDown={event => {
          if (event.key === "ArrowDown" && !open) {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <PinIcon />
        <span className="sp-menu-button-label">{current.label}</span>
        <ChevronIcon className="sp-chevron" />
      </button>
      {open && (
        <div
          ref={listRef}
          id={menuId}
          role="menu"
          aria-label="Floors"
          className="sp-menu"
          data-open=""
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
        >
          {options.map(option => (
            <button
              key={option.id}
              type="button"
              role="menuitemradio"
              aria-checked={option.id === floor}
              aria-current={option.id === floor ? "true" : undefined}
              onClick={() => {
                onChange(option.id);
                closeAndRefocus();
              }}
            >
              <span>{option.label}</span>
              {meta?.[option.id] ? <span className="sp-menu-meta">{meta[option.id]}</span> : null}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
