"use client";

// The publish review as the wide tearsheet (PHASE3DS §1.19, specimen
// 02-map.html#review; Phase 4 PR 3b, C10). Anchored bottom below the visible
// header, the overlay dims the page, NO ×: leaving is Cancel (the frame
// invariant). Rail 256 = readiness summary; body = the per-seat diff under
// floor group rows in registry order, then People details; footer 64 = facts
// left, Cancel · Publish right. Nothing in the flow chains into a second
// modal. States: ready · no changes (empty state + disabled primary) ·
// submitting (info notification, Cancel disabled, "Publishing…") · failure
// (error notification + Retry publish, review intact) · PUBLISH_BLOCKED (the
// host closes it; the server text lands in the canvas status region).
//
// All state and mutation logic stays in usePublishReview / SeatMap; this
// receives already-computed values and callbacks (the R-02a seam).

import { groupByFloor } from "@/lib/floors";
import type { PublishChangeSummary, PublishDiffRow, PublishDiffRowKind } from "@/lib/publishSummary";
import { NotificationGlyph } from "@/components/seat-map/CanvasStatus";
import { CheckIcon } from "@/components/seat-map/mapIcons";
import { useDialogFocus } from "@/components/ui/useDialogFocus";

const PUBLISH_DIFF_TAG_LABELS: Record<PublishDiffRowKind, string> = {
  assigned: "Assigned",
  added: "Added",
  vacated: "Vacated",
  removed: "Removed",
  reassigned: "Reassigned",
  updated: "Updated"
};

const DIFF_KIND_ORDER: PublishDiffRowKind[] = ["assigned", "vacated", "reassigned", "added", "removed", "updated"];

