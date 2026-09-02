import { floorOf, type FloorId } from "@/lib/floorIds";
import type { Seat } from "@/lib/types";

// Viewer surfaces (/, /my-seat, /reception) read published seats through this
// explicit column list, never select("*"): the seats table carries admin-only
// free text (`notes`), and a * select ships it to every viewer's browser even
// though no viewer surface renders it. A new seats column stays OFF the wire
// for viewers until deliberately added here.
//
// Kept as a string literal (not an array .join) so supabase-js can parse the
// selection at the type level — a plain `string` select degrades the row type
// to GenericStringError.
export const VIEWER_SEAT_COLUMNS =
  "id,seat_key,label,x,y,status,layer,employee_id,zone,department,is_custom,created_at,updated_at";

type Split<S extends string> = S extends `${infer Head},${infer Rest}` ? Head | Split<Rest> : S;

// Compile-time pin: every name in the literal above is a real Seat column and
// none of them is `notes` — a column rename or a sneaked-in notes fails
// typecheck on this line, not in production.
const viewerColumnsAreSafe: Split<typeof VIEWER_SEAT_COLUMNS> extends Exclude<keyof Seat, "notes">
  ? true
  : never = true;
void viewerColumnsAreSafe;

// What a viewer seat query actually returns — Seat minus the columns the list
// above deliberately omits. `floor` (20260901120000) is off the viewer wire
// until multi-floor PR-2 adds it here as the first consumer; keeping PR-1 free
// of any runtime read of the column means a Vercel deploy racing the Supabase
// migration cannot fail a viewer page.
export type ViewerSeatRow = Omit<Seat, "notes" | "floor">;

// The shared Seat type still declares `notes`, so viewer rows carry an
// explicit null instead of a silently missing property. The same goes for
// `floor`: until PR-2 selects it, every published row IS Floor 3 by the column
// default, and floorOf() keeps a real value once the column is on the wire.
export function withNullNotes<Row extends object>(row: Row): Row & { notes: null; floor: FloorId } {
  return { ...row, notes: null, floor: floorOf(row as { floor?: string | null }) };
}
