"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, RefObject } from "react";
import { cx } from "@/components/ui/design-system";
import { buildInitials } from "@/lib/validators";
import { useVirtualListWindow } from "@/components/seat-map/useVirtualListWindow";
import { stepFocusIndex } from "@/lib/virtualizedList";
import type { ViewerPaletteBrowse } from "@/lib/viewerFindPalette";
import type { ViewerSearchResult, ViewerSearchResultKind } from "@/lib/viewerSeatSearch";

/**
 * The viewer's Find palette (Viewer v12 handoff, contracts #2/#3/#9) — the ONE
 * surface that replaced the docked search-results panel, the docked People
 * directory, its collapse rail, and the mobile PEOPLE pill.
 *
 * Two modes in one slot: empty query = BROWSE (zone chips + the A→Z people
 * feed from lib/viewerFindPalette), any query = the existing search result
 * rows. They are never both on screen, which is the whole point — the retired
 * design had two docked surfaces racing for the same right column.
 *
 * PRESENTATIONAL. Open/close, selection, Esc layering and every piece of data
 * stay in ViewerSeatFinder; this renders the feed it is handed and reports
 * events back. The only state it owns is render-layer: the measured anchor
 * frame and the list window.
 *
 * PUBLISHED DATA ONLY — `browse` and `results` must be built from the
 * published layer + the published_employees snapshot. This component reads no
 * table at all, so that stays the caller's contract.
 */

// Contract #2 geometry. The palette aligns its LEFT edge to the search field
// and floats over the plan, so the map never reflows for it.
const PALETTE_WIDTH_PX = 560;
const PALETTE_EDGE_INSET_PX = 12;
const PALETTE_ANCHOR_GAP_PX = 6;
// Contract #2's "max-h viewport − 60", read as the gap it leaves at the BOTTOM
// rather than as a raw height cap. Taken as a cap the palette would end 18px
// off the screen edge and bury the status legend, which is permanent and
// always relevant; measured against the bottom it clears the legend by a
// hair — and on a launch-scale directory the palette is at this cap always,
// so the difference is the resting look, not an edge case.
const PALETTE_BOTTOM_INSET_PX = 60;
// The `panel` tier minimum (tailwind.config.ts), mirrored from ViewerSeatFinder:
// below it the palette is a full-width sheet under the bar, with the SAME
// content — trimming it would cost phone users zone browsing (owner answer 3).
const VIEWER_PANEL_BREAKPOINT_PX = 900;

const KIND_LABELS: Record<ViewerSearchResultKind, string> = {
  person: "Person",
  seat: "Seat",
  department: "Department",
  zone: "Zone"
};

function resultKindClass(kind: ViewerSearchResultKind) {
  if (kind === "person") return "bg-[var(--sp-status-neutral-surface)] text-[var(--sp-status-neutral-strong)] ring-[color-mix(in_srgb,var(--sp-status-neutral-strong)_30%,transparent)]";
  if (kind === "seat") return "sp-zone-chrome bg-[var(--sp-background)] text-white ring-[var(--sp-background)]";
  if (kind === "department") return "bg-[var(--sp-status-success-surface)] text-[var(--sp-status-success-strong)] ring-[color-mix(in_srgb,var(--sp-status-success-strong)_30%,transparent)]";
  return "bg-[var(--sp-status-pending-surface)] text-[var(--sp-status-pending-text)] ring-[color-mix(in_srgb,var(--sp-status-pending-text)_30%,transparent)]";
}

// Eyebrow rows. The mock draws these at #8E8276, which measures 3.75:1 on
// white and fails AA at this size — the same call `LoginForm` and
// `app/concepts/login-v12` already made, so they take --sp-text-helper
// (#6E655A, 5.7:1) instead. Deliberate deviation from the drawing.
// Type-floor Ruling 3 (2026-08-24): 12px floor for eyebrows — subordination
// via weight + the muted helper token, not size.
const eyebrowClassName = "text-xs font-semibold uppercase tracking-[0.12em] text-[var(--sp-text-helper)]";

type PaletteFrame = { left: number; top: number; width: number | null; maxHeight: number };

