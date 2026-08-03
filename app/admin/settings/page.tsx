import { DataUtilitiesPanel } from "@/components/admin-settings/DataUtilitiesPanel";
import { AdminShellBar } from "@/components/ui/AdminShellBar";
import { AppRail } from "@/components/ui/AppRail";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { getAdminPageContext } from "@/lib/adminPageGuard";
import type { Employee, SeatWithEmployee } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminSettingsPage() {
  const { supabase, isAdmin, user } = await getAdminPageContext("/admin/settings");

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
  const seats = await fetchAllRows<SeatWithEmployee>(
    (from, to) =>
      supabase
        .from("seats")
        .select("*, employee:employees(*)", { count: "exact" })
        .eq("layer", "draft")
        .order("label")
        .range(from, to),
    { label: "draft seats" }
  );

  const publishedSeats = await fetchAllRows<SeatWithEmployee>(
    (from, to) =>
      supabase
        .from("seats")
        .select("*, employee:employees(*)", { count: "exact" })
        .eq("layer", "published")
        .order("label")
        .range(from, to),
    { label: "published seats" }
  );

  const employees = await fetchAllRows<Employee>(
    (from, to) =>
      supabase
        .from("employees")
        .select("*", { count: "exact" })
        .eq("active", true)
        .order("full_name")
        .range(from, to),
    { label: "employees" }
  );

  return (
    // pl-12 clears the v12 left rail, which is position:fixed and does not
    // participate in this layout (mirrors SeatMap.tsx's root).
    <main className="admin-theme min-h-screen bg-[var(--admin-bg)] text-[var(--admin-text-primary)] pl-12">
      <AppRail
        active="settings"
        email={user.email ?? ""}
        roleLabel="Admin"
        skipLink={{ href: "#admin-subpage-main", label: "Skip to content" }}
      />
      <AdminShellBar />
      {/* Skip-link landing: focusable zero-height marker; the next Tab enters
          the panel content. */}
      <div id="admin-subpage-main" tabIndex={-1} className="outline-none" />
      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
        <header className="mb-6 border-b border-[var(--admin-border)] pb-4">
          <h1 className="text-xl font-semibold text-[var(--admin-text-primary)]">Settings</h1>
          <p className="mt-1 text-sm leading-5 text-[var(--admin-text-muted)]">
            Import, export, and draft snapshots. Everything here changes the draft only — the published map is never touched until you publish.
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
