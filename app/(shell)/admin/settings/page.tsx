import { DataUtilitiesPanel } from "@/components/admin-settings/DataUtilitiesPanel";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { getAdminPageContext } from "@/lib/adminPageGuard";
import type { Employee, SeatWithEmployee } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminSettingsPage() {
  const { supabase, isAdmin } = await getAdminPageContext("/admin/settings");

  if (!isAdmin) {
    return (
      <main className="admin-theme flex min-h-screen items-center justify-center bg-[var(--admin-bg)] p-6 text-[var(--admin-text-primary)]">
        <section className="max-w-md border border-[var(--admin-border)] bg-[var(--admin-surface)] p-6 shadow-elevation-2">
          <h1 className="text-lg font-semibold text-[var(--admin-text-primary)]">Admin access required</h1>
          <p className="mt-2 text-sm text-[var(--admin-text-secondary)]">
            You are signed in, but your profile does not have admin permissions.
          </p>
        </section>
      </main>
    );
  }

  // Paged: an unbounded select is silently truncated at the project row cap.
  // This page feeds CSV export and the JSON snapshot, so a short read would
  // write an incomplete backup that still looks like a complete one.
  // Two explicit queries, not one parameterised helper: which layer a surface
  // reads is the invariant this codebase is built on, and it is verified by
  // grepping these files. A `layer` variable would hide it.
  // Independent queries fire together — serial awaits stacked round-trips
  // into this force-dynamic render (seconds of dead time after a rail click).
  const [seats, publishedSeats, employees] = await Promise.all([
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
    fetchAllRows<SeatWithEmployee>(
      (from, to) =>
        supabase
          .from("seats")
          .select("*, employee:employees(*)", { count: "exact" })
          .eq("layer", "published")
          .order("label")
          .range(from, to),
      { label: "published seats" }
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
    )
  ]);

  return (
    // pl-12 clears the v12 left rail — position:fixed, mounted by the (shell)
    // layout's persistent AppShell along with the AppTopBar above this
    // pane (hence the svh calc: bar height comes off the pane's min-height).
    // The skip link itself lives in the rail (AppShell maps this route to
    // #admin-subpage-main); this page owns the landing marker below.
    <main className="admin-theme min-h-[calc(100svh-var(--admin-chrome-h))] bg-[var(--admin-bg)] text-[var(--admin-text-primary)] pl-12">
      {/* Skip-link landing: focusable zero-height marker; the next Tab enters
          the panel content. */}
      <div id="admin-subpage-main" tabIndex={-1} className="outline-none" />
      <div className="mx-auto w-full max-w-[760px] px-6 pb-12 pt-6">
        <header className="mb-4">
          <h1 className="text-[22px] font-semibold leading-tight text-[var(--admin-text-primary)]">Settings</h1>
          <p className="mt-1 text-[13.5px] leading-5 text-[var(--admin-text-secondary)]">
            Import, export, and recovery tools. Everything here changes the draft only.
          </p>
        </header>

        <DataUtilitiesPanel
          seats={seats}
          publishedSeats={publishedSeats}
          employees={employees}
        />
      </div>
    </main>
  );
}
