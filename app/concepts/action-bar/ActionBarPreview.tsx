"use client";

import { useState } from "react";

/**
 * PROTOTYPE ONLY — the contextual seat action bar from §02 of the Carbon v12
 * prediction: "the bar carries one job — find something — and every other
 * control appears attached to the thing it acts on."
 *
 * SIZES ARE A PROPOSAL, NOT A SPEC. The source only draws this as a thumbnail
 * illustration (9.5px type, 6px/10px padding) inside a 36px diagram strip. That
 * is a diagram, not a measurement, so the real-scale figures here — 40px tall,
 * 12.5px labels, a 3px x 14px accent marker — are mine.
 *
 * FAITHFUL: the dark floating surface with a hairline ring plus a drop shadow ·
 * the 3px brand marker leading the seat identity · the bar rising from the map
 * edge rather than descending from the chrome · §05's motion entry for this
 * moment, 240ms cubic-bezier(0, 0, .38, .9).
 *
 * THE VERBS ARE CONTEXTUAL, NOT THE SOURCE'S FIXED MOVE / SWAP / VACATE:
 * occupied seats get Swap · Vacate, open seats get Assign… · Swap. Move is gone
 * entirely (owner call, 2026-07-30: seats never move, people do) and Note moved
 * into the panel. See actionsForSeat for why each of those is where it is.
 *
 * THE ANIMATION USES THE `translate` LONGHAND, NEVER `transform`. The bar is
 * centred with translate:-50%, so animating `transform` would overwrite the
 * centring mid-flight and the bar would slide in from the left instead of
 * rising. The v12 handoff flags this exact trap for the Publish button ("a
 * filled transform keyframe silently overwrites any centring transform on the
 * same element — this bit us in the prototype"); it applies identically here.
 *
 * THE DUPLICATION IS RESOLVED: the bar replaces the inspector's fixed action
 * row outright, so the panel keeps no verbs at all. The toggle now shows the
 * two coexisting — what it is for is checking that the bar re-centres on the
 * NARROWED map instead of drifting under the docked panel.
 */

const SEATS = ["C01", "C02", "C03", "C04", "C05", "C06", "C07", "C08"];
const OCCUPANTS: Record<string, string> = {
  C01: "Adele M.",
  C03: "Rafael O.",
  C06: "Ingrid S."
};

const ACTION =
  "flex h-8 items-center px-2.5 text-[12.5px] font-medium leading-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--admin-primary)]";

const TONE = {
  default: "text-[var(--admin-chrome-muted)] hover:bg-white/10 hover:text-white",
  danger: "text-[var(--admin-chrome-danger-text)] hover:bg-white/10",
  // The hero treatment the app already uses for Publish: brand fill with ink
  // text (#161616 on #FF5715 = 5.71:1), never white-on-orange.
  primary: "bg-[var(--admin-primary)] font-semibold text-[var(--admin-primary-ink)] hover:brightness-105"
} as const;

type BarAction = { key: string; label: string; tone: keyof typeof TONE };

/**
 * The bar's verbs are contextual, and they HIDE rather than disable when they
 * do not apply. That reverses the call made for the inspector's fixed row,
 * deliberately: there, four equal cells meant a vanishing cell resized its
 * neighbours on every selection change, so disabling was the lesser evil. A
 * content-sized floating bar has no cells and no neighbours to disturb, so the
 * constraint that forced "disable" is gone — and nobody has to stare at a
 * greyed-out Vacate on every empty seat.
 *
 * Assign… carries an ellipsis because it is the one verb here that DISCLOSES
 * rather than acts: assignment needs a person, which needs a searchable
 * combobox, which cannot live on a 40px bar. It opens the editor in the panel.
 * It earns the exemption by being the primary intent on an empty seat; Note did
 * not, which is why Note moved into the panel body beside the field it targets.
 */
function actionsForSeat(assigned: boolean): BarAction[] {
  return assigned
    ? [
        { key: "swap", label: "Swap", tone: "default" },
        { key: "vacate", label: "Vacate", tone: "danger" }
      ]
    : [
        { key: "assign", label: "Assign…", tone: "primary" },
        // Legitimate on an empty seat: a swap only needs ONE side occupied.
        { key: "swap", label: "Swap", tone: "default" }
      ];
}

