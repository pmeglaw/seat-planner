"use client";

// The mode card (PHASE3DS §1.18, specimen 02-map.html#slot): while Add seat /
// Move / Swap runs without an expanded inspector, the mode owns the right slot
// and its microcopy lives here (INV-4) — eyebrow · title · one sentence · the
// exit ghost · "Esc also exits". A polite live region, so entering a mode is
// announced without stealing focus. The O4 note names the rule the map
// enforces on the pills (reserved / unavailable seats refuse the drop).
export type ModeCardProps = {
  label: string;
  title: string;
  body: string;
  note?: string;
  exitLabel: string;
  onExit: () => void;
  busyLabel?: string | null;
};

export function ModeCard({ label, title, body, note, exitLabel, onExit, busyLabel = null }: ModeCardProps) {
  return (
    <aside className="sp-slot" role="status" aria-live="polite" aria-label={`${label} mode`} data-mode-card="">
      <div className="sp-mode-card">
        <div className="sp-slot-eyebrow">{label} mode</div>
        <div className="sp-mode-card-title">{title}</div>
        <p>{body}</p>
        {note ? <p className="sp-esc-note">{note}</p> : null}
        {busyLabel ? (
          <p className="sp-esc-note" aria-busy="true">
            <span aria-hidden="true" className="mr-2 inline-block h-3 w-3 shrink-0 rounded-full border-2 border-current border-t-transparent align-middle motion-safe:animate-spin" />
            {busyLabel}
          </p>
        ) : null}
        <button type="button" className="cds-btn cds-btn--ghost" onClick={onExit}>{exitLabel}</button>
        <span className="sp-esc-note">Esc also exits.</span>
      </div>
    </aside>
  );
}
