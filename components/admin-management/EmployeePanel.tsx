"use client";

// Create / edit employee — the 480 side panel as a slide-OVER (PHASE3DS §1.24,
// block 22; PHASE2UX §1G.3; specimen 03-panels-and-sheets.html lines 90–160):
// the asset `.cds-side-panel` on `.sp-side-panel-host`, `layer-02` with the
// 1px left rule, the catch element painted as the scrim. The admin keeps the
// table behind for reference; the form is self-contained, so the panel is a
// dialog: focus-trapped, Esc / scrim / Cancel all go through ONE dirty check
// (clean → close; dirty → the confirm modal on top, P3-17). No ×: leaving is
// a decision (Cancel). Header: heading-03 title + the one helper line. Body:
// the single-column form (Name is the one field marked — required is the
// minority), Department on the 3b combobox, the read-only fact row with a
// 32px ghost to the map, and the danger zone (Deactivate… as a danger ghost,
// its block reason as helper text; a refusal renders here as an inline error
// with the seat link). Footer 64 keeps the asset's 50/50 bleed: Cancel
// (secondary) · Save employee / Add employee (primary, aria-busy while
// saving; fields readOnly, never disabled). Server error: inline notification
// above the form, focused on arrival, values intact, Retry inside.

import Link from "next/link";
import type { RefObject } from "react";
import { withSeatParam } from "@/lib/deepLink";
import type { EmployeeForm } from "@/components/admin-management/employeeForm";
import { DepartmentCombobox, type DepartmentChoice } from "@/components/ui/DepartmentCombobox";
import { NotificationGlyph } from "@/components/seat-map/CanvasStatus";
import { useDialogFocus } from "@/components/ui/useDialogFocus";

