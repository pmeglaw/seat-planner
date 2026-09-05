"use client";

// Management page frame: the asset page header (title · subtitle · the ONE
// 40px primary, which follows the tab — DECISIONS D5-a) and the sticky LINE
// tab strip (PHASE3DS §1.22, block 20: 40 tall, 2px `--sp-tab-bar` — the
// brand terracotta through Carbon's interactive-border role — hover border-strong,
// focus the inset ring). Tabs: `<nav aria-label="Management sections">` is
// the navigation landmark (PHASE2UX §1G.6); inside it `ul[role=tablist]` of
// `li > button[role=tab]`; ← → Home End move AND select; Tab leaves into the
// tabpanel. Publish History is gone (D5): the History panel owns it.
//
// Sticky offset: the sheet's `.sp-tabs-host { top: var(--sp-shell-header-h) }`
// assumes a scrolling document. In the shell the content pane is the scroll
// container at lg (app/(shell)/admin/management/page.tsx), so at lg the
// strip sits at the pane's top: the header height is zeroed on THIS element
// only (a custom property scoped to the host — nothing inside reads it).
// Below lg the document scrolls and the sheet's 48 applies. PHASE4BUILD §1.37.

import type { KeyboardEvent, ReactNode } from "react";

export type ManagementTab = "employees" | "departments" | "zones";

export const MANAGEMENT_TABS: Array<{ id: ManagementTab; label: string; primary: string }> = [
  { id: "employees", label: "Employees", primary: "Add employee" },
  { id: "departments", label: "Departments", primary: "Add department" },
  { id: "zones", label: "Zones", primary: "Add zone" }
];

export function tabPanelId(tab: ManagementTab) {
  return `management-panel-${tab}`;
}

export function tabId(tab: ManagementTab) {
  return `management-tab-${tab}`;
}

export function ManagementFrame({
  activeTab,
  onTabChange,
  onPrimary,
  primaryDisabled = false,
  children
}: {
  activeTab: ManagementTab;
  onTabChange: (tab: ManagementTab) => void;
  onPrimary: () => void;
  primaryDisabled?: boolean;
  children: ReactNode;
}) {
  const current = MANAGEMENT_TABS.find(tab => tab.id === activeTab) ?? MANAGEMENT_TABS[0];

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = MANAGEMENT_TABS.length - 1;
    let next: number | null = null;
    if (event.key === "ArrowRight") next = index === last ? 0 : index + 1;
    else if (event.key === "ArrowLeft") next = index === 0 ? last : index - 1;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = last;
    if (next === null) return;
    event.preventDefault();
    const target = MANAGEMENT_TABS[next];
    onTabChange(target.id);
    document.getElementById(tabId(target.id))?.focus();
  }

  return (
    <div className="sp-page mx-auto w-full">
      <div className="cds-page-header">
        <div>
          <h1 className="cds-page-title">Management</h1>
          <p className="cds-page-subtitle">People, departments and zones.</p>
        </div>
        <div className="sp-page-actions">
          <button type="button" className="cds-btn cds-btn--primary cds-btn--md" onClick={onPrimary} disabled={primaryDisabled}>
            {current.primary}
          </button>
        </div>
      </div>

      <nav aria-label="Management sections" className="sp-tabs-host lg:[--sp-shell-header-h:0px]">
        <ul className="sp-tabs" role="tablist" aria-label="Management sections">
          {MANAGEMENT_TABS.map((tab, index) => {
            const selected = tab.id === activeTab;
            return (
              <li key={tab.id} role="presentation">
                <button
                  type="button"
                  id={tabId(tab.id)}
                  role="tab"
                  className="sp-tab"
                  aria-selected={selected}
                  aria-controls={tabPanelId(tab.id)}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => onTabChange(tab.id)}
                  onKeyDown={event => handleTabKeyDown(event, index)}
                >
                  {tab.label}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div id={tabPanelId(activeTab)} role="tabpanel" aria-labelledby={tabId(activeTab)} tabIndex={-1} className="focus-visible:outline-none">
        {children}
      </div>
    </div>
  );
}
