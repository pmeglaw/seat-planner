import { DataUtilitiesPanel } from "@/components/admin-settings/DataUtilitiesPanel";
import { AdminShellBar } from "@/components/ui/AdminShellBar";
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

  const { data: seats, error: seatsError } = await supabase
    .from("seats")
    .select("*, employee:employees(*)")
    .eq("layer", "draft")
    .order("label");

  const { data: employees, error: employeesError } = await supabase
    .from("employees")
    .select("*")
    .eq("active", true)
    .order("full_name");

  if (seatsError || employeesError) {
    throw new Error(seatsError?.message ?? employeesError?.message);
  }

  return (
    <main className="admin-theme min-h-screen bg-[var(--admin-bg)] text-[var(--admin-text-primary)]">
      <AdminShellBar page="settings" />
      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
        <header className="mb-6 border-b border-[var(--admin-border)] pb-4">
          <h1 className="text-xl font-semibold text-[var(--admin-text-primary)]">Settings</h1>
          <p className="mt-1 text-sm leading-5 text-[var(--admin-text-muted)]">
            Gated utilities — imports, exports, and recovery run against the draft layer
          </p>
        </header>

        <DataUtilitiesPanel
          seats={(seats ?? []) as SeatWithEmployee[]}
          employees={(employees ?? []) as Employee[]}
        />
      </div>
    </main>
  );
}
