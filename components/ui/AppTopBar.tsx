"use client";

import Link from "next/link";
import type { MouseEvent as ReactMouseEvent } from "react";
import type { ShellPanelId } from "@/components/ui/ShellPanels";
import type { SectionId } from "@/components/ui/shellNavConfig";
import { modeIndicatorText, type ShellModeStatus } from "@/lib/shellMode";

// The Phase 3 shell header (PHASE2UX §1.2, PHASE3DS §1.3 / §1.7 / §1.8,
// specimen 01-shell.html#header): 48px, Gray 100 in BOTH themes (tier C),
// composed from the asset's `.cds-header` plus the `.sp-header` overrides.
// DOM order = tab order (PHASE2UX §1.7 row 2): skip link → hamburger → name
// → section links → mode indicator → Help → History → Account. Every
// control is 48px tall; the asset and sp-components.css own every colour
// and state — this file adds no colour, no shadow, no geometry (the
// outlined-open treatment on the utilities and the indicator is the
// `[aria-expanded="true"]` rule, four shadows, PHASE3DS §7 item 7 / P3-9:
// never re-implement it here).
//
// The mode indicator is STATUS, not location (PHASE2UX §1.2): its one
// behaviour is opening the History panel. The section link says where you
// are; only the History panel's switch changes mode.

export type AppTopBarProps = {
  isAdmin: boolean;
  pathname: string;
  active: SectionId;
  links: Array<{ id: SectionId; label: string; href: string }>;
  skipLink: { href: string; label: string };
  onLinkClick: (event: ReactMouseEvent<HTMLAnchorElement>, href: string, label: string) => void;
  /** Hamburger: present only where the left panel has content (D0-h at
   *  lg+ shows the reserved slot on sub-pages until PR 3 registers admin
   *  filters). */
  hasLeftContent: boolean;
  leftOpen: boolean;
  onToggleLeft: () => void;
  modeStatus: ShellModeStatus;
  /** Below the header-nav breakpoint: compact indicator text (D0-e). */
  compact: boolean;
  openPanel: ShellPanelId | null;
  onTogglePanel: (panel: ShellPanelId) => void;
};

const UTILITIES: Array<{ id: ShellPanelId; label: string }> = [
  { id: "help", label: "Help" },
  { id: "history", label: "History" },
  { id: "account", label: "Account" }
];

export function AppTopBar({
  pathname,
  active,
  links,
  skipLink,
  onLinkClick,
  hasLeftContent,
  leftOpen,
  onToggleLeft,
  modeStatus,
  compact,
  openPanel,
  onTogglePanel
}: AppTopBarProps) {
  void pathname;
  return (
    <header id="shell-header" className="cds-header sp-header">
      {/* First focusable in the document (PHASE2UX §1.7). */}
      <a className="cds-skip-link" href={skipLink.href}>
        {skipLink.label}
      </a>
      {hasLeftContent ? (
        <button
          type="button"
          className="sp-header-slot"
          aria-label="Filters"
          aria-expanded={leftOpen}
          aria-controls="shell-left-panel"
          onClick={onToggleLeft}
        >
          {/* Both glyphs mounted; the CSS swaps them on aria-expanded (open = Close glyph, NO fill). */}
          <svg className="sp-glyph-menu" viewBox="0 0 20 20" aria-hidden="true">
            <path d="M2 5h16M2 10h16M2 15h16" fill="none" stroke="currentColor" strokeWidth="1.5" />
          </svg>
          <svg className="sp-glyph-close" viewBox="0 0 20 20" aria-hidden="true">
            <path d="M4 4l12 12M16 4L4 16" fill="none" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>
      ) : (
        <span className="sp-header-slot sp-header-slot--reserved" aria-hidden="true" />
      )}
      {/* Text only (D0-d; owner ruling 2026-09-04): no graphic mark in the
          header. The org name is an identifier — never machine-translated. */}
      <Link className="cds-header-name" href="/" onClick={event => onLinkClick(event, "/", "the viewer")}>
        <span translate="no">Megeredchian Law</span> <strong>Seat Planner</strong>
      </Link>
      <nav className="cds-header-nav" aria-label="Sections">
        {links.map(link => (
          <Link
            key={link.id}
            href={link.href}
            title={link.label}
            prefetch={false}
            aria-current={link.id === active ? "page" : undefined}
            onClick={event => onLinkClick(event, link.href, link.label)}
          >
            {link.label}
          </Link>
        ))}
      </nav>
      <div className="sp-header-center">
        <ModeIndicator status={modeStatus} compact={compact} open={openPanel === "history"} onOpen={() => onTogglePanel("history")} />
      </div>
      <div className="cds-header-utils">
        {UTILITIES.map(utility => (
          <span key={utility.id} className="sp-has-tooltip">
            <button
              type="button"
              aria-label={utility.label}
              aria-expanded={openPanel === utility.id}
              aria-controls={`shell-panel-${utility.id}`}
              onClick={() => onTogglePanel(utility.id)}
            >
              <UtilityIcon id={utility.id} />
            </button>
            {/* Tier-C tooltip (PHASE3DS §1.8): repeats the aria-label; shown on hover and focus by the CSS. */}
            <span className="sp-tooltip" role="tooltip">
              {utility.label}
            </span>
          </span>
        ))}
      </div>
    </header>
  );
}

