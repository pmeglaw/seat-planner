"use client";

import { cx } from "@/components/ui/design-system";

export function PasswordVisibilityButton({ shown, onToggle, label = "Show password" }: {
  shown: boolean;
  onToggle: () => void;
  label?: string;
}) {
  return (
    <button type="button" onClick={onToggle} aria-label={label} aria-pressed={shown}
      className={cx("grid h-11 w-11 flex-none place-items-center text-[var(--sp-text-secondary)] hover:bg-[var(--sp-field-hover)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--sp-focus)]")}>
      <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-[15px] w-[15px]">
        <path d="M2.5 10s3-5 7.5-5 7.5 5 7.5 5-3 5-7.5 5-7.5-5-7.5-5z" />
        <circle cx="10" cy="10" r="2.2" />
        {shown && <path d="m4.5 15.5 11-11" strokeLinecap="round" />}
      </svg>
    </button>
  );
}