export function ActionBarPreview() {
  const [selected, setSelected] = useState<string | null>("C01");
  const [inspectorOpen, setInspectorOpen] = useState(false);
  // Owner call, 2026-07-30: the bar confirms EVERY time, dirty or not — see
  // vacateNeedsConfirmation's `fromTransientSurface` in lib/seatDraftActions.
  // The inspector keeps its straight-through vacate; only this surface pays the
  // second click, and the mock exists partly so that cost is felt rather than
  // reasoned about.
  const [vacateConfirmOpen, setVacateConfirmOpen] = useState(false);

  const occupant = selected ? OCCUPANTS[selected] : null;

  return (
    <div className="admin-theme min-h-screen bg-[var(--admin-bg)] p-6 text-[var(--admin-text-primary)]">
      <h1 className="text-lg font-semibold">Floating action bar — Carbon prediction §02 mock</h1>
      <p className="mt-1 max-w-[74ch] text-sm leading-6 text-[var(--admin-text-secondary)]">
        Select a seat and the actions rise from the map edge, attached to the selection rather than parked in the top
        chrome. Click empty space to deselect. Nothing here saves.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setInspectorOpen(current => !current)}
          aria-pressed={inspectorOpen}
          className={[
            "min-h-8 border px-3 text-[12px] font-medium transition-colors",
            inspectorOpen
              ? "border-[var(--admin-primary)] bg-[var(--admin-primary-soft)] text-[var(--admin-primary-on-soft)]"
              : "border-[var(--admin-border)] bg-[var(--admin-surface)] text-[var(--admin-text-secondary)] hover:bg-[var(--admin-surface-alt)]"
          ].join(" ")}
        >
          Docked inspector open
        </button>
        <span className="text-[12px] text-[var(--admin-text-muted)]">
          The panel keeps no verbs now. Turn this on to check the bar re-centres on the narrowed map.
        </span>
      </div>

      <div className="mt-3 flex h-[440px] flex-col overflow-hidden border border-[var(--admin-border)]">
        {/* One field, per §02 — the bar carries a single job. */}
        <header className="flex h-[var(--admin-chrome-h)] shrink-0 items-center gap-3 bg-[var(--admin-chrome-bg)] px-3 text-[var(--admin-chrome-text)]">
          <span aria-hidden="true" className="flex h-4 w-4 flex-col justify-center gap-[3px]">
            <span className="h-px w-full bg-current" />
            <span className="h-px w-full bg-current" />
            <span className="h-px w-full bg-current" />
          </span>
          <span className="flex h-7 w-[220px] items-center border-b border-white/25 bg-white/[0.06] px-2 text-[12px] text-[var(--admin-chrome-muted)]">
            Find…
          </span>
          <span className="ml-auto flex items-center gap-2">
            <span aria-hidden="true" className="h-3.5 w-3.5 ring-1 ring-white/30" />
            <span aria-hidden="true" className="h-3.5 w-3.5 ring-1 ring-white/30" />
            <span aria-hidden="true" className="h-[18px] w-[18px] rounded-full bg-[var(--admin-brand)]" />
          </span>
        </header>

        <div className="flex min-h-0 flex-1">
          {/* Map. The bar is positioned against THIS box, not the viewport, so it
              tracks the map's edge exactly as §02 describes. */}
          <div className="relative min-w-0 flex-1 overflow-hidden bg-[var(--sp-color-canvas)] p-4" onClick={() => setSelected(null)}>
            <div className="grid grid-cols-4 gap-2">
              {SEATS.map(code => {
                const isSelected = code === selected;
                return (
                  <button
                    key={code}
                    type="button"
                    onClick={event => {
                      event.stopPropagation();
                      setSelected(code);
                    }}
                    aria-pressed={isSelected}
                    className={[
                      "flex h-11 flex-col items-center justify-center border text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-primary)]",
                      isSelected
                        ? "border-[var(--admin-primary-cta)] bg-[var(--admin-surface)] text-[var(--admin-text-primary)] shadow-[0_0_0_2px_rgba(255,87,21,0.30)]"
                        : "border-[var(--admin-border)] bg-[var(--admin-surface)] text-[var(--admin-text-muted)] hover:border-[var(--admin-border-strong)]"
                    ].join(" ")}
                  >
                    {code}
                    {OCCUPANTS[code] && <span className="text-[10px] font-normal">{OCCUPANTS[code]}</span>}
                  </button>
                );
              })}
            </div>

            {/* The bar. Centred with translate:-50%, and the entrance animates
                that same LONGHAND — see the module note. */}
            <div
              role="group"
              aria-label={selected ? `Actions for seat ${selected}` : undefined}
              aria-hidden={!selected}
              data-action-bar
              className={[
                "absolute bottom-4 left-1/2 flex h-10 items-center gap-2 bg-[var(--admin-chrome-bg)] pl-3 pr-1 text-[var(--admin-chrome-text)]",
                "shadow-[0_4px_14px_rgba(0,0,0,.28),0_0_0_1px_rgba(255,255,255,.12)]",
                "transition-[translate,opacity] duration-[240ms] ease-[cubic-bezier(0,0,.38,.9)]",
                selected ? "[translate:-50%_0px] opacity-100" : "pointer-events-none [translate:-50%_8px] opacity-0"
              ].join(" ")}
            >
              <span aria-hidden="true" className="h-[14px] w-[3px] shrink-0 bg-[var(--admin-primary)]" />
              <span className="whitespace-nowrap text-[12.5px] font-semibold leading-none">{selected ?? "—"}</span>
              {occupant && (
                <span className="whitespace-nowrap text-[12.5px] font-normal leading-none text-[var(--admin-chrome-muted)]">
                  · {occupant}
                </span>
              )}
              <span aria-hidden="true" className="mx-1 h-5 w-px shrink-0 bg-white/15" />
              {actionsForSeat(Boolean(occupant)).map(action => (
                <button
                  key={action.key}
                  type="button"
                  onClick={action.key === "vacate" ? () => setVacateConfirmOpen(true) : undefined}
                  aria-label={selected ? `${action.label.replace("…", "")} ${selected}` : undefined}
                  className={`${ACTION} ${TONE[action.tone]}`}
                >
                  {action.label}
                </button>
              ))}
            </div>
          </div>

          {/* The docked inspector, abbreviated — only enough of it to show the
              collision. Its full treatment lives at /concepts/inspector. */}
          {inspectorOpen && (
            <aside className="flex w-[288px] shrink-0 flex-col border-l border-[var(--admin-border)] bg-[var(--admin-surface)]">
              <div className="shrink-0 border-b border-[var(--admin-border)] px-[14px] pb-[10px] pt-[11px]">
                <div className="flex items-center gap-2">
                  <span aria-hidden="true" className="h-[7px] w-[7px] shrink-0 bg-[var(--admin-status-ok)]" />
                  <span className="min-w-0 flex-1 truncate text-[14px] font-semibold leading-[1.3]">{occupant ?? "Open seat"}</span>
                  <span className="shrink-0 font-mono text-[12px] text-[var(--admin-text-muted)]">{selected ?? "—"}</span>
                </div>
                <div className="mt-[3px] truncate text-[12px] leading-[1.4] text-[var(--admin-text-secondary)]">Associate · Pre-Litigation</div>
              </div>
              {/* No action row. The verbs left for the canvas bar, so the panel
                  is header + one scrolling body — and Note sits beside the
                  field it actually targets. */}
              <div className="min-h-0 flex-1 overflow-y-auto">
                <div className="flex items-center justify-between gap-3 border-b border-[var(--admin-border)] px-[14px] py-2">
                  <span className="text-[12px] text-[var(--admin-text-muted)]">Zone</span>
                  <span className="font-mono text-[12.5px]">Center Desks</span>
                </div>
                <div className="flex items-center justify-between gap-3 border-b border-[var(--admin-border)] px-[14px] py-2">
                  <span className="text-[12px] text-[var(--admin-text-muted)]">Last change</span>
                  <span className="font-mono text-[12.5px]">Jul 28 · Patrick M.</span>
                </div>
                <div className="px-[14px] py-3">
                  <div className="text-[12px] font-semibold text-[var(--admin-text-primary)]">Note</div>
                  <div className="mt-1.5 min-h-[52px] border border-[var(--admin-border)] bg-[var(--admin-surface-alt)] p-2 text-[12px] text-[var(--admin-text-muted)]">
                    Add a seat note…
                  </div>
                  <p className="mt-2 text-[12px] leading-5 text-[var(--admin-text-muted)]">
                    The bar re-centres on the narrowed map rather than sliding under the panel — that is the thing to
                    check here.
                  </p>
                </div>
              </div>
            </aside>
          )}
        </div>
      </div>

      {vacateConfirmOpen && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-[var(--sp-color-workspace-deep)]/45 p-3 sm:items-center">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="mock-vacate-title"
            onKeyDown={event => {
              if (event.key === "Escape") setVacateConfirmOpen(false);
            }}
            className="w-full max-w-md border border-[var(--admin-border)] bg-[var(--admin-surface)] p-4"
          >
            <h2 id="mock-vacate-title" className="text-base font-semibold">
              Vacate {selected}?
            </h2>
            <p className="mt-1 text-sm leading-5 text-[var(--admin-text-secondary)]">
              This clears {occupant} from this draft seat. Draft only — viewers see nothing until you publish.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setVacateConfirmOpen(false)}
                className="flex min-h-9 items-center justify-center border border-[var(--admin-border-strong)] bg-[var(--admin-surface)] text-[13px] font-semibold text-[var(--admin-text-primary)] hover:bg-[var(--admin-surface-alt)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => setVacateConfirmOpen(false)}
                className="flex min-h-9 items-center justify-center bg-[var(--admin-danger)] text-[13px] font-semibold text-white hover:brightness-110"
              >
                Vacate seat
              </button>
            </div>
          </section>
        </div>
      )}

      <p className="mt-3 max-w-[74ch] text-[12px] leading-5 text-[var(--admin-text-muted)]">
        Vacate always stops for a confirm here — that is the bar&apos;s rule, not the inspector&apos;s. Two clicks per
        vacate is the price of an unguarded destructive verb on a surface that comes and goes.{" "}
        Select C01, C03 or C06 for an occupied seat (Swap · Vacate) and any other for an open one (Assign… · Swap).
        Verbs hide rather than grey out, and the bar breathes horizontally as they change — that is the one cost of
        making it contextual. Move is absent by your call; the prediction&apos;s thumbnail still shows it.
      </p>
    </div>
  );
}
