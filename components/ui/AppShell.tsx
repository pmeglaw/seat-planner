"use client";

import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { getDraftStatusAction } from "@/app/actions";
import { DRAFT_STATUS_CHANGED_EVENT } from "@/lib/draftStatusEvent";
import { AppTopBar } from "@/components/ui/AppTopBar";
import { LeftPanel, type ShellFilterSpec } from "@/components/ui/LeftPanel";
import { ShellPanels, type ShellPanelId } from "@/components/ui/ShellPanels";
import { activeSectionFor, BELOW_NAV_QUERY, LEFT_PANEL_STORAGE_KEY, sectionLinksFor, skipLinkFor } from "@/components/ui/shellNavConfig";
import { useShellNavigation } from "@/components/ui/useShellNavigation";
import type { SkewDetector } from "@/lib/deploySkew";
import { keepMapParams } from "@/lib/mapUrlState";
import { modeStatusFor, type DraftStatus, type ShellRouteMode } from "@/lib/shellMode";
import type { ShellServerState } from "@/lib/shellState";

export type { ShellFilterGroup, ShellFilterItem, ShellFilterSpec } from "@/components/ui/LeftPanel";

// Persistent app shell for the (shell) route group — /, /admin,
// /admin/management, /admin/settings, /reception. Mounted ONCE by
// app/(shell)/layout.tsx and kept alive across client-side navigations: only
// the content pane below it swaps, which is what makes section clicks feel
// instant instead of unmounting the whole chrome into a route-level loading
// wash (the pre-shell behaviour, where every page mounted its own chrome).
//
// Phase 3 shell (redesign-v2 PR 2): AppTopBar (48px Gray 100 header),
// LeftPanel (256px filters, pushes), and ShellPanels (Help · History ·
// Account, 320px, float). Surface-owned behaviour reaches the shell by
// REGISTRATION only:
// - handlers (SeatMap's unsaved-edits veto, its Ask Planner opener, and its
//   live draft change count) through useAppShellNavigation below;
// - a surface's filter groups through useAppShellFilters (a live channel:
//   the panel re-renders as counts and checked state change);
// - the control row's "Filters · N" button opens the left panel through
//   useAppShellLeftPanel, and "Find me" reads the signed-in person's
//   published seat through useAppShellState.
// The provisional tenant row PR 2 carried under the header (the PR 2 / PR 3
// seam, PHASE4BUILD §1.8) is gone: the map's control row lives in the page
// (PR 3a, PHASE2UX §1M.3), so the shell's content pane starts 48px under
// the top of the viewport again.

type NavigationGuard = (href: string, label: string) => boolean;

export type ShellNavigationHandlers = {
  /** Veto-only unsaved-edits guard — return false to intercept a nav click. */
  guard?: NavigationGuard;
  /** Open Ask Planner in place (map surface only). Kept for PR 3's control
   *  row; the shell itself renders no AI entry in PR 2. */
  openAskPlanner?: () => void;
  /** Live open-state of the Ask Planner drawer (PR 3 consumer). */
  askPlannerOpen?: boolean;
  /** Live draft status from the map surface — overrides the fetched value
   *  so the indicator tracks every edit without a round-trip. */
  draftStatus?: DraftStatus;
};

type AppShellContextValue = {
  register: (handlers: ShellNavigationHandlers) => () => void;
  setAskPlannerActive: (active: boolean) => void;
  setLiveDraftStatus: (status: DraftStatus | null) => void;
  setFilters: (spec: ShellFilterSpec | null) => void;
};

const AppShellContext = createContext<AppShellContextValue | null>(null);

// Separate contexts from the handler registration on purpose: `isOpen`
// changes as the user toggles the panel, and a combined context value would
// re-fire every consumer's registration effect on each of those.
export type AppShellLeftPanel = { isOpen: boolean; open: () => void; close: () => void; toggle: () => void };
const AppShellLeftPanelContext = createContext<AppShellLeftPanel | null>(null);

/**
 * The left filter panel's open state and controls — the control row's
 * "Filters · N" button is the hamburger's second door (PHASE3DS §1.14).
 * Null outside a shell ancestor (standalone component harnesses).
 */
export function useAppShellLeftPanel(): AppShellLeftPanel | null {
  return useContext(AppShellLeftPanelContext);
}

