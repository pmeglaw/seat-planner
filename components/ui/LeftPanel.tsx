"use client";

import Link from "next/link";
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from "react";
import { useCallback, useEffect, useState } from "react";

// The 256px left panel of the Phase 3 shell (PHASE2UX §1.3, PHASE3DS §1.12,
// specimen 01-shell.html#left): the map surface's filter groups, and — below
// the header-nav breakpoint — the section links above them. Slides in under
// the header and PUSHES the content (AppShell pads the content pane); no
// focus trap; Esc closes. The panel renders whatever the active surface
// registers through useAppShellFilters (AppShell.tsx) — it owns no filter
// state of its own, so the applied filters stay URL state per PHASE1IA B3
// while open/closed is a per-user display preference (localStorage).
//
// The host carries `data-open` only while open: the landed CSS keys the
// slide on attribute presence (`.sp-left-panel-host[data-open]`).

export type ShellFilterItem = { id: string; label: string; count: number; checked: boolean };

export type ShellFilterGroup = {
  id: string;
  label: string;
  items: ShellFilterItem[];
  state: "ready" | "loading" | "error";
  /** Hidden tier (never disabled): the facet does not apply on this floor. */
  hidden?: boolean;
};

export type ShellFilterSpec = {
  groups: ShellFilterGroup[];
  appliedCount: number;
  /** Helper line under the groups (e.g. why zone/status are hidden). */
  note?: string;
  onToggle: (groupId: string, itemId: string) => void;
  onClearGroup: (groupId: string) => void;
  onClearAll: () => void;
  onRetryGroup?: (groupId: string) => void;
};

export type ShellSectionLink = { id: string; label: string; href: string; current: boolean };

export type LeftPanelProps = {
  open: boolean;
  onClose: () => void;
  /** The header nav is hidden (≤ 1055px): render the section links here. */
  belowNav: boolean;
  links: ShellSectionLink[];
  onLinkClick: (event: ReactMouseEvent<HTMLAnchorElement>, href: string, label: string) => void;
  filters: ShellFilterSpec | null;
  isAdmin: boolean;
};

export function LeftPanel({ open, onClose, belowNav, links, onLinkClick, filters, isAdmin }: LeftPanelProps) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!open) {
      setShown(false);
      return;
    }
    const frame = window.requestAnimationFrame(() => setShown(true));
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLElement>) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    },
    [onClose]
  );

  const hasContent = filters !== null || belowNav;
  const title = filters ? "Filters" : "Sections";
  const groups = filters?.groups.filter(group => !group.hidden) ?? [];
  const empty = filters !== null && groups.length > 0 && groups.every(group => group.state === "ready" && group.items.length === 0);

  return (
    <div id="shell-left-panel" className="sp-left-panel-host" data-open={shown ? "true" : undefined}>
      {open && hasContent ? (
        <aside className="sp-left-panel" aria-labelledby="shell-left-panel-title" onKeyDown={onKeyDown}>
          <div className="sp-left-panel-header">
            <h2 id="shell-left-panel-title">{title}</h2>
            {filters && filters.appliedCount > 0 ? (
              <button type="button" className="cds-btn cds-btn--ghost cds-btn--sm" onClick={filters.onClearAll}>
                Clear all
              </button>
            ) : null}
          </div>
          <div className="sp-left-panel-body">
            {belowNav ? (
              <>
                <nav aria-label="Sections">
                  <ul className="sp-left-nav">
                    {links.map(link => (
                      <li key={link.id}>
                        <Link
                          href={link.href}
                          prefetch={false}
                          aria-current={link.current ? "page" : undefined}
                          onClick={event => onLinkClick(event, link.href, link.label)}
                        >
                          {link.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </nav>
                {filters ? <div className="sp-left-divider" /> : null}
              </>
            ) : null}
            {filters && empty ? (
              <div className="cds-empty">
                <h3>Filters appear once departments and zones exist</h3>
                {isAdmin ? (
                  <>
                    <p>Add them in Management.</p>
                    <div className="cds-empty-actions">
                      <Link className="cds-btn cds-btn--tertiary cds-btn--md" href="/admin/management?tab=departments" prefetch={false}>
                        Go to Management
                      </Link>
                    </div>
                  </>
                ) : (
                  <p>Ask an admin.</p>
                )}
              </div>
            ) : null}
            {filters && !empty
              ? groups.map(group => <FilterGroup key={group.id} group={group} spec={filters} />)
              : null}
            {filters?.note ? <div className="sp-left-panel-note">{filters.note}</div> : null}
          </div>
        </aside>
      ) : null}
    </div>
  );
}

function FilterGroup({ group, spec }: { group: ShellFilterGroup; spec: ShellFilterSpec }) {
  if (group.state === "loading") {
    return (
      <div aria-busy="true">
        <div className="sp-filter-group-row">{group.label}</div>
        <div className="sp-skeleton-row">
          <span className="sp-skeleton" />
        </div>
        <div className="sp-skeleton-row">
          <span className="sp-skeleton sp-skeleton--w2" />
        </div>
        <div className="sp-skeleton-row">
          <span className="sp-skeleton sp-skeleton--w3" />
        </div>
      </div>
    );
  }
  if (group.state === "error") {
    return (
      <div>
        <div className="sp-filter-group-row">{group.label}</div>
        <div className="cds-notification cds-notification--error" role="alert">
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <circle cx="10" cy="10" r="9" fill="currentColor" />
            <path d="M6.5 6.5l7 7M13.5 6.5l-7 7" fill="none" stroke="var(--sp-layer-02)" strokeWidth="1.5" />
          </svg>
          <div className="cds-notification-text">
            <strong>{group.label} couldn&apos;t load</strong>
            <p>The other filters still work.</p>
          </div>
          {spec.onRetryGroup ? (
            <button type="button" className="cds-btn cds-btn--ghost" onClick={() => spec.onRetryGroup?.(group.id)}>
              Retry
            </button>
          ) : null}
        </div>
      </div>
    );
  }
  const hasChecked = group.items.some(item => item.checked);
  return (
    <fieldset className="sp-filter-group">
      <legend>
        <span className="sp-filter-group-row">
          {group.label}
          {hasChecked ? (
            <button type="button" className="cds-btn cds-btn--ghost cds-btn--sm" onClick={() => spec.onClearGroup(group.id)}>
              Clear
            </button>
          ) : null}
        </span>
      </legend>
      {group.items.map(item => (
        <label key={item.id} className="sp-filter-item">
          <span className="cds-checkbox">
            <input type="checkbox" checked={item.checked} onChange={() => spec.onToggle(group.id, item.id)} />
            <span>
              <svg viewBox="0 0 12 12" aria-hidden="true">
                <path d="M2 6.5l2.5 2.5L10 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
              </svg>
            </span>
          </span>
          <span className="sp-filter-name" title={item.label}>
            {item.label}
          </span>
          <span className="sp-filter-count">{item.count}</span>
        </label>
      ))}
    </fieldset>
  );
}