/**
 * Where the palette sits, in viewport px. Measured rather than declared,
 * because the field's left edge moves with the chrome (brand block, divider
 * and Filter trigger all change width across breakpoints), so no static
 * offset can align to it.
 */
function measurePaletteFrame(anchor: HTMLElement | null): PaletteFrame | null {
  if (!anchor) return null;
  const rect = anchor.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const top = rect.bottom + PALETTE_ANCHOR_GAP_PX;
  // Floored so a very short viewport still shows a usable slice rather than a
  // sliver or a negative height.
  const maxHeight = Math.max(160, viewportHeight - top - PALETTE_BOTTOM_INSET_PX);

  if (viewportWidth < VIEWER_PANEL_BREAKPOINT_PX) {
    // Full-width sheet under the bar: `width: null` lets the inset-x classes
    // own the horizontal box, so it follows the viewport without re-measuring.
    return { left: PALETTE_EDGE_INSET_PX, top, width: null, maxHeight };
  }

  const width = Math.min(PALETTE_WIDTH_PX, Math.max(240, viewportWidth - PALETTE_EDGE_INSET_PX * 2));
  const left = Math.max(PALETTE_EDGE_INSET_PX, Math.min(rect.left, viewportWidth - width - PALETTE_EDGE_INSET_PX));
  return { left, top, width, maxHeight };
}

export type ViewerFindPaletteProps = {
  /** The search field wrapper the left edge aligns to (contract #2). */
  anchorRef: RefObject<HTMLElement | null>;
  /** Handed back to the parent, which owns outside-click dismissal. */
  containerRef: RefObject<HTMLDivElement | null>;
  /** ArrowUp off the first row returns focus to the field the rows came from. */
  searchInputRef: RefObject<HTMLInputElement | null>;
  /** Trimmed query; empty selects browse mode. */
  query: string;
  browse: ViewerPaletteBrowse;
  results: ViewerSearchResult[];
  /** "3 results" / "1 result" — composed by the caller, which also puts it in the legend. */
  resultCountLabel: string;
  mappedSeatCount: number;
  activeResultId: string | null;
  selectedSeatId: string | null;
  /** The pinned zone filter, or "all". */
  pinnedZone: string;
  onZoneHoverChange: (zone: string | null) => void;
  onZonePin: (zone: string) => void;
  onRowHoverChange: (seatId: string | null) => void;
  onOpenRow: (row: ViewerSearchResult) => void;
  onClearSearch: () => void;
};

