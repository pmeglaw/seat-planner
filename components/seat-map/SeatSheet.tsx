import Link from "next/link";
import { frameCluster } from "@/lib/mySeat";
import { MAP_ASPECT_RATIO } from "@/lib/mapLayoutTransform";
import type { Employee, SeatWithEmployee } from "@/lib/types";

/**
 * "Seat Sheet" — the viewer's seat assignment rendered as an architect's
 * plan sheet (drawing frame, keyed plan detail, title block). Grown out of
 * the /concepts/seat-card prototype; unlike the prototype, every drawn mark
 * is real data: desks sit at true published visual coordinates (the caller
 * runs seats through seatsToVisualSeats), the neighbor list is computed, and
 * the sheet draws no walls or amenities because the database knows none.
 * Static server component — no client hooks; the load choreography is CSS.
 */

const INK = "#26282A";
const LINE = "#B8B4AB";
const COPPER = "#A96A38";
const MUTED = "#6E6A61";

const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='120' height='120' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E\")";

const CSS = `
.mss-backdrop {
  min-height: 100dvh;
  background: #E4E1D8;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 14px;
  padding: clamp(16px, 4vw, 56px);
  font-family: var(--font-mono), "IBM Plex Mono", monospace;
  color: ${INK};
}
.mss-sheet {
  position: relative;
  width: 100%;
  max-width: 1060px;
  background: #F7F5F0;
  box-shadow: 0 32px 80px -36px rgba(38, 40, 42, 0.38);
}
.mss-sheet::after {
  content: "";
  position: absolute;
  inset: 0;
  background-image: ${GRAIN};
  opacity: 0.05;
  pointer-events: none;
}
.mss-outer {
  position: absolute;
  inset: 10px;
  border: 0.75px solid ${LINE};
  pointer-events: none;
}
.mss-frame {
  position: relative;
  margin: 20px;
  border: 1.5px solid ${INK};
  display: flex;
  flex-direction: column;
}
.mss-main {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 340px;
}
.mss-plan {
  padding: clamp(16px, 3vw, 32px);
  border-right: 1px solid ${LINE};
  min-width: 0;
  display: grid;
  align-content: center;
}
.mss-plan svg {
  display: block;
  width: 100%;
  height: auto;
}
.mss-info {
  padding: clamp(20px, 3vw, 32px);
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.mss-eyebrow {
  font-size: 12px;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: ${COPPER};
}
.mss-name {
  font-family: var(--font-sans), "IBM Plex Sans", sans-serif;
  font-weight: 600;
  font-size: clamp(22px, 2.6vw, 27px);
  line-height: 1.15;
  margin-top: 10px;
  letter-spacing: -0.01em;
}
.mss-role {
  margin-top: 6px;
  font-size: 12px;
  color: ${MUTED};
  letter-spacing: 0.04em;
}
.mss-code {
  margin-top: 26px;
  font-size: clamp(56px, 8vw, 92px);
  font-weight: 500;
  line-height: 0.95;
  letter-spacing: -0.03em;
  overflow-wrap: anywhere;
}
.mss-code em {
  font-style: normal;
  color: ${COPPER};
}
.mss-code-sub {
  margin-top: 10px;
  font-size: 12px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: ${MUTED};
}
.mss-rule {
  margin: 24px 0 18px;
  border: 0;
  border-top: 1px solid ${LINE};
}
.mss-facts {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.mss-fact-label {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
.mss-fact-detail {
  margin-top: 3px;
  font-size: 12px;
  line-height: 1.5;
  color: #55524B;
}
.mss-notice {
  padding: clamp(40px, 6vw, 80px) clamp(24px, 5vw, 64px);
  display: grid;
  justify-items: start;
  gap: 12px;
}
.mss-notice-heading {
  font-family: var(--font-sans), "IBM Plex Sans", sans-serif;
  font-weight: 600;
  font-size: clamp(20px, 2.4vw, 25px);
}
.mss-notice-detail {
  font-size: 12.5px;
  line-height: 1.6;
  color: #55524B;
  max-width: 52ch;
}
.mss-notice-issued {
  display: none;
  font-size: 12px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #55524B;
}
.mss-title-block {
  border-top: 1.5px solid ${INK};
  display: grid;
  grid-template-columns: minmax(0, 1.8fr) repeat(3, minmax(0, 0.9fr)) minmax(0, 1.6fr) minmax(0, 0.9fr);
  font-size: 10px;
}
.mss-tb-cell {
  padding: 8px 12px 10px;
  border-right: 1px solid ${LINE};
  min-width: 0;
}
.mss-tb-cell:last-child { border-right: 0; }
.mss-tb-label {
  display: block;
  font-size: 8.5px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: #8B8779;
}
.mss-tb-value {
  display: block;
  margin-top: 3px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  overflow-wrap: anywhere;
}
.mss-tb-sheetno .mss-tb-value {
  font-size: 20px;
  font-weight: 600;
  color: ${COPPER};
  letter-spacing: 0.02em;
}
.mss-back {
  font-size: 12px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #55524B;
  text-decoration: none;
  border-bottom: 1px solid ${LINE};
  padding-bottom: 2px;
}
.mss-back:hover { color: ${INK}; border-color: ${INK}; }
.mss-back:focus-visible {
  outline: 2px solid ${COPPER};
  outline-offset: 3px;
}

.mss-sheet svg .mss-draw {
  stroke-dasharray: 1;
  stroke-dashoffset: 1;
  animation: mss-draw 1.3s cubic-bezier(0.45, 0, 0.15, 1) forwards;
}
.mss-sheet svg .mss-draw.mss-d2 { animation-delay: 0.25s; }
.mss-sheet svg .mss-draw.mss-d3 { animation-delay: 0.5s; }
.mss-sheet svg .mss-settle,
.mss-sheet .mss-info > *,
.mss-sheet .mss-notice > *,
.mss-sheet .mss-title-block {
  opacity: 0;
  animation: mss-settle 0.9s cubic-bezier(0.32, 0.72, 0, 1) forwards;
}
.mss-sheet svg .mss-settle { animation-delay: 0.95s; }
.mss-sheet .mss-info > *, .mss-sheet .mss-notice > * { animation-delay: 0.55s; }
.mss-sheet .mss-info > .mss-code { animation-delay: 0.7s; }
.mss-sheet .mss-info > .mss-code ~ * { animation-delay: 0.85s; }
.mss-sheet .mss-title-block { animation-delay: 1.1s; }
@keyframes mss-draw { to { stroke-dashoffset: 0; } }
@keyframes mss-settle {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
@media (prefers-reduced-motion: reduce) {
  .mss-sheet svg .mss-draw,
  .mss-sheet svg .mss-settle,
  .mss-sheet .mss-info > *,
  .mss-sheet .mss-notice > *,
  .mss-sheet .mss-title-block {
    animation: none;
    stroke-dashoffset: 0;
    opacity: 1;
    transform: none;
  }
}

/* Below the single-column breakpoint the plan is a picture, not a document
   (owner ruling 2026-08-24): SVG plan text renders ~4.4px at 390px viewports,
   so the strings hide and the info pane beneath — seat code, zone,
   nearest-first neighbor list, all ≥12px — carries the same information. The
   drawing-title-block conceit goes with it; its one non-duplicated datum
   (issued-for on the notice states) surfaces via .mss-notice-issued. */
@media (max-width: 880px) {
  .mss-main { grid-template-columns: 1fr; }
  .mss-plan { border-right: 0; border-bottom: 1px solid ${LINE}; }
  .mss-plan svg text,
  .mss-zone-ref { display: none; }
  .mss-title-block { display: none; }
  .mss-notice-issued { display: block; }
}
@media print {
  .mss-backdrop { background: #fff; padding: 0; }
  .mss-sheet { box-shadow: none; max-width: none; }
  .mss-sheet::after { display: none; }
  .mss-back { display: none; }
}
`;

