import type { ReactNode } from "react";

// Reception's page frame (redesign-v2 PHASE2UX §1R.2, D3-a; PHASE3DS §1.22):
// the 1584 live area with the asset page header — title + subtitle and NO
// primary action (nothing is created on Reception; the archetype allows
// zero). Shared by the page and its loading skeleton so the header never
// jumps when the directory lands. Server component: no hooks, no data.
export function ReceptionFrame({ children }: { children: ReactNode }) {
  return (
    <div className="sp-page mx-auto w-full">
      <div className="cds-page-header">
        <div>
          <h1 className="cds-page-title">Reception</h1>
          <p className="cds-page-subtitle">
            Front-desk directory — type what the caller gives you, read the extension, transfer.
          </p>
        </div>
      </div>
      {children}
    </div>
  );
}
