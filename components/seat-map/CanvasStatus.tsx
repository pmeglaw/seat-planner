"use client";

// The canvas status region (PHASE3DS §1.21 `.sp-canvas-status`; Phase 4
// PR 3a): inline notifications over the map's top-left — task-generated
// feedback in the region the user is working in (SKILL: inline is the
// default, never a toast). Each notice is one of the asset's notification
// kinds with an optional action; the region is role="status" so arrivals
// announce politely, and a notice that needs alert semantics says so.
import type { ReactNode } from "react";

export type CanvasNoticeKind = "info" | "success" | "warning" | "error";

export type CanvasNotice = {
  id: string;
  kind: CanvasNoticeKind;
  title?: string;
  text: ReactNode;
  /** role="alert" for task-stopping failures; the region's status role otherwise. */
  alert?: boolean;
  action?: { label: string; onClick?: () => void; href?: string };
  onDismiss?: () => void;
};

const GLYPH: Record<CanvasNoticeKind, ReactNode> = {
  info: <circle cx="8" cy="8" r="7" fill="currentColor" />,
  success: <circle cx="8" cy="8" r="7" fill="currentColor" />,
  warning: <path d="M8 1 15 14H1z" fill="currentColor" />,
  error: <circle cx="8" cy="8" r="7" fill="currentColor" />
};

export function CanvasStatus({ notices }: { notices: CanvasNotice[] }) {
  if (notices.length === 0) return null;
  return (
    <div className="sp-canvas-status" role="status" aria-live="polite">
      {notices.map(notice => (
        <div key={notice.id} className={`cds-notification cds-notification--${notice.kind}`} role={notice.alert ? "alert" : undefined}>
          <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">{GLYPH[notice.kind]}</svg>
          <div className="cds-notification-text">
            {notice.title ? <strong>{notice.title}</strong> : null}
            <p>{notice.text}</p>
          </div>
          {notice.action?.href ? (
            // A full navigation on purpose (the session is gone): the login
            // page is a sanctioned document load (lib/fullNavigation).
            <a className="cds-btn cds-btn--ghost cds-btn--sm" href={notice.action.href}>{notice.action.label}</a>
          ) : notice.action ? (
            <button type="button" className="cds-btn cds-btn--ghost cds-btn--sm" onClick={notice.action.onClick}>{notice.action.label}</button>
          ) : null}
          {notice.onDismiss ? (
            <button type="button" className="cds-btn cds-btn--icon cds-btn--sm" aria-label="Dismiss" onClick={notice.onDismiss}>
              <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M3 3l10 10M13 3L3 13" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}
