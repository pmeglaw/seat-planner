import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";
import { focusRingClass } from "@/components/ui/design-system";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger";
  /**
   * Carbon inline-loading (PR-5, AUDIT-2 §8.1): a 16px leading spinner while
   * the confirming action is in flight. Implies disabled + aria-busy; the
   * caller still swaps the label to its present participle ("Vacating…").
   */
  loading?: boolean;
};

// Admin-theme confirm dialogs force the danger CTA over the variant palette.
export const adminDangerButtonClassName =
  "!border-[var(--sp-status-error-mark)] !bg-[var(--sp-status-error-mark)] !text-white hover:!border-[var(--sp-status-error-mark)] hover:!bg-[var(--sp-status-error-mark)]";

const variants = {
  primary:
    "border-[var(--sp-button-primary)] bg-[var(--sp-button-primary)] text-white hover:border-[var(--sp-button-primary-hover)] hover:bg-[var(--sp-button-primary-hover)]",
  secondary:
    "border-[var(--sp-border-subtle)] bg-[var(--sp-layer-01)] text-[var(--sp-text-primary)] hover:border-[var(--sp-border-strong)] hover:bg-[var(--sp-background)]",
  danger:
    "border-[var(--sp-editor-danger-border)] bg-[var(--sp-editor-danger-bg)] text-[var(--sp-editor-danger-text)] hover:border-[var(--sp-status-error-mark)]"
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className = "", variant = "secondary", loading = false, disabled, children, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading ? "true" : undefined}
      className={[
        // 44px touch reach (PR-2 / F-SP-4): min-h-9 = 36 visual + 4px hit
        // expansion per side. Width stays content-driven (text buttons clear
        // 44 with px-3); dialog button rows sit at gap-2+, so 4px per side
        // never crosses a sibling.
        "relative inline-flex min-h-9 items-center justify-center gap-2 whitespace-nowrap border px-3 py-2 text-sm font-semibold leading-none transition-colors after:absolute after:-inset-y-1 after:inset-x-0",
        focusRingClass,
        "disabled:cursor-not-allowed disabled:border-[var(--sp-border-subtle)] disabled:bg-[var(--sp-button-disabled)] disabled:text-[var(--sp-text-helper)]",
        variants[variant],
        className
      ].join(" ")}
      {...props}
    >
      {loading ? (
        <span
          aria-hidden="true"
          className="h-4 w-4 shrink-0 rounded-full border-2 border-current border-t-transparent motion-safe:animate-spin"
        />
      ) : null}
      {children}
    </button>
  );
});
