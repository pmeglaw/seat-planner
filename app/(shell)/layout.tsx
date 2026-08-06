import type { ReactNode } from "react";
import { AppShell } from "@/components/ui/AppShell";
import { getSessionContext } from "@/lib/serverAuth";

// Persistent chrome for every railed surface: /admin, /admin/management,
// /admin/settings, /reception. This layout renders the rail (+ the sub-page
// brand bar) exactly once per document load; client-side navigations between
// these routes swap only the content pane below it, so the shell never
// disappears into a loading wash between sections. The route group changes no
// URLs — it exists purely so these routes share this layout.
//
// Auth here is chrome-only (which rail flavor, whose email). Every page below
// still runs its own guard — getAdminPageContext / the reception session gate
// — and the shared getSessionContext is React-cache()d, so layout + page
// together still cost ONE auth probe and ONE role lookup per server render.
export default async function ShellLayout({ children }: { children: ReactNode }) {
  const { user, role } = await getSessionContext();

  // Anonymous visitors: render bare. The pages redirect to /login themselves,
  // and a rail flash before that redirect would advertise chrome the visitor
  // cannot use.
  if (!user) return children;

  return (
    <AppShell email={user.email ?? ""} isAdmin={role === "admin"}>
      {children}
    </AppShell>
  );
}
