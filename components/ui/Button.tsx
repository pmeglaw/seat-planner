import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";
import { focusRingClass } from "@/components/ui/design-system";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger";
};

// Admin-theme confirm dialogs force the danger CTA over the variant palette.
export const adminDangerButtonClassName =
  "!border-[var(--admin-danger)] !bg-[var(--admin-danger)] !text-white hover:!border-[var(--admin-danger)] hover:!bg-[var(--admin-danger)]";

const variants = {
  primary:
    "border-[var(--sp-color-action-primary)] bg-[var(--sp-color-action-primary)] text-white hover:border-[var(--sp-color-action-primary-hover)] hover:bg-[var(--sp-color-action-primary-hover)]",
  secondary:
    "border-[var(--admin-border)] bg-[var(--admin-surface)] text-[var(--admin-text-primary)] hover:border-[var(--admin-border-strong)] hover:bg-[var(--admin-surface-alt)]",
  danger:
    "border-[var(--admin-state-danger-border)] bg-[var(--admin-state-danger-bg)] text-[var(--admin-state-danger-text)] hover:border-[var(--admin-danger)]"
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ className = "", variant = "secondary", ...props }, ref) {
  return (
    <button
      ref={ref}
      className={[
        "inline-flex min-h-9 items-center justify-center whitespace-nowrap border px-3 py-2 text-sm font-semibold leading-none transition-colors",
        focusRingClass,
        "disabled:cursor-not-allowed disabled:border-[var(--sp-color-border-subtle)] disabled:bg-[var(--sp-color-state-disabled)] disabled:text-[var(--sp-color-text-muted)]",
        variants[variant],
        className
      ].join(" ")}
      {...props}
    />
  );
});
