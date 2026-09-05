import Link from "next/link";
import { AdminManagementPanel } from "@/components/admin-management/AdminManagementPanel";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { getAdminPageContext } from "@/lib/adminPageGuard";
import type { DepartmentOption, Employee, SeatWithEmployee, ZoneOption } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// D5: Publish History left this page for the History panel (PR 2); a legacy
// ?tab=publishHistory link lands on Employees.
const managementTabIds = ["employees", "departments", "zones"] as const;
type ManagementTabId = (typeof managementTabIds)[number];

function parseTabParam(value: string | string[] | undefined): ManagementTabId | undefined {
  const candidate = Array.isArray(value) ? value[0] : value;
  return managementTabIds.find(id => id === candidate);
}

export default async function AdminManagementPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { supabase, isAdmin } = await getAdminPageContext("/admin/management");
  const initialTab = parseTabParam((await searchParams)?.tab);

  if (!isAdmin) {
    // The shared 403 card (DECISIONS D5-d): the asset empty state on the
    // route card, and the action the body-only variant lacked. Its tertiary
    // sits on the WHITE card (layer-02), never layer-01 — 4.14:1 there is
    // recorded not-gated (PHASE4BUILD §1.22). The sheet paints `.sp-route-card`
    // layer-01 (PHASE3DS §1.29); this card carries a tertiary, so the surface
    // is set inline (a utility class loses to the sheet's later rule).
    return (
      <main className="flex min-h-0 flex-1 items-start justify-center bg-[var(--sp-background)] p-8">
        <section className="sp-route-card w-full" style={{ background: "var(--sp-layer-02)" }}>
          <div className="cds-empty">
            <h2>Admin access required</h2>
            <p>You are signed in, but your profile does not have admin permissions. Ask an admin to upgrade your role if you need to manage people, departments or zones.</p>
            <div className="cds-empty-actions">
              <Link href="/" className="cds-btn cds-btn--tertiary cds-btn--md">Back to seat map</Link>
            </div>
          </div>
        </section>
      </main>
    );
  }

  // Paged: an unbounded select is silently truncated at the project row cap,
  // which here would hide people from the directory with no indication.
  // Independent queries fire together — serial awaits stacked round-trips
  // into this force-dynamic render (seconds of dead time after a rail click).
  const [seats, employees, departmentsResult, zonesResult] = await Promise.all([
    fetchAllRows<SeatWithEmployee>(
      (from, to) =>
        supabase
          .from("seats")
          .select("*, employee:employees(*)", { count: "exact" })
          .eq("layer", "draft")
          .order("label")
          .range(from, to),
      { label: "draft seats" }
    ),
    fetchAllRows<Employee>(
      (from, to) =>
        supabase
          .from("employees")
          .select("*", { count: "exact" })
          .eq("active", true)
          .order("full_name")
          .order("id")
          .range(from, to),
      { label: "employees" }
    ),
    supabase.from("department_options").select("*").eq("active", true).order("name"),
    supabase.from("zone_options").select("*").eq("active", true).order("name")
  ]);

  const { data: departments, error: departmentsError } = departmentsResult;
  const { data: zones, error: zonesError } = zonesResult;

  // Seat and employee failures already threw inside fetchAllRows.
  if (departmentsError || zonesError) {
    throw new Error(departmentsError?.message ?? zonesError?.message);
  }

  return (
    // The persistent shell (app/(shell)/layout.tsx) owns the fixed header and
    // sizes this pane as a flex column (viewport-height at lg), so the page
    // fills it with flex-1 and never subtracts chrome itself. The skip link
    // lives in the shell header (shellNavConfig maps this route to
    // #admin-subpage-main); this page owns the landing marker below.
    <div className="flex min-h-0 flex-1 flex-col bg-[var(--sp-background)] lg:overflow-hidden">
      {/* Skip-link landing: focusable zero-height marker; the next Tab enters
          the panel content. */}
      <div id="admin-subpage-main" tabIndex={-1} className="outline-none" />
      {/* Desktop: the document never scrolls (viewer-map contract) — long
          content scrolls inside this focusable region instead (tabIndex +
          aria-label per axe scrollable-region-must-be-focusable). */}
      <div
        role="region"
        aria-label="Management"
        tabIndex={0}
        className="flex flex-1 flex-col [scrollbar-width:thin] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--sp-focus)] lg:min-h-0 lg:overflow-y-auto"
      >
        <AdminManagementPanel
          seats={seats}
          employees={employees}
          departmentOptions={(departments ?? []) as DepartmentOption[]}
          zoneOptions={(zones ?? []) as ZoneOption[]}
          initialTab={initialTab}
        />
      </div>
    </div>
  );
}
