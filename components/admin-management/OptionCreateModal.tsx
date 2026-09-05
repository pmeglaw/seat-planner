"use client";

// One-field create modal for departments / zones (DECISIONS D5-c; specimen
// 03-panels-and-sheets.html lines 202–203): eyebrow "Departments" / "Zones",
// heading "Add department" / "Add zone", Name field with the helper, footer
// 50/50 bleed Cancel (secondary) · Add department (primary). A duplicate is
// invalid on blur with the specimen's copy and the primary disabled; a server
// failure lands in the same helper slot with the field intact.

import { useEffect, useId, useRef, useState } from "react";
import { resolveInlineRename, type OptionKind } from "@/lib/inlineRename";
import { CarbonModal } from "@/components/ui/CarbonModal";

export function OptionCreateModal({
  kind,
  existing,
  pending,
  busy,
  onCancel,
  onCreate
}: {
  kind: OptionKind;
  existing: string[];
  pending: boolean;
  busy: boolean;
  onCancel: () => void;
  /** Resolves to null on success (the host closes the modal), or the inline message. */
  onCreate: (name: string) => Promise<string | null>;
}) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [draft, setDraft] = useState("");
  const [touched, setTouched] = useState(false);
  const [serverMessage, setServerMessage] = useState<string | null>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const resolution = resolveInlineRename({ kind, draft, original: null, existing });
  const helper = serverMessage ?? (touched && resolution.kind === "invalid" ? resolution.message : null);
  const canSubmit = resolution.kind === "valid" && !pending;
  const noun = kind === "department" ? "department" : "zone";
  const title = `Add ${noun}`;

  async function submit() {
    if (!canSubmit || resolution.kind !== "valid") {
      setTouched(true);
      return;
    }
    const message = await onCreate(resolution.name);
    if (message) {
      setServerMessage(message);
      setTouched(true);
    }
  }

  return (
    <CarbonModal
      titleId="management-option-create-title"
      title={title}
      eyebrow={kind === "department" ? "Departments" : "Zones"}
      busy={pending}
      onEscape={onCancel}
      footer={
        <>
          <button type="button" className="cds-btn cds-btn--secondary" onClick={onCancel} disabled={pending}>Cancel</button>
          <button type="button" className="cds-btn cds-btn--primary" onClick={submit} disabled={!canSubmit} aria-busy={busy || undefined}>
            {busy ? "Adding…" : title}
          </button>
        </>
      }
    >
      <form
        className="cds-form"
        onSubmit={event => {
          event.preventDefault();
          void submit();
        }}
      >
        <div className="cds-form-item" data-invalid={helper ? "" : undefined}>
          <label htmlFor={id}>Name</label>
          <input
            id={id}
            ref={inputRef}
            className="cds-text-input"
            style={{ width: "100%" }}
            value={draft}
            onChange={event => {
              setDraft(event.target.value);
              setServerMessage(null);
            }}
            onBlur={() => setTouched(true)}
            aria-invalid={helper ? true : undefined}
            aria-describedby={`${id}-helper`}
            autoComplete="off"
            readOnly={busy}
          />
          <div className="cds-helper" id={`${id}-helper`}>
            {helper ?? (kind === "department"
              ? "Appears in the map filters and on employee records after the next publish."
              : "Appears in the map filters and as a custom-seat label prefix after the next publish.")}
          </div>
        </div>
      </form>
    </CarbonModal>
  );
}
