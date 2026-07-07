import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
};

const variants = {
  primary:
    "border-[var(--sp-color-action-primary)] bg-[var(--sp-color-action-primary)] text-white hover:border-[var(--sp-color-action-primary-hover)] hover:bg-[var(--sp-color-action-primary-hover)] focus-visible:ring-orange-200",
  secondary:
    "border-slate-200 bg-white text-slate-900 hover:bg-slate-50 focus-visible:ring-slate-200",
  danger:
    "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 focus-visible:ring-rose-200",
  ghost:
    "border-white/15 bg-white/10 text-white hover:bg-white/15 focus-visible:ring-white/20"
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ className = "", variant = "secondary", ...props }, ref) {
  return (
    <button
      ref={ref}
      className={[
        "inline-flex min-h-9 items-center justify-center whitespace-nowrap rounded-lg border px-3 py-2 text-sm font-semibold leading-none transition active:scale-[0.98] active:duration-75 active:shadow-inner",
        "focus-visible:outline-none focus-visible:ring-4 disabled:cursor-not-allowed disabled:border-[var(--sp-color-border-subtle)] disabled:bg-[var(--sp-color-state-disabled)] disabled:text-[var(--sp-color-text-muted)]",
        variants[variant],
        className
      ].join(" ")}
      {...props}
    />
  );
});
