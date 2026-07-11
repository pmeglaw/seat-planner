import Link from "next/link";
import { DataUtilitiesPanel } from "@/components/admin-settings/DataUtilitiesPanel";
import { getAdminPageContext } from "@/lib/adminPageGuard";
import type { Employee, SeatWithEmployee } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminSettingsPage() {
  const { supabase, isAdmin } = await getAdminPageContext("/admin/settings");

  if (!isAdmin) {
    return (
      <main className="admin-theme flex min-h-screen items-center justify-center bg-[var(--admin-bg)] p-6 text-[var(--admin-text-primary)]">
        <section className="max-w-md rounded-2xl bg-white p-6 shadow-soft">
          <h1 className="text-lg font-bold text-slate-900">Admin access required</h1>
          <p className="mt-2 text-sm text-slate-600">
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
      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-3 border-b border-[var(--admin-border)] pb-4">
          <div>
            <h1 className="text-xl font-semibold text-[var(--admin-text-primary)]">Settings</h1>
            <p className="mt-1 text-sm leading-5 text-[var(--admin-text-muted)]">
              Gated utilities — imports, exports, and recovery run against the draft layer
            </p>
          </div>
          <Link
            href="/admin"
            className="rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] px-3 py-2 text-sm font-semibold text-[var(--admin-text-primary)] transition hover:border-[var(--admin-border-strong)] hover:bg-[var(--admin-surface-alt)] active:scale-[0.985] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sp-focus-ring-color)]"
          >
            Back to planning canvas
          </Link>
        </header>

        <DataUtilitiesPanel
          seats={(seats ?? []) as SeatWithEmployee[]}
          employees={(employees ?? []) as Employee[]}
        />
      </div>
    </main>
  );
}