// ---- Plan projection ------------------------------------------------------
// Visual [0,1] coordinates -> sheet drawing units, aspect-true: dx spans the
// wide floor image, so x is stretched by MAP_ASPECT_RATIO before fitting the
// cluster window into the plot area.

const VIEW_W = 640;
const VIEW_H = 470;
const PLOT = { left: 30, top: 76, right: 610, bottom: 396 };
const DESK_W = 52;
const DESK_H = 27;

type Projector = (point: { x: number; y: number }) => { px: number; py: number };

function makeProjector(frame: ReturnType<typeof frameCluster>): Projector {
  const physicalW = frame.width * MAP_ASPECT_RATIO;
  const plotW = PLOT.right - PLOT.left;
  const plotH = PLOT.bottom - PLOT.top;
  const scale = Math.min(plotW / physicalW, plotH / frame.height);
  const offsetX = PLOT.left + (plotW - physicalW * scale) / 2;
  const offsetY = PLOT.top + (plotH - frame.height * scale) / 2;
  return point => ({
    px: offsetX + (point.x - frame.minX) * MAP_ASPECT_RATIO * scale,
    py: offsetY + (point.y - frame.minY) * scale
  });
}

function PlanDesk({ px, py, label, kind }: { px: number; py: number; label: string; kind: "mine" | "neighbor" | "context" }) {
  const stroke = kind === "mine" ? COPPER : kind === "neighbor" ? INK : LINE;
  return (
    <g>
      <rect
        className={`mss-draw ${kind === "mine" ? "" : "mss-d3"}`.trim()}
        pathLength={1}
        x={px - DESK_W / 2}
        y={py - DESK_H / 2}
        width={DESK_W}
        height={DESK_H}
        fill={kind === "mine" ? "rgba(169,106,56,0.14)" : "none"}
        stroke={stroke}
        strokeWidth={kind === "mine" ? 1.75 : 1}
      />
      {kind !== "context" && (
        <text
          className="mss-settle"
          x={px}
          y={py + 3.5}
          textAnchor="middle"
          fontSize={10}
          fill={kind === "mine" ? COPPER : MUTED}
          fontWeight={kind === "mine" ? 600 : 400}
        >
          {label}
        </text>
      )}
    </g>
  );
}

