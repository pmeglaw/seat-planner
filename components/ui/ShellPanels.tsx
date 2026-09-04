"use client";

import type { FormEvent, KeyboardEvent as ReactKeyboardEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { getPublishHistoryAction } from "@/app/actions";
import { formatPublishChangeSummary, type PublishHistoryEvent } from "@/lib/publishHistory";
import { formatPublishDate, historyStatusLine, routeModeFor, type ShellModeStatus, type ShellRouteMode } from "@/lib/shellMode";
import type { ShellServerState } from "@/lib/shellState";
import { THEME_DARK, THEME_LIGHT, applyTheme, type ThemeChoice } from "@/lib/theme";

// The three dark right panels of the Phase 3 shell — Help · History · Account
// (PHASE2UX §1.4 / §1.6, PHASE3DS §1.9–§1.11, specimen 01-shell.html#panels).
// One host, one panel open at a time, 320px, floats over the content (never
// pushes), no focus trap: focus moves to the heading on open and the caller
// (AppShell) returns it to the trigger on close. Every ghost, tag, empty
// state, notification and skeleton inside is the same markup as on a light
// surface, restyled by the `.sp-panel` zone scope in sp-components.css —
// this file adds no colour and no geometry.
//
// The host carries `data-open` ONLY while a panel is open: the landed CSS
// keys the slide-in on attribute presence (`.sp-panel-host[data-open]`), so
// a `data-open="false"` would read as open. The attribute lands one frame
// after the panel mounts so the moderate-02 entrance transition actually
// runs (both in one commit = no transition).

export type ShellPanelId = "help" | "history" | "account";

export type ShellPanelsProps = {
  open: ShellPanelId | null;
  onClose: () => void;
  email: string;
  roleLabel: "Admin" | "Viewer";
  isAdmin: boolean;
  pathname: string;
  modeStatus: ShellModeStatus;
  mySeat: ShellServerState["mySeat"];
  /** History switch: navigate to the other mode (AppShell runs the veto). */
  onSwitchMode: (target: ShellRouteMode) => void;
  /** Mode indicator in its error state: refetch the draft status. */
  onRetryStatus: () => void;
};

const HISTORY_PAGE = 10;
const HISTORY_CAP = 25;

export function ShellPanels({ open, onClose, email, roleLabel, isAdmin, pathname, modeStatus, mySeat, onSwitchMode, onRetryStatus }: ShellPanelsProps) {
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);

  // Entrance: attribute one frame after mount so the transform transitions.
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!open) {
      setShown(false);
      return;
    }
    const frame = window.requestAnimationFrame(() => setShown(true));
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  // Focus moves to the heading on open (PHASE2UX §1.7 row 3).
  useEffect(() => {
    if (open) headingRef.current?.focus();
  }, [open]);

  // Outside pointer-down closes (no focus trap, no scrim). The header is
  // excluded: its triggers toggle the panels themselves, and a close here
  // would race the trigger's own click into an immediate reopen.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (hostRef.current?.contains(target)) return;
      if ((target as Element).closest?.("#shell-header")) return;
      onClose();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, onClose]);

  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLElement>) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    },
    [onClose]
  );

  const titles: Record<ShellPanelId, string> = { help: "Help", history: "History", account: "Account" };

  return (
    <div id="shell-panels" ref={hostRef} className="sp-panel-host" data-open={shown ? "true" : undefined}>
      {open ? (
        <aside id={`shell-panel-${open}`} className="sp-panel" aria-labelledby={`shell-panel-${open}-title`} onKeyDown={onKeyDown}>
          <h2 id={`shell-panel-${open}-title`} ref={headingRef} tabIndex={-1}>
            {titles[open]}
          </h2>
          {open === "help" ? <HelpBody /> : null}
          {open === "history" ? (
            <HistoryBody isAdmin={isAdmin} pathname={pathname} modeStatus={modeStatus} onSwitchMode={onSwitchMode} onRetryStatus={onRetryStatus} />
          ) : null}
          {open === "account" ? <AccountBody email={email} roleLabel={roleLabel} mySeat={mySeat} /> : null}
        </aside>
      ) : null}
    </div>
  );
}

// --- Help --------------------------------------------------------------------

/** "⌘" on Apple platforms, "Ctrl" elsewhere. Exported so PR 3's control-row
 *  shortcut hint (P3-4) reuses the one detection. */
export function modifierKeyLabel(platform: string | undefined): "⌘" | "Ctrl" {
  return /mac|iphone|ipad|ipod/i.test(platform ?? "") ? "⌘" : "Ctrl";
}

