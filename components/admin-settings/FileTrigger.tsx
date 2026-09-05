"use client";

// Labelled file trigger (DECISIONS D6-b frame invariant; PHASE3DS §1.27, P3-16):
// a real button whose label states the type and the limit up front ("Import
// CSV · .csv up to 5 MB"), forwarding its click to a hidden <input type=file>
// with the same accessible name. The input is tabindex -1 and aria-hidden so
// focus stays on the button; the change handler receives the chosen File (or
// nothing when the picker is dismissed) and the input is cleared so the same
// file can be chosen again after an inline refusal.

import { useRef } from "react";

export function FileTrigger({
  label,
  name,
  accept,
  variant,
  busy = false,
  disabled = false,
  onFile
}: {
  label: string;
  name: string;
  accept: string;
  variant: "primary" | "tertiary";
  busy?: boolean;
  disabled?: boolean;
  onFile: (file: File | undefined) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  return (
    <>
      <button
        type="button"
        className={`cds-btn cds-btn--${variant} cds-btn--md`}
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
        aria-busy={busy || undefined}
      >
        {label}
      </button>
      <input
        ref={inputRef}
        type="file"
        name={name}
        accept={accept}
        aria-label={label}
        aria-hidden="true"
        tabIndex={-1}
        hidden
        onChange={event => {
          const file = event.target.files?.[0];
          onFile(file);
          event.target.value = "";
        }}
      />
    </>
  );
}
