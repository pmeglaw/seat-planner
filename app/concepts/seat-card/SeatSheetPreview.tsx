/**
 * THROWAWAY design concept — "Seat Sheet" (new-hire seat assignment card).
 *
 * One page handed to a new hire on day one: where you sit, who is around
 * you, where the printer / kitchen / exit are. Designed as an architect's
 * plan sheet — drawing frame, keyed callouts, dimension line, title block —
 * because office seating IS a floor plan. Static server component: fixture
 * data from ./seatSheetData.ts, no Supabase, no client hooks. All styling
 * scoped under .seat-sheet so nothing leaks into shipped surfaces.
 *
 * The plan fragment is a stylized East Pod, not the production raster —
 * this sheet argues for a drawn-linework language, not pixel fidelity.
 */

import { SEAT_SHEET } from "./seatSheetData";

const INK = "#26282A";
const LINE = "#B8B4AB";
const COPPER = "#A96A38";

// Tiny SVG noise tile for the paper grain overlay (kept inline: concepts
// don't ship assets through the ds-bundle copy step).
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='120' height='120' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E\")";

const CSS = `
.seat-sheet-backdrop {
  min-height: 100dvh;
  background: #E4E1D8;
  display: grid;
  place-items: center;
  padding: clamp(16px, 4vw, 56px);
  font-family: var(--font-mono), "IBM Plex Mono", monospace;
  color: ${INK};
}
.seat-sheet {
  position: relative;
  width: 100%;
  max-width: 1060px;
  background: #F7F5F0;
  box-shadow: 0 32px 80px -36px rgba(38, 40, 42, 0.38);
}
.seat-sheet::after {
  content: "";
  position: absolute;
  inset: 0;
  background-image: ${GRAIN};
  opacity: 0.05;
  pointer-events: none;
}
/* Drawing frame: hairline at the trim, heavy line at the margin. */
.sheet-outer {
  position: absolute;
  inset: 10px;
  border: 0.75px solid ${LINE};
  pointer-events: none;
}
.sheet-frame {
  position: relative;
  margin: 20px;
  border: 1.5px solid ${INK};
  display: flex;
  flex-direction: column;
}
.sheet-main {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 340px;
}
.plan-cell {
  padding: clamp(16px, 3vw, 32px);
  border-right: 1px solid ${LINE};
  min-width: 0;
}
.plan-cell svg {
  display: block;
  width: 100%;
  height: auto;
}
.info-cell {
  padding: clamp(20px, 3vw, 32px);
  display: flex;
  flex-direction: column;
  gap: 0;
  min-width: 0;
}
.sheet-eyebrow {
  font-size: 10px;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: ${COPPER};
}
.sheet-name {
  font-family: var(--font-sans), "IBM Plex Sans", sans-serif;
  font-weight: 600;
  font-size: clamp(22px, 2.6vw, 27px);
  line-height: 1.15;
  margin-top: 10px;
  letter-spacing: -0.01em;
}
.sheet-role {
  margin-top: 6px;
  font-size: 12px;
  color: #6E6A61;
  letter-spacing: 0.04em;
}
.sheet-code {
  margin-top: 26px;
  font-size: clamp(64px, 9vw, 100px);
  font-weight: 500;
  line-height: 0.95;
  letter-spacing: -0.03em;
  white-space: nowrap;
}
.sheet-code em {
  font-style: normal;
  color: ${COPPER};
}
.sheet-code-sub {
  margin-top: 10px;
  font-size: 11px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #6E6A61;
}
.sheet-rule {
  margin: 24px 0 18px;
  border: 0;
  border-top: 1px solid ${LINE};
}
.callout-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.callout-row {
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr);
  gap: 12px;
  align-items: baseline;
}
.callout-key {
  width: 20px;
  height: 20px;
  border: 1.25px solid ${INK};
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  transform: translateY(4px);
}
.callout-label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
.callout-detail {
  margin-top: 3px;
  font-size: 12px;
  line-height: 1.5;
  color: #55524B;
}
.sheet-report {
  margin-top: auto;
  padding-top: 22px;
  font-size: 10px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #6E6A61;
}
/* Title block — the signature. Reads like the corner of a real drawing. */
.title-block {
  border-top: 1.5px solid ${INK};
  display: grid;
  grid-template-columns: minmax(0, 1.8fr) repeat(3, minmax(0, 0.9fr)) minmax(0, 1.6fr) minmax(0, 0.9fr);
  font-size: 10px;
}
.tb-cell {
  padding: 8px 12px 10px;
  border-right: 1px solid ${LINE};
  min-width: 0;
}
.tb-cell:last-child { border-right: 0; }
.tb-label {
  display: block;
  font-size: 8.5px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: #8B8779;
}
.tb-value {
  display: block;
  margin-top: 3px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  overflow-wrap: anywhere;
}
.tb-sheetno .tb-value {
  font-size: 20px;
  font-weight: 600;
  color: ${COPPER};
  letter-spacing: 0.02em;
}

/* ---- Load choreography: linework draws, then fills and text settle. ---- */
.seat-sheet svg .draw {
  stroke-dasharray: 1;
  stroke-dashoffset: 1;
  animation: sheet-draw 1.3s cubic-bezier(0.45, 0, 0.15, 1) forwards;
}
.seat-sheet svg .draw.d2 { animation-delay: 0.25s; }
.seat-sheet svg .draw.d3 { animation-delay: 0.5s; }
.seat-sheet svg .draw.d4 { animation-delay: 0.7s; }
.seat-sheet svg .settle,
.seat-sheet .info-cell > *,
.seat-sheet .title-block {
  opacity: 0;
  animation: sheet-settle 0.9s cubic-bezier(0.32, 0.72, 0, 1) forwards;
}
.seat-sheet svg .settle { animation-delay: 1.1s; }
.seat-sheet .info-cell > * { animation-delay: 0.55s; }
.seat-sheet .info-cell > .sheet-code { animation-delay: 0.7s; }
.seat-sheet .info-cell > .sheet-code ~ * { animation-delay: 0.85s; }
.seat-sheet .title-block { animation-delay: 1.2s; }
@keyframes sheet-draw { to { stroke-dashoffset: 0; } }
@keyframes sheet-settle {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
@media (prefers-reduced-motion: reduce) {
  .seat-sheet svg .draw,
  .seat-sheet svg .settle,
  .seat-sheet .info-cell > *,
  .seat-sheet .title-block {
    animation: none;
    stroke-dashoffset: 0;
    opacity: 1;
    transform: none;
  }
}

@media (max-width: 880px) {
  .sheet-main { grid-template-columns: 1fr; }
  .plan-cell { border-right: 0; border-bottom: 1px solid ${LINE}; }
  .title-block { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .tb-cell { border-top: 1px solid ${LINE}; }
  .tb-cell:nth-child(-n+2) { border-top: 0; }
  .tb-cell:nth-child(2n) { border-right: 0; }
}
@media print {
  .seat-sheet-backdrop { background: #fff; padding: 0; }
  .seat-sheet { box-shadow: none; max-width: none; }
  .seat-sheet::after { display: none; }
}
`;

