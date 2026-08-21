"use client";

import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { AppRail, type AppRailActive } from "@/components/ui/AppRail";
import { AppTopBar, type AppTopBarSlot } from "@/components/ui/AppTopBar";
import type { SkewDetector } from "@/lib/deploySkew";

// Persistent app shell for the (shell) route group (/admin, /admin/management,
// /admin/settings, /reception). Mounted ONCE by app/(shell)/layout.tsx and
// kept alive across client-side navigations — only the content pane below it
// swaps — which is what makes rail clicks feel instant instead of unmounting
// the whole chrome into a route-level loading wash (the pre-shell behavior,
// where every page mounted its own rail).
//
// Top-bar-first (2026-08-14): the chrome is AppTopBar (full-width, spans the
// viewport top on EVERY shell route, map included) plus AppRail hanging below
// it. The bar's per-surface wiring (center title, skip link, slot contents)
// derives from usePathname, so it tracks navigation without remounting.
// Surface-owned behavior reaches the persistent chrome two ways:
// - handlers (SeatMap's unsaved-edits veto and its in-place Ask Planner
//   opener) through the registration context below — the page registers on
//   mount, unregisters on unmount, the rail reads whatever is registered.
//   That keeps the veto contract AppRail has always had
//   (tests/app-rail.test.mjs) while the rail outlives any one page.
// - live bar content (undo/redo, floor selector, publish) through the slots
//   context: AppTopBar registers its slot DOM elements here and the map
//   surface portals into them (useAppShellSlots below). Portals — not
//   registered ReactNodes — because this content re-renders with rapidly
//   changing surface state (undo depth, draft counts), which a
//   register-once-read-through-refs contract cannot express.

type NavigationGuard = (href: string, label: string) => boolean;

type ShellNavigationHandlers = {
  /** Veto-only unsaved-edits guard — return false to intercept a nav click. */
  guard?: NavigationGuard;
  /** Open Ask Planner in place (map surface only); absent → the AI rail item
   *  is a plain link to /admin?ask-planner=open. */
  openAskPlanner?: () => void;
  /** Live open-state of the Ask Planner drawer: drives the rail AI item's
   *  active treatment so both entry points (rail + bar) give the same
   *  feedback (chrome-unification 2026-08-20). Unlike the handlers above,
   *  this must RE-RENDER the rail when it changes, so it flows through its
   *  own state channel in the hook — never through the register effect. */
  askPlannerOpen?: boolean;
};

type AppShellContextValue = {
  register: (handlers: ShellNavigationHandlers) => () => void;
  setAskPlannerActive: (active: boolean) => void;
};

const AppShellContext = createContext<AppShellContextValue | null>(null);

export type AppShellSlots = Record<AppTopBarSlot, HTMLElement | null>;

// Separate context from the handler registration on purpose: slot elements
// change on surface transitions (the center slot remounts when the bar swaps
// between title and slot mode), and a combined context value would re-fire
// every consumer's registration effect on each of those — the slots context
// churns freely while the registration context stays referentially stable.
const AppShellSlotsContext = createContext<AppShellSlots | null>(null);

/**
 * The top bar's live slot elements (left/center/right), or null outside a
 * shell ancestor (standalone component harnesses). Surfaces portal their bar
 * tenants into these; a null return means "render your standalone fallback".
 */
export function useAppShellSlots(): AppShellSlots | null {
  return useContext(AppShellSlotsContext);
}

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
  // Separate live channel (see ShellNavigationHandlers.askPlannerOpen): kept
  // out of the registration effect's deps so drawer toggles never churn the
  // handler registration. Cleanup resets the flag so an unmounting surface
  // can't leave the rail item stuck active.
  const askPlannerOpen = Boolean(handlers.askPlannerOpen);
  useEffect(() => {
    if (!context) return;
    context.setAskPlannerActive(askPlannerOpen);
    return () => context.setAskPlannerActive(false);
  }, [context, askPlannerOpen]);
}

