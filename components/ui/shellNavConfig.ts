// Route → shell facts for the persistent Phase 3 shell (PHASE2UX §1.2, §1.7):
// the section links, which one is current, and each surface's skip-link
// target. One module so AppTopBar, LeftPanel and AppShell agree — and so
// tests/accessibility-source.test.mjs can pin the skip-link literals here.

export type SectionId = "map" | "reception" | "management" | "settings";

export type SectionLink = {
  id: SectionId;
  label: string;
  /** The map link is role-fitted: admins land on the draft, everyone else on
   *  the published map (PHASE2UX §1.2 slot 3). */
  href: (isAdmin: boolean) => string;
  adminOnly: boolean;
};

// Order is the header order (Seat map · Reception · Management · Settings).
export const SECTION_LINKS: readonly SectionLink[] = [
  { id: "map", label: "Seat map", href: isAdmin => (isAdmin ? "/admin" : "/"), adminOnly: false },
  { id: "reception", label: "Reception", href: () => "/reception", adminOnly: false },
  { id: "management", label: "Management", href: () => "/admin/management", adminOnly: true },
  { id: "settings", label: "Settings", href: () => "/admin/settings", adminOnly: true }
];

export function sectionLinksFor(isAdmin: boolean): Array<{ id: SectionId; label: string; href: string }> {
  return SECTION_LINKS.filter(link => isAdmin || !link.adminOnly).map(link => ({ id: link.id, label: link.label, href: link.href(isAdmin) }));
}

/** "/" and "/admin" are both the map section (the indicator carries the mode). */
export function activeSectionFor(pathname: string): SectionId {
  if (pathname.startsWith("/admin/management")) return "management";
  if (pathname.startsWith("/admin/settings")) return "settings";
  if (pathname.startsWith("/reception")) return "reception";
  return "map";
}

// Per-surface skip-link targets (each page renders the matching focusable
// landing marker). The shipped per-route labels are kept (owner ruling
// 2026-09-04, PHASE2UX §1.7 amendment): the guardrail is first-focusable +
// a real target; the copy is more informative than the generic.
export const SKIP_LINKS: Record<SectionId | "viewer", { href: string; label: string }> = {
  map: { href: "#planning-canvas", label: "Skip to seat map" },
  viewer: { href: "#viewer-seat-map", label: "Skip to seat map" },
  management: { href: "#admin-subpage-main", label: "Skip to content" },
  settings: { href: "#admin-subpage-main", label: "Skip to content" },
  reception: { href: "#reception-main", label: "Skip to content" }
};

export function skipLinkFor(pathname: string): { href: string; label: string } {
  const section = activeSectionFor(pathname);
  if (section === "map" && !pathname.startsWith("/admin")) return SKIP_LINKS.viewer;
  return SKIP_LINKS[section];
}

// The asset hides .cds-header-nav at ≤ 1055px (carbon-components.css); below
// that the section links move into the left panel and the mode indicator
// takes its compact form. ONE constant, read through matchMedia.
export const BELOW_NAV_QUERY = "(max-width: 1055px)";

// Left panel open/closed is a per-user display preference (PHASE2UX §1.3),
// not URL state — the applied filters are.
export const LEFT_PANEL_STORAGE_KEY = (userId: string) => `seat-planner:left-panel-open:${userId}`;