// Circled plan callout key, matched by the numbered list in the info column.
function PlanKey({ n, x, y }: { n: number; x: number; y: number }) {
  return (
    <g className="settle">
      <circle cx={x} cy={y} r={10} fill="#F7F5F0" stroke={INK} strokeWidth={1.25} />
      <text x={x} y={y + 3.5} textAnchor="middle" fontSize={10} fill={INK}>
        {n}
      </text>
    </g>
  );
}

function Desk({ x, y, label, you = false }: { x: number; y: number; label: string; you?: boolean }) {
  return (
    <g>
      <rect
        className="draw d3"
        pathLength={1}
        x={x}
        y={y}
        width={84}
        height={40}
        fill={you ? "rgba(169,106,56,0.14)" : "none"}
        stroke={you ? COPPER : INK}
        strokeWidth={you ? 1.75 : 1}
      />
      {/* chair */}
      <circle className="draw d3" pathLength={1} cx={x + 42} cy={y + 54} r={9} fill="none" stroke={LINE} strokeWidth={1} />
      <text className="settle" x={x + 42} y={y + 24} textAnchor="middle" fontSize={11} fill={you ? COPPER : "#6E6A61"} fontWeight={you ? 600 : 400}>
        {label}
      </text>
    </g>
  );
}

function FloorPlan({ seatLabel }: { seatLabel: string }) {
  return (
    <svg viewBox="0 0 620 512" role="img" aria-label={`Floor plan of the East Pod with seat ${seatLabel} highlighted`}>
      <defs>
        <pattern id="hatch" width="7" height="7" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
          <line x1="0" y1="0" x2="0" y2="7" stroke={LINE} strokeWidth="1" />
        </pattern>
        <marker id="arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0.5 L7.5,4 L0,7.5" fill="none" stroke={INK} strokeWidth="1" />
        </marker>
      </defs>

      {/* Walls: double line, gap in the east wall for the exit door. */}
      <g className="draw" fill="none" stroke={INK} strokeWidth={1.75}>
        <path pathLength={1} d="M48 96 H572 V300 M572 372 V456 H48 V96" />
      </g>
      <g className="draw d2" fill="none" stroke={INK} strokeWidth={0.75}>
        <path pathLength={1} d="M55 103 H565 V300 M565 372 V449 H55 V103" />
      </g>
      {/* Exit door leaf + swing */}
      <g className="draw d4" fill="none" stroke={INK} strokeWidth={1.25}>
        <line pathLength={1} x1={572} y1={372} x2={520} y2={372} />
        <path pathLength={1} d="M520 372 A52 52 0 0 1 572 320" strokeWidth={0.6} strokeDasharray="3 3" />
      </g>
      <text className="settle" x={545} y={292} textAnchor="middle" fontSize={10} fill={INK} letterSpacing="2">
        EXIT
      </text>

      {/* Kitchen, hatched, west wall */}
      <g className="draw d2">
        <rect pathLength={1} x={55} y={103} width={92} height={140} fill="url(#hatch)" stroke={INK} strokeWidth={1} />
      </g>
      <text className="settle" x={101} y={262} textAnchor="middle" fontSize={10} fill="#6E6A61" letterSpacing="2">
        KITCHEN
      </text>

      {/* Printer alcove, northeast corner */}
      <g className="draw d2">
        <rect pathLength={1} x={492} y={103} width={73} height={44} fill="none" stroke={INK} strokeWidth={1} />
        <rect pathLength={1} x={508} y={114} width={40} height={22} fill="none" stroke={LINE} strokeWidth={1} />
      </g>
      <text className="settle" x={528} y={162} textAnchor="middle" fontSize={9} fill="#6E6A61" letterSpacing="1.5">
        COPY
      </text>

      {/* East Pod desks: 2 columns x 3 rows, E01..E06, E06 is the hire's. */}
      <Desk x={306} y={160} label="E01" />
      <Desk x={426} y={160} label="E02" />
      <Desk x={306} y={252} label="E03" />
      <Desk x={426} y={252} label="E04" />
      <Desk x={306} y={344} label="E05" />
      <Desk x={426} y={344} label={seatLabel} you />

      {/* Leader line: annotation -> the hire's desk */}
      <g className="draw d4" fill="none" stroke={COPPER} strokeWidth={1.25}>
        <path pathLength={1} d="M200 480 H400 L444 392" markerEnd="url(#arrow)" />
      </g>
      <text className="settle" x={196} y={484} textAnchor="end" fontSize={11} fill={COPPER} letterSpacing="2" fontWeight={600}>
        YOUR SEAT — {seatLabel}
      </text>

      {/* Plan callout keys (match the numbered list on the right) */}
      <PlanKey n={1} x={390} y={364} />
      <PlanKey n={2} x={472} y={125} />
      <PlanKey n={3} x={166} y={173} />
      <PlanKey n={4} x={546} y={392} />

      {/* Dimension line across the pod, drafting-style extension ticks */}
      <g className="draw d4" stroke={INK} strokeWidth={0.75} fill="none">
        <line pathLength={1} x1={306} y1={72} x2={510} y2={72} />
        <line pathLength={1} x1={306} y1={64} x2={306} y2={80} />
        <line pathLength={1} x1={510} y1={64} x2={510} y2={80} />
        <line pathLength={1} x1={302} y1={76} x2={310} y2={68} />
        <line pathLength={1} x1={506} y1={76} x2={514} y2={68} />
      </g>
      <text className="settle" x={408} y={62} textAnchor="middle" fontSize={10} fill="#6E6A61" letterSpacing="2">
        EAST POD — 22′-4″
      </text>

      {/* North arrow */}
      <g className="draw d4" fill="none" stroke={INK} strokeWidth={1}>
        <circle pathLength={1} cx={588} cy={44} r={16} />
        <line pathLength={1} x1={588} y1={56} x2={588} y2={34} markerEnd="url(#arrow)" />
      </g>
      <text className="settle" x={588} y={24} textAnchor="middle" fontSize={10} fill={INK}>
        N
      </text>
    </svg>
  );
}

