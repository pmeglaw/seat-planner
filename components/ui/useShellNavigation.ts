"use client";

import { usePathname, useRouter } from "next/navigation";
import type { MouseEvent as ReactMouseEvent } from "react";
import { useCallback, useEffect, useRef } from "react";
import { deploySkewMonitor, type SkewDetector } from "@/lib/deploySkew";
import { assignLocation } from "@/lib/fullNavigation";

// The persistent shell's navigation contracts, lifted verbatim from the
// retired AppRail (redesign-v2 PR 2) so the header's section links and the
// History panel's mode switch share ONE implementation of:
//
// 1. The unsaved-edits veto — a registered surface guard (SeatMap) returns
//    false and the click goes nowhere. Modified clicks (new tab / window)
//    bypass the guard entirely: the current page, and any unsaved edits,
//    stay put.
// 2. The deploy-skew fallback (lib/deploySkew.ts): merging to main flips the
//    prod alias under open tabs, after which soft navigations fetch RSC from
//    the NEW build and the router dead-ends into its own delayed full-reload
//    fallback. A skewed tab takes the full document load (assignLocation,
//    sanctioned caller #2 in lib/fullNavigation.ts) on the first click
//    instead. Probes run on mount, on every route commit, on tab focus /
//    visibility (deploys land while tabs are backgrounded) and on a slow
//    interval; the detector throttles itself to one fetch per minute.
// 3. The stalled-navigation watchdog (#316, sanctioned caller #3): prod
//    probes caught the App Router client stalling — RSC arrived, URL frozen,
//    second click deduped onto the stuck transition. If the pathname has not
//    moved 4s after an allowed click, restart it as a full document load.
//    The shell persists across navigations, so unmount cleanup cannot be
//    the disarm: the pathname effect clears the timer the moment ANY route
//    commits (the router is provably alive, including back/forward, which a
//    stale timer must never hijack).
//
// tests/app-top-bar.test.mjs pins all three through the header; the History
// switch's `navigate` path is pinned in tests/app-shell.test.mjs.

export type NavigationGuard = (href: string, label: string) => boolean;

export type ShellNavigationOptions = {
  /** Veto-only guard; read fresh on every click through a ref. */
  guard?: NavigationGuard;
  /** Test seam only — defaults to the sticky module singleton. */
  skewDetector?: SkewDetector;
};

export type ShellNavigation = {
  /** onClick for a <Link>: runs the contracts and, when the navigation is
   *  allowed and soft, lets Link's own handler push — arming the watchdog. */
  onLinkClick: (event: ReactMouseEvent<HTMLAnchorElement>, href: string, label: string) => void;
  /** Programmatic navigation (the History panel's mode switch): same veto /
   *  skew / watchdog contracts, then router.push. Returns false when vetoed. */
  navigate: (href: string, label: string) => boolean;
};

const WATCHDOG_MS = 4000;

export function useShellNavigation({ guard, skewDetector = deploySkewMonitor }: ShellNavigationOptions): ShellNavigation {
  const router = useRouter();
  const pathname = usePathname();
  const guardRef = useRef(guard);
  useEffect(() => {
    guardRef.current = guard;
  });

  const watchdogRef = useRef<number | null>(null);
  const disarm = useCallback(() => {
    if (watchdogRef.current !== null) {
      window.clearTimeout(watchdogRef.current);
      watchdogRef.current = null;
    }
  }, []);
  // Unmount cleanup covers document-load / test teardown; route commits are
  // handled by the pathname effect below.
  useEffect(() => disarm, [disarm]);

  // Route committed: disarm the watchdog and re-probe skew (throttled inside
  // the detector, so this keeps the "probe on page mount" cadence for free).
  useEffect(() => {
    disarm();
    void skewDetector.check();
  }, [pathname, skewDetector, disarm]);

  useEffect(() => {
    const check = () => {
      void skewDetector.check();
    };
    check();
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    const interval = window.setInterval(check, 5 * 60_000);
    return () => {
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
      window.clearInterval(interval);
    };
  }, [skewDetector]);

  const arm = useCallback(
    (href: string) => {
      // Pathname-only on purpose: pages shallow-rewrite the query after commit
      // (SeatMap strips ?ask-planner=open and re-mirrors ?seat= via
      // replaceState), so comparing search would read a legitimate post-commit
      // rewrite as "stalled" and fire a state-destroying reload. Every shell
      // navigation is cross-path, where pathname alone detects commit.
      const targetPath = href.split("?")[0];
      disarm();
      watchdogRef.current = window.setTimeout(() => {
        if (window.location.pathname !== targetPath) assignLocation(href);
      }, WATCHDOG_MS);
    },
    [disarm]
  );

  const onLinkClick = useCallback(
    (event: ReactMouseEvent<HTMLAnchorElement>, href: string, label: string) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
      if (guardRef.current && !guardRef.current(href, label)) {
        event.preventDefault();
        return;
      }
      // Runs after the veto — unsaved edits still win over a skewed tab.
      if (skewDetector.isSkewed()) {
        event.preventDefault();
        assignLocation(href);
        return;
      }
      arm(href);
    },
    [arm, skewDetector]
  );

  const navigate = useCallback(
    (href: string, label: string) => {
      if (guardRef.current && !guardRef.current(href, label)) return false;
      if (skewDetector.isSkewed()) {
        assignLocation(href);
        return true;
      }
      arm(href);
      router.push(href);
      return true;
    },
    [arm, router, skewDetector]
  );

  return { onLinkClick, navigate };
}