function PlanDetail({
  mySeat,
  neighbors,
  contextSeats,
  zoneLabel
}: {
  mySeat: SeatWithEmployee;
  neighbors: SeatWithEmployee[];
  contextSeats: SeatWithEmployee[];
  zoneLabel: string;
}) {
  const frame = frameCluster([mySeat, ...neighbors]);
  const project = makeProjector(frame);
  const mine = project(mySeat);

  // Dashed detail boundary hugging the drawn desks — the drafting convention
  // for "this is a crop of a larger plan", which is exactly what it is.
  const allPoints = [mine, ...neighbors.map(project), ...contextSeats.map(project)];
  const pad = 44;
  const boundary = {
    minX: Math.max(16, Math.min(...allPoints.map(p => p.px)) - pad),
    minY: Math.max(58, Math.min(...allPoints.map(p => p.py)) - pad),
    maxX: Math.min(VIEW_W - 16, Math.max(...allPoints.map(p => p.px)) + pad),
    maxY: Math.min(VIEW_H - 58, Math.max(...allPoints.map(p => p.py)) + pad)
  };

  return (
    <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} role="img" aria-label={`Plan detail of ${zoneLabel} with seat ${mySeat.label} highlighted`}>
      <defs>
        <marker id="mss-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0.5 L7.5,4 L0,7.5" fill="none" stroke={COPPER} strokeWidth="1" />
        </marker>
      </defs>

      <rect
        className="mss-draw"
        pathLength={1}
        x={boundary.minX}
        y={boundary.minY}
        width={boundary.maxX - boundary.minX}
        height={boundary.maxY - boundary.minY}
        fill="none"
        stroke={INK}
        strokeWidth={0.9}
        strokeDasharray="6 4"
      />

      {/* Zone reference line above the boundary, drafting extension ticks.
          mss-zone-ref hides with the SVG text below 880px — a dimension line
          without its text is floating decoration. */}
      <g className="mss-draw mss-d2 mss-zone-ref" stroke={INK} strokeWidth={0.75} fill="none">
        <line pathLength={1} x1={boundary.minX} y1={boundary.minY - 18} x2={boundary.maxX} y2={boundary.minY - 18} />
        <line pathLength={1} x1={boundary.minX} y1={boundary.minY - 26} x2={boundary.minX} y2={boundary.minY - 10} />
        <line pathLength={1} x1={boundary.maxX} y1={boundary.minY - 26} x2={boundary.maxX} y2={boundary.minY - 10} />
      </g>
      <text
        className="mss-settle"
        x={(boundary.minX + boundary.maxX) / 2}
        y={boundary.minY - 26}
        textAnchor="middle"
        fontSize={10}
        fill={MUTED}
        letterSpacing="2"
      >
        {zoneLabel.toUpperCase()} — PLAN DETAIL
      </text>

      {contextSeats.map(seat => {
        const p = project(seat);
        return <PlanDesk key={seat.id} px={p.px} py={p.py} label={seat.label} kind="context" />;
      })}
      {neighbors.map(seat => {
        const p = project(seat);
        return <PlanDesk key={seat.id} px={p.px} py={p.py} label={seat.label} kind="neighbor" />;
      })}
      <PlanDesk px={mine.px} py={mine.py} label={mySeat.label} kind="mine" />

      {/* Leader from the annotation to my desk */}
      <g className="mss-draw mss-d3" fill="none" stroke={COPPER} strokeWidth={1.25}>
        <path
          pathLength={1}
          d={`M150 ${VIEW_H - 24} H${Math.max(170, mine.px - 60)} L${mine.px - DESK_W / 2 - 4} ${mine.py + DESK_H / 2 + 4}`}
          markerEnd="url(#mss-arrow)"
        />
      </g>
      <text className="mss-settle" x={146} y={VIEW_H - 20} textAnchor="end" fontSize={11} fill={COPPER} letterSpacing="2" fontWeight={600}>
        YOUR SEAT — {mySeat.label}
      </text>
    </svg>
  );
}

