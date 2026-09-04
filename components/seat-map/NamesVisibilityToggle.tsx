"use client";

// The ONE "Names" control both surfaces share — the Carbon small toggle
// (32×16 track, 12 knob) in the control row (PHASE1IA B4: the toggle moved
// up from the band; PHASE3DS §1.14 `.sp-toggle`). The state is visible to
// sighted users in BOTH positions (track + the On/Off word) and to assistive
// tech through aria-pressed; the accessible name stays "Show occupant
// names" — accessibility-source pins the stable label + aria-pressed
// contract relationally with the surfaces' other names controls.
export function NamesVisibilityToggle({ pressed, onToggle }: {
  pressed: boolean;
  onToggle: () => void;
}) {
  return (
    <button type="button" className="sp-toggle" aria-pressed={pressed} aria-label="Show occupant names" onClick={onToggle}>
      <span aria-hidden="true">Names</span>
      <span aria-hidden="true" className="sp-toggle-track" data-state={pressed ? "on" : "off"} />
      <span aria-hidden="true" className="sp-toggle-state">{pressed ? "On" : "Off"}</span>
    </button>
  );
}
