import Link from "next/link";
import { DataUtilitiesPanel } from "@/components/admin-settings/DataUtilitiesPanel";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { getAdminPageContext } from "@/lib/adminPageGuard";
import type { Employee, SeatWithEmployee } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminSettingsPage() {
  const { supabase, isAdmin } = await getAdminPageContext("/admin/settings");

  if (!isAdmin) {
    // The shared 403 card (DECISIONS D6-d): the asset empty state on the
    // route card with the action. Its tertiary sits on the WHITE card
    // (layer-02), never layer-01 — 4.14:1 there is recorded not-gated
    // (PHASE4BUILD §1.22). The sheet paints `.sp-route-card` layer-01
    // (PHASE3DS §1.29); this card carries a tertiary, so the surface is set
    // inline (a utility class loses to the sheet's later rule).
    return (
      <main className="flex min-h-0 flex-1 items-start justify-center bg-[var(--sp-background)] p-8 text-[var(--sp-text-primary)]">
        <section className="sp-route-card w-full" style={{ background: "var(--sp-layer-02)" }}>
          <div className="cds-empty">
            <h2>Admin access required</h2>
            <p>You are signed in, but your profile does not have admin permissions. Ask an admin to upgrade your role if you need to import or restore draft data.</p>
            <div className="cds-empty-actions">
              <Link href="/" className="cds-btn cds-btn--tertiary cds-btn--md">Back to seat map</Link>
            </div>
          </div>
        </section>
      </main>
    );
  }

  // Paged: an unbounded select is silently truncated at the project row cap.
  // This page feeds CSV export and the JSON snapshot, so a short read would
  // write an incomplete backup that still looks like a complete one.
  // This surface reads the DRAFT layer only — the invariant this codebase is
  // built on, verified by grepping this file. (Reset draft, the one thing
  // here that compared against the published layer, retired with ruling 22.)
  // Independent queries fire together — serial awaits stacked round-trips
  // into this force-dynamic render (seconds of dead time after a rail click).
  const [seats, employees] = await Promise.all([
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
    )
  ]);

  return (
    // The persistent shell (app/(shell)/layout.tsx) owns the fixed header and
    // sizes this pane as a flex column (viewport-height at lg), so the page
    // fills it with flex-1 and never subtracts chrome itself. The skip link
    // lives in the shell header (shellNavConfig maps this route to
    // #admin-subpage-main); this page owns the landing marker below.
    <main className="flex min-h-0 flex-1 flex-col bg-[var(--sp-background)] text-[var(--sp-text-primary)] lg:overflow-hidden">
      {/* Skip-link landing: focusable zero-height marker; the next Tab enters
          the panel content. */}
      <div id="admin-subpage-main" tabIndex={-1} className="outline-none" />
      {/* Desktop: the document never scrolls (viewer-map contract) — long
          content scrolls inside this focusable region instead (tabIndex +
          aria-label per axe scrollable-region-must-be-focusable). */}
      <div
        role="region"
        aria-label="Settings"
        tabIndex={0}
        className="flex-1 [scrollbar-width:thin] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--sp-focus)] lg:min-h-0 lg:overflow-y-auto"
      >
        {/* The Settings archetype (PHASE3DS §1.22 / §1.27): the page frame with
            the asset page header — title, subtitle, NO primary (D6-a: each
            section carries its own) — and the 776 content column. */}
        <div className="sp-page mx-auto w-full">
          <div className="cds-page-header">
            <div>
              <h1 className="cds-page-title">Settings</h1>
              <p className="cds-page-subtitle">Import, export and recovery. Everything here changes the draft only.</p>
            </div>
          </div>
          <DataUtilitiesPanel seats={seats} employees={employees} />
        </div>
      </div>
    </main>
  );
}