// ---- Sheet chrome ---------------------------------------------------------

function TitleBlock({ issuedFor, dateLabel }: { issuedFor: string; dateLabel: string | null }) {
  return (
    <div className="mss-title-block">
      <div className="mss-tb-cell">
        <span className="mss-tb-label">Project</span>
        <span className="mss-tb-value">Megeredchian Law — office seating</span>
      </div>
      <div className="mss-tb-cell">
        <span className="mss-tb-label">Scale</span>
        <span className="mss-tb-value">NTS</span>
      </div>
      <div className="mss-tb-cell">
        <span className="mss-tb-label">Drawn by</span>
        <span className="mss-tb-value">Seat Planner</span>
      </div>
      <div className="mss-tb-cell">
        <span className="mss-tb-label">Published</span>
        <span className="mss-tb-value">{dateLabel ?? "—"}</span>
      </div>
      <div className="mss-tb-cell">
        <span className="mss-tb-label">Issued for</span>
        <span className="mss-tb-value">{issuedFor}</span>
      </div>
      <div className="mss-tb-cell mss-tb-sheetno">
        <span className="mss-tb-label">Sheet</span>
        <span className="mss-tb-value">A-101</span>
      </div>
    </div>
  );
}

function SheetShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mss-backdrop">
      <style>{CSS}</style>
      <main className="mss-sheet">
        <div className="mss-outer" aria-hidden />
        <div className="mss-frame">{children}</div>
      </main>
      <Link href="/" className="mss-back">
        Back to the seat map
      </Link>
    </div>
  );
}