function ModeIndicator({ status, compact, open, onOpen }: { status: ShellModeStatus; compact: boolean; open: boolean; onOpen: () => void }) {
  if (status.kind === "loading") {
    // Not a button while loading (aria-busy, not disabled — PHASE3DS §1.3).
    return (
      <span className="sp-mode sp-mode--loading" aria-busy="true" aria-label="Loading publish state">
        <span className="sp-mode-skeleton" />
      </span>
    );
  }
  return (
    <button type="button" className={`sp-mode sp-mode--${status.kind}`} aria-expanded={open} aria-controls="shell-panel-history" onClick={onOpen}>
      <ModeMark kind={status.kind} />
      {modeIndicatorText(status, { compact })}
    </button>
  );
}

// Inlined, never <use>d: the marks are styled by descendant selectors
// ([data-fill] / [data-stroke] / [data-cut]) which cannot reach into a
// <use> shadow tree (PHASE3DS §7 item 4). Two signals in every mark —
// shape + fill — the text is the third (PHASE2UX §1.2 row 4).
function ModeMark({ kind }: { kind: Exclude<ShellModeStatus["kind"], "loading"> }) {
  return (
    <svg className="sp-mode-mark" viewBox="0 0 12 12" aria-hidden="true">
      {kind === "published" ? <rect data-fill="" x="0" y="0" width="12" height="12" /> : null}
      {kind === "draft" ? <path data-stroke="" d="M6 1.5 L10.5 6 L6 10.5 L1.5 6 Z" /> : null}
      {kind === "unpublished" ? <rect data-stroke="" x="1" y="1" width="10" height="10" /> : null}
      {kind === "error" ? (
        <>
          <circle data-fill="" cx="6" cy="6" r="6" />
          <path data-cut="" d="M3.5 3.5 L8.5 8.5 M8.5 3.5 L3.5 8.5" />
        </>
      ) : null}
    </svg>
  );
}

function UtilityIcon({ id }: { id: ShellPanelId }) {
  // Specimen symbols #i-help / #i-history / #i-account, 20px, stroke 1.5.
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeWidth="1.5" />
      {id === "help" ? <path d="M7.5 8a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .8-1 1.7M10 14.5v.5" fill="none" stroke="currentColor" strokeWidth="1.5" /> : null}
      {id === "history" ? <path d="M10 5v5l3.5 2" fill="none" stroke="currentColor" strokeWidth="1.5" /> : null}
      {id === "account" ? (
        <>
          <circle cx="10" cy="8" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M5 15.5c1-2.5 3-3.5 5-3.5s4 1 5 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </>
      ) : null}
    </svg>
  );
}