function plural(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

export function PublishReviewSheet({
  publishSummary,
  publishDiffRows,
  publishDiffCounts,
  actionError,
  pending,
  onClose,
  onConfirm
}: {
  publishSummary: PublishChangeSummary;
  publishDiffRows: PublishDiffRow[];
  publishDiffCounts: Record<PublishDiffRowKind, number>;
  actionError: string | null;
  pending: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const publishReviewDialogFocusRef = useDialogFocus<HTMLElement>();
  const hasChanges = publishSummary.hasChanges;
  const total = publishSummary.totalChangeCount;
  const facts = `Draft ${plural(publishSummary.draftSeatCount, "seat")} · Published ${plural(publishSummary.publishedSeatCount, "seat")} · Total changes ${total}`;
  // One "Retry publish" on screen — the error notification's own action; the
  // footer primary keeps the count so the two never share a name.
  const primaryLabel = pending
    ? "Publishing…"
    : hasChanges
      ? `Publish ${plural(total, "change")}`
      : "No changes to publish";

  return (
    <div className="sp-tearsheet-host" data-open="" data-tearsheet-host="">
      <div className="sp-tearsheet-overlay" />
      <section
        ref={publishReviewDialogFocusRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="publish-review-title"
        aria-describedby="publish-review-description"
        onKeyDown={event => {
          // Esc = Cancel, never mid-publish (the RPC is in flight; SeatMap's
          // ladder makes the same call for the window-level key).
          if (event.key === "Escape" && !pending) {
            event.stopPropagation();
            onClose();
          }
        }}
        className="sp-tearsheet focus-visible:outline-none"
      >
        <div className="sp-tearsheet-header">
          <h2 id="publish-review-title">Review draft before publishing</h2>
          <p id="publish-review-description">Saved draft changes only — unsaved inspector edits are excluded.</p>
        </div>

        <div className="sp-tearsheet-body">
          <aside className="sp-tearsheet-rail" aria-label="Readiness">
            <div className="sp-readiness">
              <div className="sp-readiness-title">
                {hasChanges ? (
                  <>
                    <span className="text-[var(--sp-status-success-mark)]" aria-hidden="true"><CheckIcon /></span>
                    Ready · {plural(total, "change")}
                  </>
                ) : "No changes"}
              </div>
              <div className="sp-readiness-facts">
                {hasChanges ? `Draft ${plural(publishSummary.draftSeatCount, "seat")} · Published ${plural(publishSummary.publishedSeatCount, "seat")}` : "Draft and published map are in sync."}
              </div>
              {hasChanges && (
                <div className="cds-tag-set">
                  {DIFF_KIND_ORDER.filter(kind => publishDiffCounts[kind] > 0).map(kind => (
                    <span key={kind} className="cds-tag">{publishDiffCounts[kind]} {PUBLISH_DIFF_TAG_LABELS[kind].toLowerCase()}</span>
                  ))}
                  {publishSummary.employeeDetailChanges.length > 0 && (
                    <span className="cds-tag">{plural(publishSummary.employeeDetailChanges.length, "person")} updated</span>
                  )}
                </div>
              )}
            </div>
            <div>
              <div className="sp-rail-heading">What publishing does</div>
              <div className="sp-rail-text">Replaces what everyone sees — both floors, in one step — and clears Undo/Redo. Viewers keep the current map until it finishes.</div>
            </div>
          </aside>

          <div className="sp-tearsheet-main">
            {pending && (
              <div className="cds-notification cds-notification--info" role="status" aria-live="polite">
                <NotificationGlyph kind="info" />
                <div className="cds-notification-text">
                  <strong>Publishing reviewed draft changes</strong>
                  <p>Viewers keep the current map until this finishes.</p>
                </div>
              </div>
            )}

            {actionError && !pending && (
              <div className="cds-notification cds-notification--error" role="alert">
                <NotificationGlyph kind="error" />
                <div className="cds-notification-text">
                  <strong>Publish did not complete.</strong>
                  <p>{actionError}</p>
                </div>
                {hasChanges && (
                  <button type="button" className="cds-btn cds-btn--ghost" onClick={onConfirm}>Retry publish</button>
                )}
              </div>
            )}

            {!hasChanges ? (
              <div className="cds-empty">
                <h3>No draft changes to publish</h3>
                <p>The saved draft already matches the map everyone sees. Make a change on the map, then review again.</p>
              </div>
            ) : (
              <>
                <div className="sp-tearsheet-section"><span>{plural(publishDiffRows.length, "seat change")}</span></div>
                {publishDiffRows.length > 0 ? (
                  <table className="cds-table" aria-label="Per-seat draft changes">
                    <thead>
                      <tr>
                        <th scope="col"><span className="cds-th-static">Seat</span></th>
                        <th scope="col"><span className="cds-th-static">Published now</span></th>
                        <th scope="col"><span className="cds-th-static">After publish</span></th>
                        <th scope="col"><span className="cds-th-static">Change</span></th>
                      </tr>
                    </thead>
                    {/* Rows group under floor eyebrows in registry order (lib/floors
                        groupByFloor) — the whole building publishes in ONE call, and
                        the review says which plan each change lands on. One tbody per
                        floor so each eyebrow is its group's first row. */}
                    {groupByFloor(publishDiffRows).map(group => (
                      <tbody key={group.floor} role="rowgroup">
                        <tr className="sp-table-group" role="row">
                          <td colSpan={4}>{group.label} · {plural(group.items.length, "change")}</td>
                        </tr>
                        {group.items.map(row => (
                          <tr key={row.key} role="row">
                            <td><code className="sp-palette-code" translate="no">{row.label}</code></td>
                            <td className={row.from === "Open seat" ? "text-[var(--sp-text-secondary)]" : undefined}>{row.from}</td>
                            <td className={row.to === "Open seat" ? "text-[var(--sp-text-secondary)]" : undefined}>{row.to}</td>
                            <td>
                              <span>{PUBLISH_DIFF_TAG_LABELS[row.kind]}</span>
                              {row.detail && <span className="cds-helper block">{row.detail}</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    ))}
                  </table>
                ) : (
                  <p className="cds-helper">No seat changes — only people details changed.</p>
                )}

                {publishSummary.employeeDetailChanges.length > 0 && (
                  <>
                    <div className="sp-tearsheet-section">People details · {publishSummary.employeeDetailChanges.length}</div>
                    <ul className="sp-detail-list">
                      {publishSummary.employeeDetailChanges.map(item => (
                        <li key={`${item.label}-${item.detail}`}><strong className="mr-1">{item.label}</strong> — {item.detail}</li>
                      ))}
                    </ul>
                  </>
                )}
              </>
            )}
          </div>
        </div>

        <div className="sp-tearsheet-footer">
          <span className="sp-tearsheet-facts">{facts}</span>
          <button type="button" className="cds-btn cds-btn--ghost" onClick={onClose} disabled={pending}>Cancel</button>
          {!hasChanges && <span id="publish-review-no-changes" className="sr-only">The saved draft already matches the published map.</span>}
          <button
            type="button"
            className="cds-btn cds-btn--primary"
            onClick={onConfirm}
            disabled={!publishSummary.hasChanges || pending}
            aria-busy={pending || undefined}
            aria-describedby={!hasChanges ? "publish-review-no-changes" : undefined}
            title={hasChanges ? "Publish reviewed draft changes" : "No draft changes to publish"}
          >
            {primaryLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