function HelpBody() {
  // Server renders "Ctrl"; the effect swaps to "⌘" after hydration on Apple
  // hardware (navigator is client-only).
  const [modifier, setModifier] = useState<"⌘" | "Ctrl">("Ctrl");
  useEffect(() => {
    setModifier(modifierKeyLabel(window.navigator.platform));
  }, []);
  return (
    <div className="sp-panel-body">
      <h3>Keyboard shortcuts</h3>
      <dl className="sp-panel-dl">
        <dt>{modifier} K</dt>
        <dd>Find a person or seat</dd>
        <dt>Esc</dt>
        <dd>Close a panel / clear the selection</dd>
        <dt>↑ ↓</dt>
        <dd>Move through results</dd>
        <dt>Enter</dt>
        <dd>Open the result</dd>
        <dt>Home / End</dt>
        <dd>First / last result</dd>
        <dt>← ↑ → ↓</dt>
        <dd>Move between seats on the plan</dd>
      </dl>
      <h3>Draft and Published</h3>
      <p>Everyone sees the published map. Admins edit a draft that only they can see. Publish replaces what everyone sees with the draft.</p>
      <h3>Who to ask</h3>
      <p>Your office administrators publish the map; ask them for changes.</p>
    </div>
  );
}

// --- History -----------------------------------------------------------------

type HistoryLoad = { state: "loading" } | { state: "error" } | { state: "ready"; events: PublishHistoryEvent[]; limit: number };

function HistoryBody({
  isAdmin,
  pathname,
  modeStatus,
  onSwitchMode,
  onRetryStatus
}: Pick<ShellPanelsProps, "isAdmin" | "pathname" | "modeStatus" | "onSwitchMode" | "onRetryStatus">) {
  if (!isAdmin) return <ViewerHistoryBody modeStatus={modeStatus} />;
  return <AdminHistoryBody pathname={pathname} modeStatus={modeStatus} onSwitchMode={onSwitchMode} onRetryStatus={onRetryStatus} />;
}

function ViewerHistoryBody({ modeStatus }: { modeStatus: ShellModeStatus }) {
  const published = modeStatus.kind === "published" ? modeStatus.publishedAt : modeStatus.kind === "draft" ? modeStatus.publishedAt : null;
  return (
    <div className="sp-panel-body">
      {published ? (
        <>
          <div className="sp-panel-fact">Published · {formatPublishDate(published, { withTime: true })}</div>
          <div className="sp-panel-caption">Publish history is available to admins.</div>
        </>
      ) : (
        <>
          <div className="sp-panel-fact">Nothing has been published yet</div>
          <div className="sp-panel-caption">Ask an admin.</div>
        </>
      )}
    </div>
  );
}