export function EmployeePanel({
  mode,
  personName,
  form,
  onFormChange,
  departmentChoices,
  draftSeatLabel,
  draftSeatFloor,
  pending,
  saving,
  saveLabel,
  error,
  errorRef,
  onDismissError,
  onRetry,
  saveButtonRef,
  nameInputRef,
  dangerError,
  onDeactivate,
  onRequestClose,
  onSave
}: {
  mode: "add" | "edit";
  personName: string;
  form: EmployeeForm;
  onFormChange: (patch: Partial<EmployeeForm>) => void;
  departmentChoices: DepartmentChoice[];
  draftSeatLabel: string | null;
  draftSeatFloor: string | null;
  pending: boolean;
  saving: boolean;
  saveLabel: string;
  error: string | null;
  errorRef: RefObject<HTMLDivElement | null>;
  onDismissError: () => void;
  onRetry: () => void;
  saveButtonRef: RefObject<HTMLButtonElement | null>;
  nameInputRef: RefObject<HTMLInputElement | null>;
  dangerError: string | null;
  onDeactivate: () => void;
  onRequestClose: () => void;
  onSave: () => void;
}) {
  const employeeDialogFocusRef = useDialogFocus<HTMLElement>();
  const canSave = form.fullName.trim().length > 0 && !pending;
  const readOnly = saving;

  return (
    <div className="sp-side-panel-host" data-panel="open">
      {/* The catch is the scrim: clicking it is Cancel (P3-17). */}
      <div className="cds-side-panel-catch" onClick={() => { if (!pending) onRequestClose(); }} />
      <section
        ref={employeeDialogFocusRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="management-employee-title"
        aria-describedby="management-employee-description"
        onKeyDown={event => {
          if (event.key === "Escape" && !pending) {
            event.stopPropagation();
            onRequestClose();
          }
        }}
        className="cds-side-panel focus-visible:outline-none"
      >
        <div className="cds-side-panel-header">
          <h2 id="management-employee-title">{mode === "edit" ? "Edit employee" : "Add employee"}</h2>
          <p id="management-employee-description">Changes reach the map and Reception at the next publish.</p>
        </div>

        <div className="cds-side-panel-body overscroll-contain">
          {/* The save error lives HERE, above the form — never on the page banner
              the scrim occludes. Glyph + text (two signals), role="alert", focused
              on arrival; dismissing hands focus back to the primary. */}
          {error && (
            <div ref={errorRef} tabIndex={-1} role="alert" className="cds-notification cds-notification--error focus-visible:outline-none">
              <NotificationGlyph kind="error" />
              <div className="cds-notification-text">
                <strong>Couldn’t save {personName || "this employee"}.</strong> {error} Your edits are still here.
              </div>
              <button type="button" className="cds-btn cds-btn--ghost" onClick={onRetry} disabled={!canSave}>Retry</button>
              <button type="button" className="cds-btn cds-btn--ghost" onClick={onDismissError} aria-label="Dismiss save error">Dismiss</button>
            </div>
          )}

          <form
            className="cds-form"
            onSubmit={event => {
              event.preventDefault();
              if (canSave) onSave();
            }}
          >
            <div className="cds-form-item">
              <label htmlFor="management-employee-name">
                Name <span className="cds-optional" aria-hidden="true">— required</span>
              </label>
              <input
                id="management-employee-name"
                ref={nameInputRef}
                name="fullName"
                className="cds-text-input"
                value={form.fullName}
                onChange={event => onFormChange({ fullName: event.target.value })}
                required
                readOnly={readOnly}
                autoComplete="off"
              />
            </div>
            <div className="cds-form-item">
              <label htmlFor="management-employee-position">Position</label>
              <input
                id="management-employee-position"
                name="position"
                className="cds-text-input"
                value={form.position}
                onChange={event => onFormChange({ position: event.target.value })}
                placeholder="Attorney, Paralegal…"
                readOnly={readOnly}
                autoComplete="off"
              />
            </div>
            <div className="cds-form-item">
              <label htmlFor="management-employee-extension">Phone extension</label>
              <input
                id="management-employee-extension"
                name="phoneExtension"
                type="tel"
                className="cds-text-input"
                style={{ maxWidth: 160 }}
                value={form.phoneExtension}
                onChange={event => onFormChange({ phoneExtension: event.target.value })}
                inputMode="numeric"
                readOnly={readOnly}
                autoComplete="off"
              />
            </div>
            <div className="cds-form-item">
              <label htmlFor="management-employee-email">Email</label>
              <input
                id="management-employee-email"
                name="email"
                type="email"
                spellCheck={false}
                className="cds-text-input"
                value={form.email}
                onChange={event => onFormChange({ email: event.target.value })}
                placeholder="name@megeredchianlaw.com"
                inputMode="email"
                readOnly={readOnly}
                autoComplete="off"
              />
            </div>
            <div className="cds-form-item">
              <label htmlFor="management-employee-department">Department</label>
              <DepartmentCombobox
                id="management-employee-department"
                value={form.department}
                onChange={department => onFormChange({ department })}
                options={departmentChoices}
                describedBy="management-employee-department-help"
                readOnly={readOnly}
              />
              <div className="cds-helper" id="management-employee-department-help">Pick from the list, or type a new name and it is added at save.</div>
            </div>
          </form>

          {/* Read-only fact row: content that must be read, so a <dl>, never a
              disabled field. */}
          <dl className="sp-fact-row">
            <dt>Draft seat</dt>
            <dd>
              {mode === "edit" && draftSeatLabel ? (
                <>
                  <span className="sp-seat-code" translate="no">{draftSeatLabel}</span>
                  {draftSeatFloor && <span className="text-[var(--sp-text-secondary)]">· Floor {draftSeatFloor}</span>}
                  <Link href={`/admin${withSeatParam("", draftSeatLabel)}`} prefetch={false} className="cds-btn cds-btn--ghost cds-btn--sm">
                    Open on the map
                  </Link>
                </>
              ) : (
                <span className="text-[var(--sp-text-secondary)]">
                  {mode === "edit" ? "None — assign one on the map." : "None yet — assign one on the map after saving."}
                </span>
              )}
            </dd>
          </dl>

          {mode === "edit" && (
            <div className="sp-danger-zone">
              {dangerError && (
                <div role="alert" className="cds-notification cds-notification--error">
                  <NotificationGlyph kind="error" />
                  <div className="cds-notification-text"><strong>Couldn’t deactivate {personName}.</strong> {dangerError}</div>
                  {draftSeatLabel && (
                    <Link href={`/admin${withSeatParam("", draftSeatLabel)}`} prefetch={false} className="cds-btn cds-btn--ghost">
                      Open {draftSeatLabel} on the map
                    </Link>
                  )}
                </div>
              )}
              <button type="button" className="cds-btn cds-btn--danger-ghost" onClick={onDeactivate} disabled={pending}>
                Deactivate…
              </button>
              <p className="sp-block-reason">
                {draftSeatLabel
                  ? `Removes ${personName} from the directory and clears ${draftSeatLabel} in the draft. The published map does not change until you publish.`
                  : `Removes ${personName} from the active directory. The published map does not change until you publish.`}
              </p>
            </div>
          )}
        </div>

        <div className="cds-side-panel-footer">
          <button type="button" className="cds-btn cds-btn--secondary" onClick={onRequestClose} disabled={pending}>
            Cancel
          </button>
          <button
            ref={saveButtonRef}
            type="button"
            className="cds-btn cds-btn--primary"
            onClick={onSave}
            disabled={!canSave}
            aria-busy={saving || undefined}
          >
            {saveLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
