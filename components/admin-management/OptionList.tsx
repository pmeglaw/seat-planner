"use client";

// Departments / Zones structured list (PHASE2UX §1G.4; PHASE3DS §1.25, block
// 23; specimen 04-forms-and-tables.html line 148): 48px rows — name · count
// (tabular, 96) · ghost Rename · ⋯ overflow holding Delete (danger). Two
// actions per row, so the overflow is earned (owner, 2026-09-05). Rename
// swaps the name for a 40px field + Save (primary 40) · Cancel (ghost);
// Enter saves, Esc cancels; blur VALIDATES, never commits — a duplicate is
// invalid on blur with the primary disabled and the helper under the field
// (the name quoted, the next step named — lib/inlineRename). A server
// failure lands in the same helper slot; the row stays in edit. A department
// people carry that the list lacks shows the outline tag "Not in list" and a
// tertiary Add to list. Empty state per list; the header primary is the next
// step.

import { useEffect, useId, useRef, useState } from "react";
import { resolveInlineRename, type OptionKind } from "@/lib/inlineRename";
import { MoreIcon } from "@/components/seat-map/mapIcons";

export type OptionRow = {
  key: string;
  name: string;
  count: number;
  /** false = used by people but absent from the managed list (departments only). */
  managed: boolean;
};