function activeFromPathname(pathname: string): AppRailActive {
  if (pathname.startsWith("/admin/management")) return "management";
  if (pathname.startsWith("/admin/settings")) return "settings";
  if (pathname.startsWith("/reception")) return "reception";
  return "map";
}

// Per-surface skip-link targets (each page renders the matching focusable
// marker). The top bar renders the link as its — and the document's — first
// focusable; the contract tests/accessibility-source.test.mjs pins.
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
  const [slots, setSlots] = useState<AppShellSlots>({ left: null, center: null, right: null });

  // Rail expansion state lives HERE because its toggle moved into the bar's
  // corner cell (owner call 2026-08-14) while the overlay it controls is the
  // rail — the two chrome pieces share it through props. The toggle ref lets
  // the rail hand keyboard focus back to the corner button on Escape/scrim
  // dismissal, same contract the in-rail hamburger had.
  const [railOpen, setRailOpen] = useState(false);
  const railToggleRef = useRef<HTMLButtonElement | null>(null);
  const focusRailToggle = useCallback(() => railToggleRef.current?.focus(), []);

  // Route committed: close the overlay so it can't linger over the incoming
  // page. Adjust-state-during-render on purpose (own state, legal) — React
  // re-renders immediately with the closed state, so the stale overlay never
  // paints. (This moved up from AppRail with the state.)
  const [lastPathname, setLastPathname] = useState(pathname);
  if (lastPathname !== pathname) {
    setLastPathname(pathname);
    setRailOpen(false);
  }

  // Stable register identity: the context value must not change per render,
  // or every consumer's registration effect would re-fire in a loop.
  const register = useCallback((next: ShellNavigationHandlers) => {
    setHandlers(next);
    return () => setHandlers(current => (current === next ? null : current));
  }, []);
  // Ask Planner drawer open-state, mirrored from the registered surface (the
  // hook's live channel) into the rail AI item's active treatment.
  const [askPlannerActive, setAskPlannerActive] = useState(false);
  const contextValue = useMemo(() => ({ register, setAskPlannerActive }), [register, setAskPlannerActive]);

  // Callback-ref sink for the bar's slot elements. The identity guard matters:
  // React re-runs callback refs with null-then-element around commits, and an
  // unconditional set would loop the render.
  const setSlotElement = useCallback((slot: AppTopBarSlot, element: HTMLElement | null) => {
    setSlots(current => (current[slot] === element ? current : { ...current, [slot]: element }));
  }, []);

  const active = activeFromPathname(pathname);

  return (
    <AppShellContext.Provider value={contextValue}>
      <AppShellSlotsContext.Provider value={slots}>
        {/* admin-theme + display:contents: the chrome tokens (--admin-*) are
            class-scoped in globals.css and pages own their content themes
            (reception is reception-theme), so the shell scopes ONLY its own
            chrome. `contents` keeps the wrapper out of layout — the bar stays
            sticky and the rail position:fixed against the viewport. Bar before
            rail in DOM: the bar tops the tab order, so its skip link is the
            document's first focusable. */}
        <div className="admin-theme contents">
          <AppTopBar
            active={active}
            email={email}
            roleLabel={isAdmin ? "Admin" : "Viewer"}
            skipLink={SKIP_LINKS[active]}
            onSlotElement={setSlotElement}
            railOpen={railOpen}
            onToggleRail={() => setRailOpen(current => !current)}
            railToggleRef={railToggleRef}
          />
          <AppRail
            active={active}
            railMode={isAdmin ? "admin" : "viewer"}
            onNavigate={handlers?.guard}
            onOpenAskPlanner={handlers?.openAskPlanner}
            askPlannerActive={askPlannerActive}
            open={railOpen}
            onOpenChange={setRailOpen}
            focusToggle={focusRailToggle}
            {...(skewDetector ? { skewDetector } : {})}
          />
        </div>
        {children}
      </AppShellSlotsContext.Provider>
    </AppShellContext.Provider>
  );
}
