"use client";

// The ONE "Show occupant names" control both legend footers share (admin
// SeatMap and the viewer). A real switch — track + thumb — because the state
// must be visible to sighted users in BOTH positions: the retired checkmark
// appeared only when on, and the flipping-label pattern before it exposed no
// state at all (accessibility-source pins the stable label + aria-pressed
// contract, relationally with the surfaces' other names controls).
export function NamesVisibilityToggle({ pressed, onToggle }: {
  pressed: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onToggle}
      className="flex w-full items-center gap-2 text-[11.5px] font-semibold text-[var(--sp-text-secondary)] transition hover:text-[var(--sp-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sp-focus)]"
    >
      <span className="min-w-0 truncate">Show occupant names</span>
      <span
        aria-hidden="true"
        data-state={pressed ? "on" : "off"}
        className={[
          "relative ml-auto h-4 w-7 shrink-0 rounded-full border transition-colors motion-reduce:transition-none",
          pressed
            ? "border-[var(--sp-status-success-mark)] bg-[var(--sp-status-success-mark)]"
            : "border-[var(--sp-border-subtle)] bg-[var(--sp-background)]"
        ].join(" ")}
      >
        <span
          className={[
            "absolute left-[2px] top-1/2 h-[10px] w-[10px] -translate-y-1/2 rounded-full transition-transform motion-reduce:transition-none",
            pressed ? "translate-x-[12px] bg-white" : "translate-x-0 bg-[var(--sp-text-secondary)]"
          ].join(" ")}
        />
      </span>
    </button>
  );
}
