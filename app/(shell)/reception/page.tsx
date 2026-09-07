import { redirect } from "next/navigation";
import { connection } from "next/server";
import { ReceptionFrame } from "@/components/reception/ReceptionFrame";
import { ReceptionScreen } from "@/components/reception/ReceptionScreen";
import { buildReceptionDirectory } from "@/lib/receptionDirectory";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { getSessionContext } from "@/lib/serverAuth";
import type { Employee } from "@/lib/types";
import { VIEWER_SEAT_COLUMNS, withNullNotes, type ViewerSeatRow } from "@/lib/viewerSeatColumns";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Reception — front-desk call routing. Read-only for ANY signed-in role
// (viewer or admin), so this page gates on session only — deliberately not
// getAdminPageContext, which is for admin-only pages. Like the viewer map, it
// reads exclusively the published layer: published_employees (the publish-time
// snapshot) + layer='published' seats. Never the live employees table, never
// draft seats — extension/directory edits reach this screen at the next
// publish, exactly like seat edits reach the viewer map.
//
// The header + panels come from the (shell) layout's persistent AppShell
// (which also owns the role-fitted section links). getSessionContext is
// React-cache()d, so this page's user check shares the layout's single auth
// probe.
//
// `?q=` (DECISIONS D3-c, PHASE2UX §1R.5): the landing query is read here and
// handed to the screen, which pre-fills the field and — for a unique match —
// locks the readout. Nothing else is in the URL.
export default async function ReceptionPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const { supabase, user } = await getSessionContext();

  if (!user) redirect("/login?next=/reception");

  const rawQuery = (await searchParams)?.q;
  const initialQuery = typeof rawQuery === "string" ? rawQuery.trim() : "";

  // Both queries only need the session, so they fire together — serial
  // awaits stacked round-trips into this force-dynamic render. Settled, not
  // all-or-nothing (PHASE2UX §1R.6 "Partial"; P2-5): the directory is the
  // page — without it the boundary takes over — but the seats are one column
  // and the readout's seat line, so when only that query fails the
  // extensions still read and the screen says the seat details are missing.
  const [seatsResult, employeesResult] = await Promise.allSettled([
    fetchAllRows<ViewerSeatRow>(
      (from, to) =>
        supabase
          .from("seats")
          .select(VIEWER_SEAT_COLUMNS, { count: "exact" })
          .eq("layer", "published")
          .order("label")
          .range(from, to),
      { label: "published seats" }
    ),
    fetchAllRows<Employee>(
      (from, to) =>
        supabase
          .from("published_employees")
          .select("*", { count: "exact" })
          .eq("active", true)
          .order("full_name")
          .order("id")
          .range(from, to),
      { label: "published employees" }
    )
  ]);

  if (employeesResult.status === "rejected") throw employeesResult.reason;
  const seatsUnavailable = seatsResult.status === "rejected";
  const seats = seatsUnavailable ? [] : seatsResult.value;

  const people = buildReceptionDirectory(employeesResult.value, seats.map(withNullNotes));

  return (
    // The persistent shell (app/(shell)/layout.tsx) owns the fixed header and
    // sizes this pane as a flex column (viewport-height at lg): flex-1 fills it.
    <main className="flex min-h-0 flex-1 flex-col bg-[var(--sp-background)] text-[var(--sp-text-primary)] lg:overflow-hidden">
      {/* Desktop: the document never scrolls (viewer-map contract) — the
          directory scrolls inside this focusable region instead (tabIndex +
          aria-label per axe scrollable-region-must-be-focusable). The skip
          link lands on the search field itself (#reception-main, PHASE2UX
          §1R.7) — the field is the page's first control, so no marker div. */}
      <div
        role="region"
        aria-label="Reception directory"
        tabIndex={0}
        className="flex flex-1 flex-col [scrollbar-width:thin] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--sp-focus)] lg:min-h-0 lg:overflow-y-auto"
      >
        <ReceptionFrame>
          <ReceptionScreen people={people} initialQuery={initialQuery} seatsUnavailable={seatsUnavailable} />
        </ReceptionFrame>
      </div>
    </main>
  );
}
