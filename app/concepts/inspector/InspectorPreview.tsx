"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * PROTOTYPE ONLY — v12 docked inspector (handoff §2), mocked so the dock and the
 * slim header can be judged before SeatInspector is touched.
 *
 * §2.3'S FIXED ACTION ROW IS GONE, BY OWNER DECISION (2026-07-30). The seat
 * verbs moved to a floating bar on the canvas — see /concepts/action-bar. The
 * deciding argument was the collapse rail: with the verbs in the panel, the one
 * state where you most want to act quickly (panel collapsed, map wide) is the
 * state with no actions in reach. On canvas they survive every panel state,
 * including closed. So this panel now carries NO verbs at all: header, then one
 * scrolling body.
 *
 * Note stayed here rather than moving to the bar. It is not a mutation — it
 * focuses a textarea that lives in this panel — so on the bar it would have been
 * navigation dressed as an action, the same category error that removing Move
 * fixed.
 *
 * FAITHFUL TO WHAT REMAINS OF §2: an in-flow 288px flex sibling that RESERVES
 * its width (the map column narrows — nothing overlays it) · light surface with
 * a single border-left hairline, no shadow, no elevation, NO slide-in
 * animation · the one-line header (7px status square · name · mono seat code ·
 * 22px close) with role · department beneath · fact rows at 8px/14px with mono
 * right-aligned values · long values truncated with ellipsis + title, never
 * word-break · the activity timeline collapsed to one "Last change" row · the
 * AI card collapsed to one text link.
 *
 * DELIBERATELY ABSENT, because it belongs to steps 4/5 proper: updateSeatAction
 * and every other server action, the STALE_DRAFT fence, the undo snapshot, the
 * unsaved-edits guard, the assignment editor's combobox, and real seat data.
 *
 * REMOVED per §2.2, and visible by their absence: the 40px avatar, the 20px
 * display name, and the three pill chips.
 *
 * The demo frame is a FIXED height on purpose — the header only demonstrably
 * holds still while the body scrolls if the body actually overflows, which it
 * would not at full viewport height on a large monitor.
 *
 * Colours use the repo's --admin-* tokens rather than the handoff's raw hexes
 * (owner call: match the live palette). #ffffff is identical in both, so the
 * panel surface is exact; hairlines read #E7E1D8 rather than #e0e0e0.
 */

type SeatKind = "assigned" | "open";
type PanelState = "docked" | "collapsed" | "closed";

type Fact = { label: string; value: string; full?: string };

const ASSIGNED_FACTS: Fact[] = [
  // Deliberately longer than the 288px column so §2.4's ellipsis + title rule is
  // visible. word-break would split this as "…law.exam / ple".
  { label: "Email", value: "priya.raghunathan@megeredchianlaw.example" },
  { label: "Extension", value: "214" },
  { label: "Department", value: "Pre-Litigation" },
  { label: "Position", value: "Associate" },
  { label: "Zone", value: "South-East Pod" }
];

const OPEN_FACTS: Fact[] = [
  { label: "Status", value: "Open" },
  { label: "Zone", value: "South-East Pod" },
  { label: "Seat type", value: "Original" },
  { label: "Nearest team", value: "Pre-Litigation" }
];

const toggleButton = (activeState: boolean) =>
  [
    "min-h-8 border px-3 text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-primary)]",
    activeState
      ? "border-[var(--admin-primary)] bg-[var(--admin-primary-soft)] text-[var(--admin-primary-on-soft)]"
      : "border-[var(--admin-border)] bg-[var(--admin-surface)] text-[var(--admin-text-secondary)] hover:bg-[var(--admin-surface-alt)]"
  ].join(" ");

function FactRow({ fact }: { fact: Fact }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[var(--admin-border)] px-[14px] py-2">
      <dt className="shrink-0 text-[12px] font-normal text-[var(--admin-text-muted)]">{fact.label}</dt>
      {/* truncate = overflow-hidden + ellipsis + nowrap. NEVER break-words: at
          288px that splits an address mid-token, which reads as corrupt data. */}
      <dd
        title={fact.full ?? fact.value}
        className="min-w-0 truncate text-right font-mono text-[12.5px] font-normal text-[var(--admin-text-primary)]"
      >
        {fact.value}
      </dd>
    </div>
  );
}