export function OptionList({
  kind,
  rows,
  countNoun,
  pending,
  busyOp,
  onRename,
  onDelete,
  onAdopt,
  emptyTitle,
  emptyBody
}: {
  kind: OptionKind;
  rows: OptionRow[];
  /** "employee" / "draft seat" — pluralised by count. */
  countNoun: string;
  pending: boolean;
  busyOp: string | null;
  /** Resolves to null on success, or the inline message to show under the field. */
  onRename: (from: string, to: string) => Promise<string | null>;
  onDelete: (name: string) => void;
  onAdopt?: (name: string) => void;
  emptyTitle: string;
  emptyBody: string;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [touched, setTouched] = useState(false);
  const [serverMessage, setServerMessage] = useState<string | null>(null);
  const existing = rows.map(row => row.name);

  function beginRename(name: string) {
    setEditing(name);
    setDraft(name);
    setTouched(false);
    setServerMessage(null);
  }

  function cancelRename() {
    setEditing(null);
    setDraft("");
    setTouched(false);
    setServerMessage(null);
  }

  const resolution = editing === null ? null : resolveInlineRename({ kind, draft, original: editing, existing });
  const helper = serverMessage ?? (touched && resolution?.kind === "invalid" ? resolution.message : null);
  const canSave = resolution?.kind === "valid" && !pending;

  async function commitRename() {
    if (editing === null || resolution?.kind !== "valid") {
      setTouched(true);
      return;
    }
    const message = await onRename(editing, resolution.name);
    if (message) {
      setServerMessage(message);
      setTouched(true);
      return;
    }
    cancelRename();
  }

  const nounFor = (count: number) => `${count.toLocaleString()} ${countNoun}${count === 1 ? "" : "s"}`;

  if (rows.length === 0) {
    return (
      <div className="cds-empty">
        <h3>{emptyTitle}</h3>
        <p>{emptyBody}</p>
      </div>
    );
  }

  return (
    <ul className="sp-list">
      {rows.map(row => {
        const isEditing = editing === row.name;
        return (
          <li key={row.key} className={isEditing ? "sp-list-row sp-list-row--editing" : "sp-list-row"}>
            {isEditing ? (
              <RenameField
                kind={kind}
                draft={draft}
                invalid={helper !== null}
                helper={helper}
                onChange={value => {
                  setDraft(value);
                  setServerMessage(null);
                }}
                onBlur={() => setTouched(true)}
                onEnter={commitRename}
                onEscape={cancelRename}
              />
            ) : (
              <>
                <span className="sp-list-name" title={row.name}>
                  {row.name}
                  {!row.managed && <span className="cds-tag cds-tag--outline">Not in list</span>}
                </span>
                <span className="sp-list-count">{nounFor(row.count)}</span>
              </>
            )}

            {isEditing ? (
              <>
                <button type="button" className="cds-btn cds-btn--primary" onClick={commitRename} disabled={!canSave} aria-busy={pending && busyOp === `${kind}-rename` ? "true" : undefined}>
                  {pending && busyOp === `${kind}-rename` ? "Renaming…" : "Save"}
                </button>
                <button type="button" className="cds-btn cds-btn--ghost" onClick={cancelRename} disabled={pending}>Cancel</button>
              </>
            ) : (
              <>
                <span className="flex items-center gap-2">
                  {!row.managed && onAdopt && (
                    <button type="button" className="cds-btn cds-btn--tertiary" onClick={() => onAdopt(row.name)} disabled={pending} aria-busy={pending && busyOp === `adopt-${kind}:${row.name}` ? "true" : undefined}>
                      {pending && busyOp === `adopt-${kind}:${row.name}` ? "Adding…" : "Add to list"}
                    </button>
                  )}
                  <button type="button" className="cds-btn cds-btn--ghost" onClick={() => beginRename(row.name)} disabled={pending}>Rename</button>
                </span>
                <RowOverflow name={row.name} disabled={pending} onDelete={() => onDelete(row.name)} />
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function RenameField({
  kind,
  draft,
  invalid,
  helper,
  onChange,
  onBlur,
  onEnter,
  onEscape
}: {
  kind: OptionKind;
  draft: string;
  invalid: boolean;
  helper: string | null;
  onChange: (value: string) => void;
  onBlur: () => void;
  onEnter: () => void;
  onEscape: () => void;
}) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);
  return (
    <div className="cds-form-item" data-invalid={invalid ? "" : undefined}>
      <label htmlFor={id} className="cds-visually-hidden">{kind === "department" ? "Department name" : "Zone name"}</label>
      <input
        id={id}
        ref={inputRef}
        className="cds-text-input"
        value={draft}
        onChange={event => onChange(event.target.value)}
        onBlur={onBlur}
        onKeyDown={event => {
          if (event.key === "Enter") {
            event.preventDefault();
            onEnter();
          } else if (event.key === "Escape") {
            event.stopPropagation();
            onEscape();
          }
        }}
        aria-invalid={invalid || undefined}
        aria-describedby={helper ? `${id}-helper` : undefined}
        autoComplete="off"
      />
      {helper && <div className="cds-helper" id={`${id}-helper`}>{helper}</div>}
    </div>
  );
}

// ⋯ holds Delete ONLY (danger). Same anatomy as the map control row's menu:
// the trigger carries the name + tooltip, the menu is a sibling, Esc returns
// focus to the trigger, an outside pointer closes it.
function RowOverflow({ name, disabled, onDelete }: { name: string; disabled: boolean; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuId = useId();
  useEffect(() => {
    if (!open) return;
    function handleOutsidePointer(event: PointerEvent) {
      if (rootRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    }
    document.addEventListener("pointerdown", handleOutsidePointer);
    return () => document.removeEventListener("pointerdown", handleOutsidePointer);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    window.requestAnimationFrame(() => rootRef.current?.querySelector<HTMLButtonElement>("[role='menuitem']")?.focus());
  }, [open]);
  const label = `More actions for ${name}`;
  return (
    <span ref={rootRef} className="cds-overflow" data-open={open ? "" : undefined}>
      <span className="sp-has-tooltip">
        <button
          ref={triggerRef}
          type="button"
          className="cds-btn cds-btn--icon cds-btn--md"
          aria-label={label}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          disabled={disabled}
          onClick={() => setOpen(value => !value)}
        >
          <MoreIcon />
        </button>
        <span className="sp-tooltip" role="tooltip">More actions</span>
      </span>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          className="cds-overflow-menu"
          onKeyDown={event => {
            if (event.key === "Escape") {
              event.stopPropagation();
              setOpen(false);
              triggerRef.current?.focus();
            }
          }}
        >
          <button
            type="button"
            role="menuitem"
            className="cds-danger"
            aria-label={`Delete ${name}`}
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
          >
            Delete
          </button>
        </div>
      )}
    </span>
  );
}