export function SeatSheetPreview() {
  const { hire, seat, callouts, titleBlock } = SEAT_SHEET;
  const codeMatch = seat.label.match(/^([A-Z]+)(\d+)$/);
  const codeZone = codeMatch?.[1] ?? seat.label;
  const codeNum = codeMatch?.[2] ?? "";

  return (
    <div className="seat-sheet-backdrop">
      <style>{CSS}</style>
      <main className="seat-sheet">
        <div className="sheet-outer" aria-hidden />
        <div className="sheet-frame">
          <div className="sheet-main">
            <div className="plan-cell">
              <FloorPlan seatLabel={seat.label} />
            </div>
            <div className="info-cell">
              <p className="sheet-eyebrow">Seat assignment</p>
              <h1 className="sheet-name">{hire.name}</h1>
              <p className="sheet-role">
                {hire.position} · {hire.department}
              </p>
              <p className="sheet-code" aria-label={`Seat ${seat.label}`}>
                {codeZone}
                <em>–</em>
                {codeNum}
              </p>
              <p className="sheet-code-sub">
                {seat.zone} · {seat.floor}
              </p>
              <hr className="sheet-rule" />
              <ol className="callout-list">
                {callouts.map(c => (
                  <li key={c.key} className="callout-row">
                    <span className="callout-key" aria-hidden>
                      {c.key}
                    </span>
                    <div>
                      <p className="callout-label">{c.label}</p>
                      <p className="callout-detail">{c.detail}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <p className="sheet-report">First day {hire.startDate}</p>
            </div>
          </div>
          <div className="title-block">
            <div className="tb-cell">
              <span className="tb-label">Project</span>
              <span className="tb-value">Megeredchian Law — office seating, {seat.floor}</span>
            </div>
            <div className="tb-cell">
              <span className="tb-label">Scale</span>
              <span className="tb-value">{titleBlock.scale}</span>
            </div>
            <div className="tb-cell">
              <span className="tb-label">Drawn by</span>
              <span className="tb-value">{titleBlock.drawnBy}</span>
            </div>
            <div className="tb-cell">
              <span className="tb-label">Date / Rev</span>
              <span className="tb-value">
                {titleBlock.date} / {titleBlock.revision}
              </span>
            </div>
            <div className="tb-cell">
              <span className="tb-label">Issued for</span>
              <span className="tb-value">{titleBlock.issuedFor}</span>
            </div>
            <div className="tb-cell tb-sheetno">
              <span className="tb-label">Sheet</span>
              <span className="tb-value">{titleBlock.sheetNo}</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