export function InspectorPreview() {
  const [kind, setKind] = useState<SeatKind>("assigned");
  const [panel, setPanel] = useState<PanelState>("docked");
  const [mapWidth, setMapWidth] = useState<number | null>(null);
  const mapRef = useRef<HTMLDivElement | null>(null);

  // Measured, not asserted: the reserve is only real if the map column actually
  // gets narrower when the panel docks.
  useLayoutEffect(() => {
    const element = mapRef.current;
    if (!element) return;
    const sync = () => setMapWidth(Math.round(element.getBoundingClientRect().width));
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (panel !== "docked") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPanel("closed");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [panel]);

  const assigned = kind === "assigned";
  const seatCode = assigned ? "SE04" : "SE05";
  const title = assigned ? "Priya Raghunathan" : "Open seat";
  const subtitle = assigned ? "Associate · Pre-Litigation" : "Unassigned · South-East Pod";
  const facts = assigned ? ASSIGNED_FACTS : OPEN_FACTS;
  const statusSquare = assigned ? "bg-[var(--admin-status-ok)]" : "bg-[var(--admin-status-neutral)]";

  return (
    <div className="admin-theme min-h-screen bg-[var(--admin-bg)] p-6 text-[var(--admin-text-primary)]">
      <h1 className="text-lg font-semibold">Docked inspector — v12 §2 mock</h1>
      <p className="mt-1 max-w-[74ch] text-sm leading-6 text-[var(--admin-text-secondary)]">
        The panel is an in-flow sibling, so the map column narrows instead of being covered. No shadow, no overlay, no
        slide-in — and no verbs: those live on the canvas bar at{" "}
        <span className="font-mono text-[13px]">/concepts/action-bar</span>. Nothing here saves.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="text-[12px] font-semibold">Seat</span>
        {(["assigned", "open"] as const).map(value => (
          <button key={value} type="button" onClick={() => setKind(value)} aria-pressed={kind === value} className={toggleButton(kind === value)}>
            {value === "assigned" ? "Assigned" : "Open"}
          </button>
        ))}
        <span className="ml-4 text-[12px] font-semibold">Panel</span>
        {(["docked", "collapsed", "closed"] as const).map(value => (
          <button key={value} type="button" onClick={() => setPanel(value)} aria-pressed={panel === value} className={`${toggleButton(panel === value)} capitalize`}>
            {value}
          </button>
        ))}
        <span className="ml-auto font-mono text-[12px] text-[var(--admin-text-muted)]">
          map column: {mapWidth === null ? "…" : `${mapWidth}px`}
        </span>
      </div>

      <div className="mt-3 flex h-[460px] flex-col overflow-hidden border border-[var(--admin-border)]">
        <header className="flex h-[var(--admin-chrome-h)] shrink-0 items-center gap-2 bg-[var(--admin-chrome-bg)] px-3 text-[12.5px] font-semibold text-[var(--admin-chrome-text)]">
          <span translate="no">
            Megeredchian Law <span className="font-normal text-[var(--admin-chrome-muted)]">· Seat Planner</span>
          </span>
          <span className="ml-auto text-[11px] font-medium text-[var(--admin-chrome-muted)]">inspector mock · not the real shell</span>
        </header>

        <div className="flex min-h-0 flex-1">
          {/* Map column — narrows, never covered. */}
          <div ref={mapRef} className="min-w-0 flex-1 overflow-hidden bg-[var(--sp-color-canvas)] p-4">
            <div className="grid grid-cols-4 gap-2">
              {Array.from({ length: 12 }, (_, index) => {
                const code = `SE${String(index + 1).padStart(2, "0")}`;
                const isSelected = code === seatCode;
                return (
                  <div
                    key={code}
                    className={[
                      "flex h-9 items-center justify-center border text-[11px] font-medium",
                      isSelected
                        ? "border-[var(--admin-primary-cta)] bg-[var(--admin-surface)] text-[var(--admin-text-primary)] shadow-[0_0_0_2px_rgba(255,87,21,0.30)]"
                        : "border-[var(--admin-border)] bg-[var(--admin-surface)] text-[var(--admin-text-muted)]"
                    ].join(" ")}
                  >
                    {code}
                  </div>
                );
              })}
            </div>
            <p className="mt-4 text-[12px] leading-5 text-[var(--admin-text-muted)]">
              Stand-in for the floor plan. Watch its width in the readout above as the panel docks and closes — that is
              the reserve, and it is why nothing needs a right-edge padding hack any more.
            </p>
          </div>

          {/* Collapsed rail — kept per the owner's call, sized to the chrome bar
              like the nav rail so the two vertical strips agree. §2 does not
              describe this state; the width and the light surface are choices.
              It is also the reason the verbs left this panel: collapsed, it
              could never have shown them. */}
          {panel === "collapsed" && (
            <button
              type="button"
              onClick={() => setPanel("docked")}
              aria-label={`View details for ${seatCode}`}
              title={`View details for ${seatCode}`}
              className="flex w-[var(--admin-chrome-h)] shrink-0 flex-col items-center justify-center border-l border-[var(--admin-border)] bg-[var(--admin-surface)] text-[var(--admin-text-muted)] transition-colors hover:bg-[var(--admin-surface-alt)] hover:text-[var(--admin-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--admin-primary)]"
            >
              <span className="font-mono text-[11px] [writing-mode:vertical-rl]">{seatCode}</span>
            </button>
          )}

          {panel === "docked" && (
            <aside
              aria-label="Selected draft seat inspector"
              // 288px, flex-shrink:0, light, ONE border-left hairline. No shadow,
              // no z-index, no transition — §2.1 is explicit that this must stop
              // reading as a floating thing.
              className="flex w-[288px] shrink-0 flex-col border-l border-[var(--admin-border)] bg-[var(--admin-surface)]"
            >
              {/* §2.2 — one line. The 40px avatar, the 20px name and the three
                  pill chips are gone. */}
              <div className="shrink-0 border-b border-[var(--admin-border)] px-[14px] pb-[10px] pt-[11px]">
                <div className="flex items-center gap-2">
                  <span aria-hidden="true" className={`h-[7px] w-[7px] shrink-0 ${statusSquare}`} />
                  <h2 className="min-w-0 flex-1 truncate text-[14px] font-semibold leading-[1.3] text-[var(--admin-text-primary)]">{title}</h2>
                  <span className="shrink-0 font-mono text-[12px] font-normal text-[var(--admin-text-muted)]">{seatCode}</span>
                  <button
                    type="button"
                    onClick={() => setPanel("closed")}
                    aria-label={`Close inspector for ${seatCode}`}
                    title="Close"
                    className="flex h-[22px] w-[22px] shrink-0 items-center justify-center text-[var(--admin-text-muted)] transition-colors hover:bg-[var(--admin-surface-alt)] hover:text-[var(--admin-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-primary)]"
                  >
                    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none">
                      <path d="m6 6 8 8m0-8-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
                <div className="mt-[3px] truncate text-[12px] font-normal leading-[1.4] text-[var(--admin-text-secondary)]">{subtitle}</div>
              </div>

              {/* The only scrolling region — and now the only region. */}
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                <dl>
                  {facts.map(fact => (
                    <FactRow key={fact.label} fact={fact} />
                  ))}
                  {/* Activity timeline collapsed to a single row. */}
                  <FactRow fact={{ label: "Last change", value: "Jul 28 · Patrick M." }} />
                </dl>

                {/* Note lives here, beside the field it targets — the reason it
                    was not promoted to the canvas bar with Swap and Vacate. */}
                <div className="border-b border-[var(--admin-border)] px-[14px] py-3">
                  <div className="text-[12px] font-semibold text-[var(--admin-text-primary)]">Note</div>
                  <div className="mt-1.5 min-h-[56px] border border-[var(--admin-border)] bg-[var(--admin-surface-alt)] p-2 text-[12px] leading-5 text-[var(--admin-text-muted)]">
                    Add a seat note…
                  </div>
                </div>

                <div className="px-[14px] py-3">
                  <button
                    type="button"
                    className="flex min-h-9 w-full items-center justify-center border border-[var(--admin-border-strong)] bg-[var(--admin-surface)] px-3 text-[12px] font-semibold text-[var(--admin-text-secondary)] transition-colors hover:bg-[var(--admin-surface-alt)] hover:text-[var(--admin-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-primary)]"
                  >
                    {assigned ? "Edit assignment" : "Assign employee"}
                  </button>
                  <p className="mt-2 text-[12px] leading-5 text-[var(--admin-text-muted)]">
                    {assigned
                      ? "On an occupied seat the primary intent is reseating, so this stays here rather than on the bar."
                      : "On an open seat the bar also carries Assign… — it opens this same editor, because assignment needs a person and a combobox cannot live on a 40px bar."}
                  </p>
                </div>

                {/* AI card collapsed to one text link. */}
                <div className="border-t border-[var(--admin-border)] px-[14px] py-3">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[var(--admin-primary-cta)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-primary)]"
                  >
                    <span aria-hidden="true">✦</span>
                    Ask Planner about this seat
                  </button>
                </div>
              </div>
            </aside>
          )}
        </div>
      </div>

      <p className="mt-3 max-w-[74ch] text-[12px] leading-5 text-[var(--admin-text-muted)]">
        Scroll the panel body: the header holds still. Hover the Email value on the assigned seat — it truncates with a
        tooltip rather than splitting mid-token. Escape closes the panel.
      </p>
    </div>
  );
}