export function ViewerFindPalette({
  anchorRef,
  containerRef,
  searchInputRef,
  query,
  browse,
  results,
  resultCountLabel,
  mappedSeatCount,
  activeResultId,
  selectedSeatId,
  pinnedZone,
  onZoneHoverChange,
  onZonePin,
  onRowHoverChange,
  onOpenRow,
  onClearSearch
}: ViewerFindPaletteProps) {
  const queryActive = Boolean(query);
  const [frame, setFrame] = useState<PaletteFrame | null>(null);

  // Layout effect, not a plain effect: the palette is positioned from a
  // measurement, so a post-paint read would show it at 0,0 for one frame and
  // then jump. It only ever mounts client-side (the parent renders it behind
  // `paletteOpen`, which starts false), so this never runs during SSR.
  useLayoutEffect(() => {
    const measure = () => setFrame(measurePaletteFrame(anchorRef.current));
    measure();
    // No scroll listener: the bar is sticky and the map owns its own scroll
    // container, so the field never moves vertically under the page. But a
    // synchronous read on `resize` alone is not enough — the bar re-wraps its
    // tiers from its own resize handler (React state), which moves the anchor
    // *after* this handler has already measured. The rAF re-read lands after
    // that re-render; the ResizeObserver covers anchor-box changes that arrive
    // without a window resize at all.
    let rafId = 0;
    const onResize = () => {
      measure();
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(measure);
    };
    window.addEventListener("resize", onResize);
    const anchor = anchorRef.current;
    const observer = new ResizeObserver(measure);
    if (anchor) observer.observe(anchor);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", onResize);
      observer.disconnect();
    };
  }, [anchorRef]);

  // Closing while a chip is hovered or focused unmounts it without ever firing
  // mouseleave/blur, which would strand the preview wash on the map. One
  // unmount cleanup covers every close path (Escape, outside click, ⌘K
  // toggle) — the same trap FilterPanel documents.
  const zoneHoverRef = useRef(onZoneHoverChange);
  const rowHoverRef = useRef(onRowHoverChange);
  useEffect(() => {
    zoneHoverRef.current = onZoneHoverChange;
    rowHoverRef.current = onRowHoverChange;
  }, [onRowHoverChange, onZoneHoverChange]);
  useEffect(() => () => {
    zoneHoverRef.current?.(null);
    rowHoverRef.current?.(null);
  }, []);

  // Windowed browse feed: at launch scale the A→Z list is 61+ rows (the real
  // directory is not loaded yet — production's 16 people are placeholder), so
  // the windowing that looked dormant on the retired panel starts earning its
  // keep here. Query mode deliberately renders EVERY row instead — see the
  // roving handlers below, which depend on that difference.
  const {
    setListElement: setBrowseListElement,
    listElement: browseListElement,
    window: browseWindow,
    segments: browseSegments,
    focusRow: focusBrowseRow
  } = useVirtualListWindow(browse.people.length, { defaultRowHeight: 44 });

  // Arrow roving over query results — DOM-walking form, which is only safe
  // because query mode renders every row. ArrowUp from the first row returns
  // focus to the search input.
  function handleResultsKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="listitem"] button:not([disabled])'));
    if (items.length === 0) return;
    event.preventDefault();
    const activeIndex = items.findIndex(item => item === document.activeElement);
    if (event.key === "ArrowDown") {
      items[activeIndex === -1 ? 0 : Math.min(items.length - 1, activeIndex + 1)]?.focus();
      return;
    }
    if (activeIndex <= 0) {
      searchInputRef.current?.focus();
      return;
    }
    items[activeIndex - 1]?.focus();
  }

  // Windowed-list roving for browse mode: absolute indices via stepFocusIndex,
  // because only a slice of rows is mounted. A DOM walk here would read the
  // first RENDERED row as "first" and warp mid-list ArrowUp into the field.
  function handleBrowseKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const rows = browse.people;
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    if (rows.length === 0) return;
    event.preventDefault();
    const direction = event.key === "ArrowDown" ? 1 : -1;
    const activeRow = document.activeElement instanceof HTMLElement ? document.activeElement.closest("[data-vindex]") : null;
    const rawIndex = activeRow && browseListElement?.contains(activeRow) ? Number(activeRow.getAttribute("data-vindex")) : NaN;
    const target = stepFocusIndex({
      itemCount: rows.length,
      currentIndex: Number.isInteger(rawIndex) ? rawIndex : null,
      direction,
      isDisabled: index => Boolean(rows[index]?.disabled),
      fallbackIndex: browseWindow.startIndex
    });
    if (target === null) {
      if (direction === -1) searchInputRef.current?.focus();
      return;
    }
    focusBrowseRow(target);
  }

  const listClassName =
    "min-h-0 flex-1 overflow-y-auto overscroll-contain focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--sp-focus)]";

  return (
    <div
      ref={containerRef}
      id="viewer-find-palette"
      role="group"
      aria-label="Find people, seats and zones"
      style={{
        left: frame?.left ?? PALETTE_EDGE_INSET_PX,
        top: frame?.top ?? 42,
        width: frame?.width ?? undefined,
        // The px cap is measured, the home-indicator allowance is not: env()
        // has no JS reading, so the two are combined here in CSS. Without it
        // the footer legend lands under the indicator on a phone (#198).
        maxHeight: frame ? `calc(${frame.maxHeight}px - env(safe-area-inset-bottom))` : undefined
      }}
      className={cx(
        // Floats (contract #2): fixed, above the floating map cards, and it
        // reserves no stage width — the map behind it never reflows.
        "fixed z-[70] flex flex-col overflow-hidden border border-[var(--sp-border-subtle)] bg-[var(--sp-layer-01)] shadow-elevation-4",
        // Below the panel tier the measured width is null and these own the box.
        frame?.width === null ? "right-3" : "",
        "motion-safe:animate-[sp-panel-in_150ms_ease-out]"
      )}
    >
      {queryActive ? (
        <>
          <div className="flex items-baseline justify-between gap-3 border-b border-[var(--sp-border-subtle)] px-4 pb-2.5 pt-3">
            <h2 id="viewer-results-title" className={eyebrowClassName}>Results</h2>
            <span aria-live="polite" className="text-xs font-medium text-[var(--sp-text-helper)]">
              {resultCountLabel} · {mappedSeatCount} mapped
            </span>
          </div>

          {/* List tabIndex: the region must stay keyboard-scrollable on its own
              (axe scrollable-region-focusable) — every row is a <button>, but
              rows for unseated people render disabled, and a list where ALL
              rows are disabled otherwise has no tab stop at all. */}
          {results.length > 0 ? (
            <div
              role="list"
              aria-label="Viewer search results"
              tabIndex={0}
              onKeyDown={handleResultsKeyDown}
              className={cx(listClassName, "space-y-1 p-2")}
            >
              {results.map(result => {
                const selected = result.id === activeResultId || Boolean(result.seatId && result.seatId === selectedSeatId);
                return (
                  <div role="listitem" key={result.id}>
                    <button
                      type="button"
                      disabled={result.disabled}
                      aria-current={selected ? "true" : undefined}
                      aria-label={`${KIND_LABELS[result.kind]} result. ${result.title}. ${result.subtitle}. ${result.meta}.${selected ? " Selected." : ""}`}
                      onClick={() => onOpenRow(result)}
                      // No hover-locate on result rows, deliberately: a seat
                      // lit from here would announce itself as "highlighted
                      // from the people list" while the reason was a search
                      // row, and the two causes are kept separately
                      // announceable on purpose (accessibility-source).
                      className={cx(
                        "grid w-full grid-cols-[minmax(0,1fr)_auto] items-start gap-3 border p-2.5 text-left transition hover:border-[var(--sp-brand-border)] hover:bg-[var(--sp-brand-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sp-focus)] disabled:cursor-not-allowed disabled:opacity-60",
                        selected ? "border-[var(--sp-brand-border)] bg-[var(--sp-brand-subtle)]" : "border-transparent"
                      )}
                    >
                      <span className="min-w-0">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="truncate text-sm font-semibold text-[var(--sp-text-primary)]">{result.title}</span>
                          {/* 12px per the P3 ruling (2026-08-25) — this was the
                              9px floor-breaker, and it is a WORD (the kind
                              half of the badge's color+word signal pair), so
                              F6's words-off-canvas logic applies. */}
                          <span className={cx("shrink-0 rounded-full px-2 py-0.5 text-xs font-bold uppercase tracking-wide ring-1", resultKindClass(result.kind))}>
                            {KIND_LABELS[result.kind]}
                          </span>
                        </span>
                        <span className="mt-1 block truncate text-xs font-medium text-[var(--sp-text-secondary)]">{result.subtitle}</span>
                        <span className="mt-0.5 block truncate text-xs text-[var(--sp-text-helper)]">{result.meta}</span>
                      </span>
                      <span className="shrink-0 rounded-full bg-[var(--sp-background)] px-2 py-1 font-mono text-[10px] font-semibold text-[var(--sp-text-helper)] ring-1 ring-[var(--sp-border-subtle)]">
                        {result.seatIds.length || "-"}
                      </span>
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div role="status" aria-live="polite" className="p-4">
              <div className="text-sm font-semibold text-[var(--sp-text-primary)]">No results for “{query}”</div>
              <p className="mt-1 text-xs font-medium leading-5 text-[var(--sp-text-helper)]">
                No matching people, seats, departments, or zones.
              </p>
              <button
                type="button"
                // Wrapped, not passed bare: a bare handler hands React's
                // synthetic event to the parent as onClearSearch's first
                // argument, which is both a leaked DOM reference and an
                // argument the prop's type never promised.
                onClick={() => onClearSearch()}
                className="mt-3 border border-[var(--sp-border-subtle)] bg-[var(--sp-layer-01)] px-3 py-1.5 text-xs font-semibold text-[var(--sp-text-secondary)] transition hover:border-[var(--sp-brand-border)] hover:text-[var(--sp-button-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sp-focus)]"
              >
                Clear search
              </button>
            </div>
          )}
        </>
      ) : browse.totalCount === 0 ? (
        /* AUDIT-2 §8.2 first-run: an empty browse feed used to render the
           "People — seated first" eyebrow over nothing. Name the state and
           the step that fills it. */
        <div role="status" className="p-4">
          <div className="text-sm font-semibold text-[var(--sp-text-primary)]">No one is in the directory yet</div>
          <p className="mt-1 text-xs font-medium leading-5 text-[var(--sp-text-helper)]">
            People appear here after an admin publishes the seat map.
          </p>
        </div>
      ) : (
        <>
          {/* Zone chips (contract #4): hover previews the wash on the map and
              click pins the zone filter, both through the state the map
              already washes from — the chips are a second door onto it, not a
              second copy of it. Focus previews too, so the preview is never a
              pointer-only affordance. */}
          {browse.zones.length > 0 && (
            <div
              role="group"
              aria-label="Zones"
              onMouseLeave={() => onZoneHoverChange(null)}
              className="border-b border-[var(--sp-border-subtle)] px-4 pb-2.5 pt-3"
            >
              {/* Copy is scoped per modality (P5, same ruling as the read-path
                  F5): a coarse-pointer device has no hover and usually no
                  Enter, so promising them is a false legend. Tap is the one
                  input that always exists there, and it pins. */}
              <span className={eyebrowClassName}>
                Zones — <span className="[@media(pointer:coarse)]:hidden">hover to preview, Enter to filter</span>
                <span className="hidden [@media(pointer:coarse)]:inline">tap to filter</span>
              </span>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {browse.zones.map(chip => {
                  const pinned = pinnedZone === chip.name;
                  return (
                    <button
                      key={chip.name}
                      type="button"
                      aria-pressed={pinned}
                      onClick={() => onZonePin(pinned ? "all" : chip.name)}
                      onMouseEnter={() => onZoneHoverChange(chip.name)}
                      onMouseLeave={() => onZoneHoverChange(null)}
                      onFocus={() => onZoneHoverChange(chip.name)}
                      onBlur={() => onZoneHoverChange(null)}
                      className={cx(
                        "inline-flex max-w-full items-center gap-1.5 truncate rounded-full border px-2.5 py-1 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--sp-focus)]",
                        pinned
                          ? "border-[var(--sp-brand)] bg-[var(--sp-brand-wash)] text-[var(--sp-brand-text)]"
                          : "border-[var(--sp-border-subtle)] bg-[var(--sp-background)] text-[var(--sp-text-secondary)] hover:border-[var(--sp-brand-border)]"
                      )}
                    >
                      {chip.name}
                      {/* opacity-90, not the mock's .75. The count inherits the
                          chip's own text color so it works in both the resting
                          and pinned palettes, but at 10px it needs AA: .75
                          measures 3.97:1 resting (#55504A over #F7F6F2) and
                          3.98:1 pinned (#9E2F06 over primary-soft) — both fail,
                          and the cliff is at 81% in both. .90 gives 5.71 and
                          5.40. Same call the eyebrows made about the mock's
                          #8E8276; caught by the e2e-auth viewer scan. */}
                      <span className="font-mono text-[10px] font-semibold opacity-90">{chip.seatCount}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="px-4 pb-1 pt-3">
            {/* "Seated first" because the feed IS seated-first (P2 ruling —
                lib/viewerFindPalette sorts seated above unseated, A→Z within
                each). No in-list section header marks the boundary: the
                virtual window measures a uniform row stride and sizes its
                spacers from it, so one taller header-bearing row would corrupt
                the scroll geometry for every row after it. The grouping reads
                without one — full-opacity rows with seat-code pills, then the
                disabled grey "No seat" block. */}
            <span className={eyebrowClassName}>People — seated first, A to Z</span>
          </div>

          {/* Same scrollable-region-focusable contract as the results list. */}
          <div
            ref={setBrowseListElement}
            role="list"
            aria-label="People directory"
            tabIndex={0}
            onKeyDown={handleBrowseKeyDown}
            className={cx(listClassName, "px-2 pb-2")}
          >
            {browseSegments.map((segment, segmentPosition) => {
              if (segment.kind === "spacer") {
                return <div aria-hidden="true" key={`spacer-${segmentPosition}`} style={{ height: segment.height }} />;
              }
              const row = browse.people[segment.index];
              if (!row) return null;
              return (
                <div
                  role="listitem"
                  key={row.id}
                  data-vindex={segment.index}
                  data-vpinned={segment.pinned ? "" : undefined}
                  className="border-b border-[var(--sp-background)] last:border-b-0"
                >
                  {/* Unseated people stay listed and honest, never openable
                      (contract #9): the row is disabled and its trailing cell
                      says "No seat" instead of a code that does not exist.
                      The sub line is the SHARED row's own subtitle (seat code ·
                      zone) rather than a palette-local "seat · position"
                      recomposition — lib/viewerSeatSearch is the single
                      formatting point for these strings by design, and
                      tests/viewer-directory.test.mjs pins that browse rows and
                      search rows stay byte-identical. Position still reaches
                      the reader via the result row's `meta` in query mode. */}
                  <button
                    type="button"
                    disabled={row.disabled}
                    aria-label={`${row.title}. ${row.subtitle}.`}
                    onClick={() => onOpenRow(row)}
                    onPointerEnter={() => onRowHoverChange(row.seatId)}
                    onPointerLeave={() => onRowHoverChange(null)}
                    // Compact rows (contract #3). The two text lines need an
                    // explicit leading to get there: at the inherited body
                    // line-height the pair alone is 37px, which pushed the row
                    // to 54 and cost a launch-scale directory a third of its
                    // visible names. The P3 ruling (2026-08-25) raised the
                    // subtitle to the 12px floor, growing the row ~40→44px —
                    // an accepted cost (~10% fewer names per screen), chosen
                    // over tightening leading to hold 40.
                    className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 border border-transparent px-2 py-1.5 text-left transition hover:border-[var(--sp-brand-border)] hover:bg-[var(--sp-brand-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sp-focus)] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span aria-hidden="true" className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-[var(--sp-background)] text-[10px] font-bold text-[var(--sp-text-secondary)]">
                      {buildInitials(row.title) || "?"}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-semibold leading-[1.25] text-[var(--sp-text-primary)]">{row.title}</span>
                      <span className="block truncate text-xs font-medium leading-[1.25] text-[var(--sp-text-helper)]">{row.subtitle}</span>
                    </span>
                    {row.seatId ? (
                      <span className="shrink-0 rounded-full border border-[var(--sp-border-subtle)] bg-[var(--sp-background)] px-2 py-0.5 font-mono text-[10px] font-semibold text-[var(--sp-text-secondary)]">
                        {row.subtitle.split(" · ")[0]}
                      </span>
                    ) : (
                      <span className="shrink-0 text-xs font-medium text-[var(--sp-text-helper)]">No seat</span>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Footer legend (contract #3). Every key it advertises works while
          focus is still in the search field — that is what makes it a legend
          rather than decoration. That contract is why browse mode drops
          "Enter opens" (P5): the field's Enter handler is gated on an active
          query, so with an empty query the key does nothing. Browse mode
          pairs it with the feed's own "N people · M seated"; in query mode
          the header already carries the live count, so a second number here
          would only compete with it. On a coarse pointer none of the keys
          exist, so the key copy hides — and in query mode that empties the
          footer, so the whole strip goes with it rather than leaving a bare
          border. whitespace-nowrap + truncate keep the strip to one line at
          narrow fine-pointer widths (the 375px two-line wrap). */}
      <div
        className={cx(
          "flex items-center justify-between gap-3 border-t border-[var(--sp-border-subtle)] px-4 py-2 text-xs font-medium text-[var(--sp-text-helper)]",
          queryActive && "[@media(pointer:coarse)]:hidden"
        )}
      >
        <span className="whitespace-nowrap [@media(pointer:coarse)]:hidden">
          {queryActive ? "↑↓ to move · Enter opens · Esc closes" : "↑↓ to move · Esc closes"}
        </span>
        {queryActive ? null : <span className="min-w-0 truncate">{browse.summary}</span>}
      </div>
    </div>
  );
}
