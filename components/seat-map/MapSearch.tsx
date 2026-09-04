"use client";

// The control row's focused search field (DECISIONS D1-d; PHASE3DS §1.15
// `.sp-search`; Phase 4 PR 3a). One field for both surfaces: leading
// magnifier, an unlabelled input (the placeholder is the label — SKILL:
// never label a search field), a `.sp-kbd` platform hint while empty, a
// clear × once a query exists, and the trailing scope segment ("This floor"
// / "Whole building"). Results open in the 560px palette the surface mounts
// beside this field; this component owns the field only.
//
// Keyboard (kept from the viewer's field): Escape peels palette → query and
// prevents the native type="search" clear (which collapsed two layers into
// one); ArrowDown hops into the palette; Enter opens a unique match.

import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from "react";
import { SEARCH_SCOPE_LABELS, type SearchScope } from "@/lib/mapSearchScope";
import { ChevronIcon, CloseIcon, SearchIcon } from "@/components/seat-map/mapIcons";

export type MapSearchProps = {
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
  scope: SearchScope;
  onScopeChange: (scope: SearchScope) => void;
  /** "Ctrl K" / "⌘ K" once hydrated; null before (the server renders nothing). */
  hint: string | null;
  placeholder: string;
  /** Stable input id — the marker rig and the surfaces' Ctrl/⌘ K handler focus it. */
  inputId: string;
  inputRef?: RefObject<HTMLInputElement | null>;
  /** The field wrapper — the palette anchors to its left edge and outside-click treats it as inside. */
  rootRef?: RefObject<HTMLDivElement | null>;
  paletteOpen: boolean;
  /** id of the palette listbox while open (aria-controls). */
  paletteId?: string;
  onOpenPalette: () => void;
  onClosePalette: () => void;
  /** ArrowDown from the field: focus the first palette row. */
  onArrowDown: () => void;
  /** Enter with a query: open the first result if there is exactly one match (the surface decides). */
  onEnter: () => void;
  ariaLabel?: string;
};

export function MapSearch({
  value, onChange, onClear, scope, onScopeChange, hint, placeholder, inputId, inputRef, rootRef, paletteOpen, paletteId,
  onOpenPalette, onClosePalette, onArrowDown, onEnter, ariaLabel = "Find a person or seat"
}: MapSearchProps) {
  const [scopeOpen, setScopeOpen] = useState(false);
  const scopeRootRef = useRef<HTMLSpanElement | null>(null);
  const scopeMenuId = useId();

  useEffect(() => {
    if (!scopeOpen) return;
    function handleOutsidePointer(event: PointerEvent) {
      if (scopeRootRef.current?.contains(event.target as Node)) return;
      setScopeOpen(false);
    }
    document.addEventListener("pointerdown", handleOutsidePointer);
    return () => document.removeEventListener("pointerdown", handleOutsidePointer);
  }, [scopeOpen]);

  function handleKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      // Two layers, peeled one per press: the palette first, then the query.
      // preventDefault on both — type="search"'s native clear would otherwise
      // wipe the query on the first press.
      if (paletteOpen) {
        event.preventDefault();
        event.stopPropagation();
        onClosePalette();
        return;
      }
      if (value) {
        event.preventDefault();
        event.stopPropagation();
        onClear();
      }
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!paletteOpen) onOpenPalette();
      onArrowDown();
      return;
    }
    if (event.key === "Enter" && value.trim()) {
      event.preventDefault();
      onEnter();
    }
  }

  return (
    <div ref={rootRef} className="sp-search" role="search" aria-label={ariaLabel}>
      <SearchIcon />
      <input
        ref={inputRef}
        id={inputId}
        type="search"
        name="seat-search"
        autoComplete="off"
        spellCheck={false}
        placeholder={placeholder}
        aria-label={ariaLabel}
        aria-controls={paletteOpen ? paletteId : undefined}
        value={value}
        onChange={event => onChange(event.target.value)}
        // Click, focus, typing and Ctrl/⌘ K are the four doors onto the
        // palette (D1-d): a click on an already-focused field fires no focus
        // event, so it opens through onClick.
        onFocus={() => { if (!paletteOpen) onOpenPalette(); }}
        onClick={() => { if (!paletteOpen) onOpenPalette(); }}
        onKeyDown={handleKeyDown}
      />
      {value ? (
        <button type="button" className="sp-search-clear" aria-label="Clear search" onClick={onClear}>
          <CloseIcon />
        </button>
      ) : hint ? (
        <span className="sp-kbd" aria-hidden="true">{hint}</span>
      ) : null}
      <span ref={scopeRootRef} className="relative flex">
        <button
          type="button"
          className="sp-search-scope"
          aria-haspopup="menu"
          aria-expanded={scopeOpen}
          aria-controls={scopeOpen ? scopeMenuId : undefined}
          aria-label={`Search scope: ${SEARCH_SCOPE_LABELS[scope]}`}
          onClick={() => setScopeOpen(open => !open)}
          onKeyDown={event => {
            if (event.key === "Escape" && scopeOpen) {
              event.stopPropagation();
              setScopeOpen(false);
            }
          }}
        >
          {SEARCH_SCOPE_LABELS[scope]} <ChevronIcon />
        </button>
        {scopeOpen && (
          <div id={scopeMenuId} role="menu" aria-label="Search scope" className="sp-menu" data-open="" style={{ width: 176, left: "auto", right: 0 }}>
            {(Object.keys(SEARCH_SCOPE_LABELS) as SearchScope[]).map(option => (
              <button
                key={option}
                type="button"
                role="menuitemradio"
                aria-checked={option === scope}
                aria-current={option === scope ? "true" : undefined}
                onClick={() => {
                  onScopeChange(option);
                  setScopeOpen(false);
                }}
              >
                {SEARCH_SCOPE_LABELS[option]}
              </button>
            ))}
          </div>
        )}
      </span>
    </div>
  );
}