/*
 * FOOTNOTE — retiring Move is bigger than deleting a button.
 *
 * Dropping the verb costs nothing here. Retiring the capability behind it is a
 * real change, because the inspector's Move button is the ONLY entry point into
 * seat-drag mode (SeatMap's `applyStartMoveSeatAction` is reached from the
 * `onStartMoveSeat` prop and from the matching `start-move-seat` guard branch,
 * nothing else). Remove it and the following become unreachable rather than
 * merely unused:
 *
 *   - moveSeatAction + tests/update-seat-transaction-safety coverage of it
 *   - moveSeatMode / dragState / handleMovePointerDown / handleMapPointerMove /
 *     handleMapPointerUp, and SeatMarker's onMovePointerDown prop
 *   - "Reset position to published" (canResetPosition,
 *     selectedSeatPublishedPosition) — an escape hatch that exists ONLY to undo
 *     a mis-drag
 *   - the "start-move-seat" arm of InspectorGuardAction and its Esc-ladder rung
 *   - the "Move seat" branch of the mode card
 *   - publishSummary's seatMoves list (hasSeatMoved / formatPoint /
 *     COORDINATE_EPSILON) and the review dialog's "Seat moves/layout changes"
 *
 * Coordinates do NOT become dead: Add seat still places a marker by clicking the
 * map, and undo/redo still restores x/y. This is "remove one way of writing
 * coordinates", not "seats stop having positions".
 *
 * Deliberately NOT acted on here — it touches server actions, the publish
 * summary and their tests, and belongs in its own step with its own review.
 */
