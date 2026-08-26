import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";
import { focusRingClass } from "@/components/ui/design-system";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger";
};

// Admin-theme confirm dialogs force the danger CTA over the variant palette.
export const adminDangerButtonClassName =
  "!border-[var(--sp-status-danger-strong)] !bg-[var(--sp-status-danger-strong)] !text-white hover:!border-[var(--sp-status-danger-strong)] hover:!bg-[var(--sp-status-danger-strong)]";

const variants = {
  primary:
    "border-[var(--sp-button-primary)] bg-[var(--sp-button-primary)] text-white hover:border-[var(--sp-button-primary-hover)] hover:bg-[var(--sp-button-primary-hover)]",
  secondary:
    "border-[var(--sp-border-subtle)] bg-[var(--sp-layer-01)] text-[var(--sp-text-primary)] hover:border-[var(--sp-border-strong)] hover:bg-[var(--sp-background)]",
  danger:
    "border-[var(--sp-editor-danger-border)] bg-[var(--sp-editor-danger-bg)] text-[var(--sp-editor-danger-text)] hover:border-[var(--sp-status-danger-strong)]"
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ className = "", variant = "secondary", ...props }, ref) {
  return (
    <button
      ref={ref}
      className={[
        // 44px touch reach (PR-2 / F-SP-4): min-h-9 = 36 visual + 4px hit
        // expansion per side. Width stays content-driven (text buttons clear
        // 44 with px-3); dialog button rows sit at gap-2+, so 4px per side
        // never crosses a sibling.
        "relative inline-flex min-h-9 items-center justify-center whitespace-nowrap border px-3 py-2 text-sm font-semibold leading-none transition-colors after:absolute after:-inset-y-1 after:inset-x-0",
        focusRingClass,
        "disabled:cursor-not-allowed disabled:border-[var(--sp-border-subtle)] disabled:bg-[var(--sp-surface-disabled)] disabled:text-[var(--sp-text-helper)]",
        variants[variant],
        className
      ].join(" ")}
      {...props}
    />
  );
});
