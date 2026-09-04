"use client";

import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { getDraftStatusAction } from "@/app/actions";
import { AppTopBar, type ShellSlot } from "@/components/ui/AppTopBar";
import { LeftPanel, type ShellFilterSpec } from "@/components/ui/LeftPanel";
import { ShellPanels, type ShellPanelId } from "@/components/ui/ShellPanels";
import { activeSectionFor, BELOW_NAV_QUERY, LEFT_PANEL_STORAGE_KEY, sectionLinksFor, skipLinkFor } from "@/components/ui/shellNavConfig";
import { useShellNavigation } from "@/components/ui/useShellNavigation";
import type { SkewDetector } from "@/lib/deploySkew";
import { modeStatusFor, type DraftStatus, type ShellRouteMode } from "@/lib/shellMode";
import type { ShellServerState } from "@/lib/shellState";

export type { ShellSlot, AppTopBarSlot } from "@/components/ui/AppTopBar";
export type { ShellFilterGroup, ShellFilterItem, ShellFilterSpec } from "@/components/ui/LeftPanel";

// Persistent app shell for the (shell) route group — /, /admin,
// /admin/management, /admin/settings, /reception. Mounted ONCE by
// app/(shell)/layout.tsx and kept alive across client-side navigations: only
// the content pane below it swaps, which is what makes section clicks feel
// instant instead of unmounting the whole chrome into a route-level loading
// wash (the pre-shell behaviour, where every page mounted its own chrome).
//
// Phase 3 shell (redesign-v2 PR 2): AppTopBar (48px Gray 100 header), a
// provisional tenant row (below), LeftPanel (256px filters, pushes), and
// ShellPanels (Help · History · Account, 320px, float). Surface-owned
// behaviour reaches the shell by REGISTRATION only:
// - handlers (SeatMap's unsaved-edits veto, its Ask Planner opener, and its
//   live draft change count) through useAppShellNavigation below;
// - the viewer's filter groups through useAppShellFilters (a live channel:
//   the panel re-renders as counts and checked state change);
// - live bar content (undo/redo, floor, publish, the viewer search) through
//   the slots context — portals into the tenant row's slot elements, because
//   that content re-renders with rapidly changing surface state.

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

export type AppShellSlots = Record<ShellSlot, HTMLElement | null>;

// Separate context from the handler registration on purpose: slot elements
// change on surface transitions, and a combined context value would re-fire
// every consumer's registration effect on each of those.
const AppShellSlotsContext = createContext<AppShellSlots | null>(null);

/**
 * The tenant row's live slot elements (left/center/right), or null outside a
 * shell ancestor (standalone component harnesses). Surfaces portal their
 * tenants into these; a null return means "render your standalone fallback".
 */
export function useAppShellSlots(): AppShellSlots | null {
  return useContext(AppShellSlotsContext);
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
  const [slots, setSlots] = useState<AppShellSlots>({ left: null, center: null, right: null });
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

  // Callback-ref sink for the tenant row's slot elements. The identity guard
  // matters: React re-runs callback refs with null-then-element around
  // commits, and an unconditional set would loop the render.
  const setSlotElement = useCallback((slot: ShellSlot, element: HTMLElement | null) => {
    setSlots(current => (current[slot] === element ? current : { ...current, [slot]: element }));
  }, []);
  const setLeftSlot = useCallback((element: HTMLElement | null) => setSlotElement("left", element), [setSlotElement]);
  const setCenterSlot = useCallback((element: HTMLElement | null) => setSlotElement("center", element), [setSlotElement]);
  const setRightSlot = useCallback((element: HTMLElement | null) => setSlotElement("right", element), [setSlotElement]);

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

  // History switch: the other mode's map, keeping the view (?floor= / ?seat=)
  // and running the same veto as a link click (PHASE2UX §1.4 row 1).
  const switchMode = useCallback(
    (target: ShellRouteMode) => {
      const params = new URLSearchParams(window.location.search);
      const kept = new URLSearchParams();
      for (const key of ["floor", "seat"]) {
        const value = params.get(key);
        if (value) kept.set(key, value);
      }
      const query = kept.toString();
      const href = `${target === "draft" ? "/admin" : "/"}${query ? `?${query}` : ""}`;
      setOpenPanel(null);
      navigate(href, target === "draft" ? "the draft map" : "the published map");
    },
    [navigate]
  );

  const allSlotsEmpty = useSlotsEmpty(slots);

  return (
    <AppShellContext.Provider value={contextValue}>
      <AppShellSlotsContext.Provider value={slots}>
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
          {/* PHASE 4 BRIDGE — provisional tenant row, removed by PR 3 (the
              map control row, PHASE2UX §1M.3; named in PHASE4BUILD §3 PR 3
              row). SeatMap's bar tenants (undo/redo · floor · Ask Planner ·
              Publish) and the viewer search portal in here until then. All
              three slot elements stay MOUNTED for the shell's lifetime —
              a route change that deleted a slot in the same commit that
              unmounts the surface raced React's portal cleanup
              (removeChild NotFoundError) — so `hidden` toggles visibility
              while the containers live on. */}
          <div
            data-shell-tenants
            hidden={allSlotsEmpty}
            className="flex h-12 shrink-0 items-center gap-2 border-b border-[var(--sp-border-subtle)] bg-[var(--sp-layer-01)] px-2 text-[var(--sp-text-primary)]"
          >
            <div data-topbar-slot="left" ref={setLeftSlot} className="flex h-full min-w-0 flex-1 items-center gap-2" />
            <div data-topbar-slot="center" ref={setCenterSlot} className="flex h-full min-w-0 items-center gap-2" />
            <div data-topbar-slot="right" ref={setRightSlot} className="flex h-full shrink-0 items-center gap-2" />
          </div>
          <div className="flex min-h-0 flex-1 flex-col">{children}</div>
        </div>
      </AppShellSlotsContext.Provider>
    </AppShellContext.Provider>
  );
}

// The tenant row hides itself while every slot is empty (sub-pages, and the
// viewer until it portals its search in). A MutationObserver rather than
// registered occupancy flags: the tenants arrive through portals the shell
// never sees.
function useSlotsEmpty(slots: AppShellSlots): boolean {
  const [empty, setEmpty] = useState(true);
  useEffect(() => {
    const elements = [slots.left, slots.center, slots.right].filter((element): element is HTMLElement => Boolean(element));
    if (elements.length === 0) return;
    const check = () => setEmpty(elements.every(element => element.childNodes.length === 0));
    check();
    const observer = new window.MutationObserver(check);
    for (const element of elements) observer.observe(element, { childList: true });
    return () => observer.disconnect();
  }, [slots]);
  return empty;
}
