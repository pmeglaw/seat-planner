import type { ButtonHTMLAttributes } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
};

const variants = {
  primary:
    "border-brand bg-brand text-white hover:border-brand-dark hover:bg-brand-dark focus-visible:ring-orange-200",
  secondary:
    "border-slate-200 bg-white text-slate-900 hover:bg-slate-50 focus-visible:ring-slate-200",
  danger:
    "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 focus-visible:ring-rose-200",
  ghost:
    "border-white/15 bg-white/10 text-white hover:bg-white/15 focus-visible:ring-white/20"
};

export function Button({ className = "", variant = "secondary", ...props }: ButtonProps) {
  return (
    <button
      className={[
        "inline-flex min-h-9 items-center justify-center whitespace-nowrap rounded-xl border px-3 py-2 text-sm font-semibold leading-none transition",
        "focus-visible:outline-none focus-visible:ring-4 disabled:cursor-not-allowed disabled:opacity-50",
        variants[variant],
        className
      ].join(" ")}
      {...props}
    />
  );
}