function AdminHistoryBody({
  pathname,
  modeStatus,
  onSwitchMode,
  onRetryStatus
}: Pick<ShellPanelsProps, "pathname" | "modeStatus" | "onSwitchMode" | "onRetryStatus">) {
  const current = routeModeFor(pathname);
  const [load, setLoad] = useState<HistoryLoad>({ state: "loading" });
  const [now] = useState(() => new Date());

  const fetchEvents = useCallback(async (limit: number) => {
    setLoad({ state: "loading" });
    try {
      const events = await getPublishHistoryAction(limit);
      setLoad({ state: "ready", events, limit });
    } catch {
      setLoad({ state: "error" });
    }
  }, []);

  // Never published: nothing to fetch — the empty state IS the history.
  const unpublished = modeStatus.kind === "unpublished";
  useEffect(() => {
    if (unpublished) return;
    void fetchEvents(HISTORY_PAGE);
  }, [fetchEvents, unpublished]);

  const statusLine = historyStatusLine(modeStatus, now);

  return (
    <div className="sp-panel-body" aria-busy={load.state === "loading" && !unpublished ? true : undefined}>
      <div className="sp-switch" role="group" aria-label="Mode">
        <button type="button" aria-pressed={current === "published"} onClick={() => current !== "published" && onSwitchMode("published")}>
          Published
        </button>
        <button type="button" aria-pressed={current === "draft"} onClick={() => current !== "draft" && onSwitchMode("draft")}>
          Draft
        </button>
      </div>
      {modeStatus.kind === "loading" ? (
        <div className="sp-panel-status" aria-busy="true">
          <span className="sp-skeleton sp-skeleton--w2" />
        </div>
      ) : (
        <div className="sp-panel-status" role="status">
          {statusLine}
          {modeStatus.kind === "error" ? (
            <button type="button" className="cds-btn cds-btn--ghost cds-btn--sm" onClick={onRetryStatus}>
              Retry
            </button>
          ) : null}
        </div>
      )}
      <h3>Publish history</h3>
      {unpublished ? (
        <div className="cds-empty">
          <h3>Publish the draft to start the history</h3>
          <p>Your first publish appears here.</p>
        </div>
      ) : load.state === "loading" ? (
        <>
          <SkeletonEvent widths={["sp-skeleton--w3", "sp-skeleton--w2", ""]} />
          <SkeletonEvent widths={["", "sp-skeleton--w2", ""]} />
          <SkeletonEvent widths={["sp-skeleton--w3", "sp-skeleton--w2", ""]} />
        </>
      ) : load.state === "error" ? (
        <div className="cds-notification cds-notification--error" role="alert">
          <ErrorGlyph />
          <div className="cds-notification-text">
            <strong>Publish history couldn&apos;t load</strong>
            <p>The switch above still works.</p>
          </div>
          <button type="button" className="cds-btn cds-btn--ghost" onClick={() => void fetchEvents(HISTORY_PAGE)}>
            Retry
          </button>
        </div>
      ) : load.events.length === 0 ? (
        <div className="cds-empty">
          <h3>Publish the draft to start the history</h3>
          <p>Your first publish appears here.</p>
        </div>
      ) : (
        <>
          <ul className="sp-event-list">
            {load.events.map(event => (
              <li key={event.created_at} className="sp-event">
                <div className="sp-event-what">{formatPublishChangeSummary(event.change_summary) ?? `Initial publish · ${event.seat_count} seats`}</div>
                <div className="sp-event-when">{formatPublishDate(event.created_at, { withTime: true })}</div>
                <div className="sp-event-who">{event.published_by_email ?? "an admin"}</div>
              </li>
            ))}
          </ul>
          {load.limit >= HISTORY_CAP ? (
            <div className="sp-panel-caption">Showing the {HISTORY_CAP} most recent publishes.</div>
          ) : load.events.length >= load.limit ? (
            <button type="button" className="cds-btn cds-btn--ghost cds-btn--md" onClick={() => void fetchEvents(HISTORY_CAP)}>
              Show more
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}

function SkeletonEvent({ widths }: { widths: [string, string, string] }) {
  return (
    <div className="sp-skeleton-event">
      {widths.map((width, index) => (
        <span key={index} className={`sp-skeleton ${width}`.trim()} />
      ))}
    </div>
  );
}

function ErrorGlyph() {
  // Specimen `#i-error`: filled circle, cut cross in the panel layer colour.
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r="9" fill="currentColor" />
      <path d="M6.5 6.5l7 7M13.5 6.5l-7 7" fill="none" stroke="var(--sp-panel-dark-layer)" strokeWidth="1.5" />
    </svg>
  );
}

// --- Account -----------------------------------------------------------------

const SYSTEM_THEME = "system";
type ThemeRadioValue = typeof THEME_DARK | typeof THEME_LIGHT | typeof SYSTEM_THEME;

function AccountBody({ email, roleLabel, mySeat }: Pick<ShellPanelsProps, "email" | "roleLabel" | "mySeat">) {
  // Server renders System; the effect reads the real attribute after
  // hydration (the boot script may have applied a stored choice already).
  // The radio only ever READS the attribute — applyTheme owns both attributes
  // and the stored value (lib/theme.ts, tests/theme.test.mjs).
  const [theme, setTheme] = useState<ThemeRadioValue>(SYSTEM_THEME);
  useEffect(() => {
    const stored = document.documentElement.dataset.theme;
    setTheme(stored === THEME_DARK || stored === THEME_LIGHT ? stored : SYSTEM_THEME);
  }, []);
  const [signingOut, setSigningOut] = useState(false);

  function chooseTheme(next: ThemeRadioValue) {
    setTheme(next);
    const choice: ThemeChoice = next === SYSTEM_THEME ? null : next;
    applyTheme(choice);
  }

  function onSignOut(_event: FormEvent<HTMLFormElement>) {
    // Native POST — the browser leaves the page; the busy state only covers
    // the round-trip. A failed sign-out returns to the same page signed in,
    // which the next render shows plainly (no client-side failure channel
    // exists for a native form post; recorded in PHASE4BUILD §1).
    setSigningOut(true);
  }

  const options: Array<{ value: ThemeRadioValue; label: string }> = [
    { value: THEME_LIGHT, label: "Light" },
    { value: THEME_DARK, label: "Dark" },
    { value: SYSTEM_THEME, label: "System" }
  ];

  return (
    <div className="sp-panel-body">
      <div className="sp-panel-email">
        {email} <span className="cds-tag">{roleLabel}</span>
      </div>
      <fieldset className="sp-radio-group">
        <legend>Theme</legend>
        {options.map(option => (
          <label key={option.value} className="sp-radio">
            <input type="radio" name="theme" value={option.value} checked={theme === option.value} onChange={() => chooseTheme(option.value)} />
            {/* `span` is load-bearing: the zone rule names span.sp-radio-mark (PHASE3DS §7 item 5). */}
            <span className="sp-radio-mark" />
            {option.label}
          </label>
        ))}
      </fieldset>
      <div className="sp-panel-divider" />
      {mySeat ? (
        <a className="sp-panel-row" href="/my-seat">
          My seat — {mySeat.label}
          {mySeat.floor ? ` · Floor ${mySeat.floor}` : ""}
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M3 8h10M9 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </a>
      ) : (
        <p className="sp-panel-row sp-panel-row--static">No seat published for you yet</p>
      )}
      <div className="sp-panel-divider" />
      <form action="/auth/signout" method="post" onSubmit={onSignOut}>
        <button type="submit" className="cds-btn cds-btn--ghost cds-btn--md" aria-busy={signingOut || undefined}>
          {signingOut ? "Signing out…" : "Sign out"}
        </button>
      </form>
    </div>
  );
}
