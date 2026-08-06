"use client";

import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { AdminShellBar } from "@/components/ui/AdminShellBar";
import { AppRail, type AppRailActive } from "@/components/ui/AppRail";
import type { SkewDetector } from "@/lib/deploySkew";

// Persistent app shell for the (shell) route group (/admin, /admin/management,
// /admin/settings, /reception). Mounted ONCE by app/(shell)/layout.tsx and
// kept alive across client-side navigations — only the content pane below it
// swaps — which is what makes rail clicks feel instant instead of unmounting
// the whole chrome into a route-level loading wash (the pre-shell behavior,
// where every page mounted its own rail).
//
// The rail's per-surface wiring (active item, skip link, the sub-page brand
// bar) derives from usePathname, so it tracks navigation without remounting.
// Surface-owned behavior — SeatMap's unsaved-edits veto and its in-place Ask
// Planner opener — reaches the rail through the registration context below:
// the page component registers on mount and unregisters on unmount, and the
// rail reads whatever is currently registered. That keeps the veto contract
// AppRail has always had (tests/app-rail.test.mjs) while the rail outlives
// any one page.

type NavigationGuard = (href: string, label: string) => boolean;

type ShellNavigationHandlers = {
  /** Veto-only unsaved-edits guard — return false to intercept a nav click. */
  guard?: NavigationGuard;
  /** Open Ask Planner in place (map surface only); absent → the AI rail item
   *  is a plain link to /admin?ask-planner=open. */
  openAskPlanner?: () => void;
};

type AppShellContextValue = {
  register: (handlers: ShellNavigationHandlers) => () => void;
};

const AppShellContext = createContext<AppShellContextValue | null>(null);

/**
 * Plug a surface's navigation handlers into the persistent rail. Safe to call
 * without a shell ancestor (standalone component tests): it no-ops. The
 * freshest closures are read through a ref, so the registration itself happens
 * once per mount and never re-fires as state referenced by the guard changes.
 */
export function useAppShellNavigation(handlers: ShellNavigationHandlers) {
  const context = useContext(AppShellContext);
  const latest = useRef(handlers);
  useEffect(() => {
    latest.current = handlers;
  });
  const hasOpener = Boolean(handlers.openAskPlanner);
  useEffect(() => {
    if (!context) return;
    return context.register({
      guard: (href, label) => latest.current.guard?.(href, label) ?? true,
      openAskPlanner: hasOpener ? () => latest.current.openAskPlanner?.() : undefined
    });
  }, [context, hasOpener]);
}

function activeFromPathname(pathname: string): AppRailActive {
  if (pathname.startsWith("/admin/management")) return "management";
  if (pathname.startsWith("/admin/settings")) return "settings";
  if (pathname.startsWith("/reception")) return "reception";
  return "map";
}

// Per-surface skip-link targets (each page renders the matching focusable
// marker). The rail renders the link as its first focusable — the contract
// tests/accessibility-source.test.mjs pins.
const SKIP_LINKS: Record<AppRailActive, { href: string; label: string }> = {
  map: { href: "#planning-canvas", label: "Skip to seat map" },
  management: { href: "#admin-subpage-main", label: "Skip to content" },
  settings: { href: "#admin-subpage-main", label: "Skip to content" },
  reception: { href: "#reception-main", label: "Skip to content" }
};

export type AppShellProps = {
  email: string;
  isAdmin: boolean;
  /** Test seam only — forwarded to AppRail (defaults to its module singleton). */
  skewDetector?: SkewDetector;
  children: ReactNode;
};

export function AppShell({ email, isAdmin, skewDetector, children }: AppShellProps) {
  const pathname = usePathname();
  const [handlers, setHandlers] = useState<ShellNavigationHandlers | null>(null);

  // Stable register identity: the context value must not change per render,
  // or every consumer's registration effect would re-fire in a loop.
  const register = useCallback((next: ShellNavigationHandlers) => {
    setHandlers(next);
    return () => setHandlers(current => (current === next ? null : current));
  }, []);
  const contextValue = useMemo(() => ({ register }), [register]);

  const active = activeFromPathname(pathname);

  return (
    <AppShellContext.Provider value={contextValue}>
      {/* admin-theme + display:contents: the chrome tokens (--admin-*) are
          class-scoped in globals.css and pages own their content themes
          (reception is reception-theme), so the shell scopes ONLY its own
          chrome. `contents` keeps the wrapper out of layout — the rail stays
          position:fixed and the bar sticky against the viewport. */}
      <div className="admin-theme contents">
        <AppRail
          active={active}
          railMode={isAdmin ? "admin" : "viewer"}
          email={email}
          roleLabel={isAdmin ? "Admin" : "Viewer"}
          onNavigate={handlers?.guard}
          onOpenAskPlanner={handlers?.openAskPlanner}
          skipLink={SKIP_LINKS[active]}
          {...(skewDetector ? { skewDetector } : {})}
        />
        {/* The identity-only brand bar tops every sub-page; the map carries its
            own richer header inside SeatMap, so it opts out. */}
        {active !== "map" && <AdminShellBar />}
      </div>
      {children}
    </AppShellContext.Provider>
  );
}