export type AppShellState = { email: string; isAdmin: boolean; mySeat: ShellServerState["mySeat"] };
const AppShellStateContext = createContext<AppShellState | null>(null);

/**
 * Facts the (shell) layout resolved on the server — the signed-in email and
 * the person's PUBLISHED seat (DECISIONS D1-f: "Find me" reads the published
 * layer on every surface, the admin's included). Null outside a shell.
 */
export function useAppShellState(): AppShellState | null {
  return useContext(AppShellStateContext);
}

/**
 * Plug a surface's navigation handlers into the persistent shell. Safe to
 * call without a shell ancestor (standalone component tests): it no-ops. The
 * freshest closures are read through a ref, so the registration itself
 * happens once per mount and never re-fires as state referenced by the guard
 * changes. `askPlannerOpen` and `draftStatus` are LIVE channels with their
 * own effects (they must re-render the shell), kept out of the registration.
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
  const askPlannerOpen = Boolean(handlers.askPlannerOpen);
  useEffect(() => {
    if (!context) return;
    context.setAskPlannerActive(askPlannerOpen);
    return () => context.setAskPlannerActive(false);
  }, [context, askPlannerOpen]);
  const changeCount = handlers.draftStatus?.changeCount;
  const lastEditAt = handlers.draftStatus?.lastEditAt;
  const hasDraftStatus = handlers.draftStatus !== undefined;
  useEffect(() => {
    if (!context) return;
    if (!hasDraftStatus) return;
    context.setLiveDraftStatus({ changeCount: changeCount ?? 0, lastEditAt: lastEditAt ?? null });
    return () => context.setLiveDraftStatus(null);
  }, [context, hasDraftStatus, changeCount, lastEditAt]);
}

/**
 * Register the active surface's filter groups with the left panel. Pass the
 * spec on every render (it carries live counts and checked state); the
 * registration clears itself on unmount. No-op without a shell ancestor.
 */
export function useAppShellFilters(spec: ShellFilterSpec | null) {
  const context = useContext(AppShellContext);
  useEffect(() => {
    if (!context) return;
    context.setFilters(spec);
  }, [context, spec]);
  useEffect(() => {
    if (!context) return;
    return () => context.setFilters(null);
  }, [context]);
}

export type AppShellProps = {
  email: string;
  /** Keys per-user shell preferences (left panel open state). */
  userId?: string;
  isAdmin: boolean;
  /** Server facts for the mode indicator + Account panel (the layout reads
   *  them from the published layer only). */
  initialShell?: ShellServerState;
  /** Test seam only — forwarded to useShellNavigation. */
  skewDetector?: SkewDetector;
  children: ReactNode;
};

const EMPTY_SHELL: ShellServerState = { publishedAt: null, mySeat: null };