function formatSeatCode(label: string) {
  const match = label.match(/^([A-Za-z]+)(\d+)$/);
  if (!match) return <>{label}</>;
  return (
    <>
      {match[1].toUpperCase()}
      <em>–</em>
      {match[2]}
    </>
  );
}

export type SeatSheetProps = {
  employee: Employee;
  /** The employee's seat, in VISUAL coordinates (seatsToVisualSeats). */
  mySeat: SeatWithEmployee;
  /** Nearest occupied seats, visual coordinates, already ordered. */
  neighbors: SeatWithEmployee[];
  /** Every published seat in visual coordinates — context desks are culled
   *  to the drawn window here. */
  allSeats: SeatWithEmployee[];
  lastPublishedLabel: string | null;
};

export function SeatSheet({ employee, mySeat, neighbors, allSeats, lastPublishedLabel }: SeatSheetProps) {
  const drawnIds = new Set([mySeat.id, ...neighbors.map(seat => seat.id)]);
  const frame = frameCluster([mySeat, ...neighbors]);
  const contextSeats = allSeats.filter(
    seat =>
      !drawnIds.has(seat.id) &&
      seat.x >= frame.minX &&
      seat.x <= frame.minX + frame.width &&
      seat.y >= frame.minY &&
      seat.y <= frame.minY + frame.height
  );
  const zoneLabel = mySeat.zone ?? "Published map";
  const neighborNames = neighbors
    .map(seat => `${seat.employee?.full_name ?? "Unassigned"} (${seat.label})`)
    .join(", ");

  const roleLine = [employee.position, employee.department].filter(Boolean).join(" · ");
  const facts: Array<{ label: string; detail: string }> = [];
  if (neighbors.length > 0) facts.push({ label: "Your neighbors", detail: neighborNames });
  if (employee.phone_extension) facts.push({ label: "Phone extension", detail: employee.phone_extension });
  if (employee.department) facts.push({ label: "Department", detail: employee.department });
  if (lastPublishedLabel) facts.push({ label: "Map published", detail: lastPublishedLabel });

  return (
    <SheetShell>
      <div className="mss-main">
        <div className="mss-plan">
          <PlanDetail mySeat={mySeat} neighbors={neighbors} contextSeats={contextSeats} zoneLabel={zoneLabel} />
        </div>
        <div className="mss-info">
          <p className="mss-eyebrow">Seat assignment</p>
          <h1 className="mss-name">{employee.full_name}</h1>
          {roleLine && <p className="mss-role">{roleLine}</p>}
          <p className="mss-code" aria-label={`Seat ${mySeat.label}`}>
            {formatSeatCode(mySeat.label)}
          </p>
          <p className="mss-code-sub">{zoneLabel}</p>
          <hr className="mss-rule" />
          <ul className="mss-facts">
            {facts.map(fact => (
              <li key={fact.label}>
                <p className="mss-fact-label">{fact.label}</p>
                <p className="mss-fact-detail">{fact.detail}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <TitleBlock issuedFor={employee.full_name} dateLabel={lastPublishedLabel} />
    </SheetShell>
  );
}

/** Sheet-voiced empty state: same drawing chrome, a notice instead of a plan. */
export function SeatSheetNotice({
  heading,
  detail,
  issuedFor
}: {
  heading: string;
  detail: string;
  issuedFor: string;
}) {
  return (
    <SheetShell>
      <div className="mss-notice">
        <p className="mss-eyebrow">Seat assignment</p>
        <h1 className="mss-notice-heading">{heading}</h1>
        <p className="mss-notice-detail">{detail}</p>
        {/* Below 880px the title block is hidden, and on the notice states it
            is the only place the account/name appears — carry it here. */}
        <p className="mss-notice-issued">Issued for {issuedFor}</p>
      </div>
      <TitleBlock issuedFor={issuedFor} dateLabel={null} />
    </SheetShell>
  );
}