export function AppShell({ email, userId = "anonymous", isAdmin, initialShell = EMPTY_SHELL, skewDetector, children }: AppShellProps) {
  const pathname = usePathname();
  const [handlers, setHandlers] = useState<ShellNavigationHandlers | null>(null);
  const [askPlannerActive, setAskPlannerActive] = useState(false);
  void askPlannerActive;
  const [liveDraftStatus, setLiveDraftState] = useState<DraftStatus | null>(null);
  // Mirror of the live value readable from effects in the SAME commit: a
  // surface registers its draft status from a child effect, which runs
  // before this shell's fetch effect — the ref lets that effect see the
  // registration and skip the round-trip.
  const liveDraftRef = useRef<DraftStatus | null>(null);
  const setLiveDraftStatus = useCallback((status: DraftStatus | null) => {
    liveDraftRef.current = status;
    setLiveDraftState(status);
  }, []);
  const [filters, setFilters] = useState<ShellFilterSpec | null>(null);
  const [openPanel, setOpenPanel] = useState<ShellPanelId | null>(null);
  const [leftOpen, setLeftOpen] = useState(false);
  const [belowNav, setBelowNav] = useState(false);

  // Route committed: close both panels so nothing lingers over the incoming
  // page. Adjust-state-during-render on purpose (own state, legal) — React
  // re-renders immediately with the closed state, so the stale panel never
  // paints.
  const [lastPathname, setLastPathname] = useState(pathname);
  if (lastPathname !== pathname) {
    setLastPathname(pathname);
    setOpenPanel(null);
    setLeftOpen(false);
  }

  // Stable register identity: the context value must not change per render,
  // or every consumer's registration effect would re-fire in a loop.
  const register = useCallback((next: ShellNavigationHandlers) => {
    setHandlers(next);
    return () => setHandlers(current => (current === next ? null : current));
  }, []);
  const contextValue = useMemo(
    () => ({ register, setAskPlannerActive, setLiveDraftStatus, setFilters }),
    [register, setLiveDraftStatus]
  );

  // Header-nav breakpoint (the asset hides .cds-header-nav ≤ 1055px): the
  // section links move into the left panel and the indicator compacts.
  useEffect(() => {
    const query = window.matchMedia(BELOW_NAV_QUERY);
    const update = () => setBelowNav(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  // Left panel open state: a per-user display preference (PHASE2UX §1.3).
  // Read after hydration so SSR and the first client render agree.
  const storageKey = LEFT_PANEL_STORAGE_KEY(userId);
  const [leftPreferenceHydrated, setLeftPreferenceHydrated] = useState(false);
  useEffect(() => {
    try {
      setLeftOpen(window.localStorage.getItem(storageKey) === "true");
    } catch {
      // Storage unavailable — the panel still works for this page.
    }
    setLeftPreferenceHydrated(true);
  }, [storageKey]);
  useEffect(() => {
    if (!leftPreferenceHydrated) return;
    try {
      window.localStorage.setItem(storageKey, leftOpen ? "true" : "false");
    } catch {
      // Ignore unavailable storage; this is a display preference only.
    }
  }, [leftPreferenceHydrated, leftOpen, storageKey]);

  // Draft status for the indicator: SeatMap's live value wins; on admin
  // sub-pages (no map mounted) fetch it once per route. Viewers never fetch —
  // the draft layer is admin-only (owner ruling 2026-09-04, §1.9).
  const [fetchedDraft, setFetchedDraft] = useState<{ pathname: string; status: DraftStatus | "error"; publishedAt: string | null } | null>(null);
  const draftRoute = isAdmin && (pathname === "/admin" || pathname.startsWith("/admin/"));
  const needsFetch = draftRoute && liveDraftStatus === null && fetchedDraft?.pathname !== pathname;
  const [retryToken, setRetryToken] = useState(0);
  useEffect(() => {
    if (!needsFetch || liveDraftRef.current !== null) return;
    let cancelled = false;
    getDraftStatusAction()
      .then(result => {
        if (cancelled) return;
        setFetchedDraft({ pathname, status: { changeCount: result.changeCount, lastEditAt: result.lastEditAt }, publishedAt: result.publishedAt });
      })
      .catch(() => {
        if (!cancelled) setFetchedDraft({ pathname, status: "error", publishedAt: null });
      });
    return () => {
      cancelled = true;
    };
  }, [needsFetch, pathname, retryToken]);
  const retryStatus = useCallback(() => {
    setFetchedDraft(null);
    setRetryToken(token => token + 1);
  }, []);
  // A surface that changed the draft without navigating (a people edit on
  // Management, a restore on Settings) announces it; the cached per-route
  // fetch is dropped and the indicator refetches (PR 4 smoke, step 9).
  useEffect(() => {
    window.addEventListener(DRAFT_STATUS_CHANGED_EVENT, retryStatus);
    return () => window.removeEventListener(DRAFT_STATUS_CHANGED_EVENT, retryStatus);
  }, [retryStatus]);

  const draft: DraftStatus | null | "error" = liveDraftStatus ?? (fetchedDraft?.pathname === pathname ? fetchedDraft.status : null);
  const publishedAt = (fetchedDraft?.pathname === pathname && fetchedDraft.publishedAt) || initialShell.publishedAt;
  const modeStatus = modeStatusFor({ pathname, isAdmin, publishedAt, draft });

  // Navigation contracts (veto / skew / watchdog) shared by the header
  // links, the left panel's links, the name link and the History switch.
  const guard = useMemo<NavigationGuard | undefined>(() => (handlers?.guard ? (href, label) => handlers.guard?.(href, label) ?? true : undefined), [handlers]);
  const { onLinkClick, navigate } = useShellNavigation({ guard, ...(skewDetector ? { skewDetector } : {}) });

  const active = activeSectionFor(pathname);
  const links = useMemo(() => sectionLinksFor(isAdmin), [isAdmin]);
  const skipLink = skipLinkFor(pathname);
  const hasLeftContent = filters !== null || belowNav;
  const leftPanelOpen = leftOpen && hasLeftContent;

  const focusTrigger = useCallback((selector: string) => {
    document.querySelector<HTMLElement>(`#shell-header ${selector}`)?.focus();
  }, []);
  const closePanel = useCallback(() => {
    setOpenPanel(current => {
      if (current) focusTrigger(`[aria-controls="shell-panel-${current}"]`);
      return null;
    });
  }, [focusTrigger]);
  const togglePanel = useCallback((panel: ShellPanelId) => {
    setOpenPanel(current => (current === panel ? null : panel));
  }, []);
  const closeLeft = useCallback(() => {
    setLeftOpen(false);
    focusTrigger('[aria-controls="shell-left-panel"]');
  }, [focusTrigger]);

  // History switch: the other mode's map, keeping the whole B3 URL set
  // (?floor= ?seat= ?q= ?names= and the four filters — lib/mapUrlState) and
  // running the same veto as a link click (PHASE2UX §1.4 row 1).
  const switchMode = useCallback(
    (target: ShellRouteMode) => {
      const href = `${target === "draft" ? "/admin" : "/"}${keepMapParams(window.location.search)}`;
      setOpenPanel(null);
      navigate(href, target === "draft" ? "the draft map" : "the published map");
    },
    [navigate]
  );

  const leftPanelApi = useMemo<AppShellLeftPanel>(
    () => ({
      isOpen: leftPanelOpen,
      open: () => setLeftOpen(true),
      close: closeLeft,
      toggle: () => setLeftOpen(current => !current)
    }),
    [closeLeft, leftPanelOpen]
  );
  const shellState = useMemo<AppShellState>(() => ({ email, isAdmin, mySeat: initialShell.mySeat }), [email, isAdmin, initialShell.mySeat]);

  return (
    <AppShellContext.Provider value={contextValue}>
      <AppShellLeftPanelContext.Provider value={leftPanelApi}>
      <AppShellStateContext.Provider value={shellState}>
        <AppTopBar
          isAdmin={isAdmin}
          pathname={pathname}
          active={active}
          links={links}
          skipLink={skipLink}
          onLinkClick={onLinkClick}
          hasLeftContent={hasLeftContent}
          leftOpen={leftPanelOpen}
          onToggleLeft={() => setLeftOpen(current => !current)}
          modeStatus={modeStatus}
          compact={belowNav}
          openPanel={openPanel}
          onTogglePanel={togglePanel}
        />
        <LeftPanel
          open={leftPanelOpen}
          onClose={closeLeft}
          belowNav={belowNav}
          links={links.map(link => ({ ...link, current: link.id === active }))}
          onLinkClick={onLinkClick}
          filters={filters}
          isAdmin={isAdmin}
        />
        <ShellPanels
          open={openPanel}
          onClose={closePanel}
          email={email}
          roleLabel={isAdmin ? "Admin" : "Viewer"}
          isAdmin={isAdmin}
          pathname={pathname}
          modeStatus={modeStatus}
          mySeat={initialShell.mySeat}
          onSwitchMode={switchMode}
          onRetryStatus={retryStatus}
        />
        {/* Content pane: the header is position:fixed (asset), so the pane
            carries the top offset; the open left panel pushes it by its width
            (composition — the landed .sp-left-panel-host floats). Fixed
            height at lg so pages keep their internal scroll regions
            (shell-viewport-height contract). */}
        <div
          data-shell-content
          className={[
            "flex min-h-[100svh] flex-col pt-[var(--sp-shell-header-h)] lg:h-[100svh] lg:overflow-hidden",
            leftPanelOpen ? "pl-[var(--sp-panel-left-w)]" : "",
            "motion-safe:transition-[padding] motion-safe:duration-[var(--sp-duration-fast-02)]"
          ].join(" ")}
        >
          <div className="flex min-h-0 flex-1 flex-col">{children}</div>
        </div>
      </AppShellStateContext.Provider>
      </AppShellLeftPanelContext.Provider>
    </AppShellContext.Provider>
  );
}
