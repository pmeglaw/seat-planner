import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

type ClassValue = string | false | null | undefined;

export function cx(...classes: ClassValue[]) {
  return classes.filter(Boolean).join(" ");
}

export const focusRingClass =
  "outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sp-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--sp-focus-offset-color)]";

const loadingSpinnerClass =
  "h-3.5 w-3.5 shrink-0 motion-safe:animate-spin rounded-full border-2 border-current border-t-transparent";

export type ButtonVariant = "primary" | "secondary" | "quiet" | "destructive";
export type ButtonSize = "small" | "medium";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
};

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    "border-[var(--sp-button-primary)] bg-[var(--sp-button-primary)] text-white hover:border-[var(--sp-button-primary-hover)] hover:bg-[var(--sp-button-primary-hover)] active:border-[var(--sp-button-primary-active)] active:bg-[var(--sp-button-primary-active)]",
  secondary:
    "border-[var(--sp-border-strong)] bg-[var(--sp-layer-02)] text-[var(--sp-text-primary)] hover:border-[var(--sp-button-primary)] hover:bg-[var(--sp-brand-subtle)] hover:text-[var(--sp-brand-deep)] active:border-[var(--sp-button-primary)] active:bg-[#F3D1B9]",
  quiet:
    "border-transparent bg-transparent text-[var(--sp-text-helper)] hover:bg-[var(--sp-layer-accent)] hover:text-[var(--sp-text-secondary)] active:bg-[var(--sp-neutral-strong)] active:text-[var(--sp-text-secondary)]",
  destructive:
    "border-[var(--sp-status-danger-strong)] bg-[var(--sp-status-danger-strong)] text-white hover:border-[var(--sp-status-danger-hover)] hover:bg-[var(--sp-status-danger-hover)] active:border-[var(--sp-status-danger-pressed)] active:bg-[var(--sp-status-danger-pressed)]"
};

const buttonLoadingVariants: Record<ButtonVariant, string> = {
  primary: "!border-[var(--sp-button-primary)] !bg-[var(--sp-button-primary)] !text-white",
  secondary: "!border-[var(--sp-border-strong)] !bg-[var(--sp-layer-02)] !text-[var(--sp-text-primary)]",
  quiet: "!border-transparent !bg-transparent !text-[var(--sp-text-helper)]",
  destructive: "!border-[var(--sp-status-danger-strong)] !bg-[var(--sp-status-danger-strong)] !text-white"
};

const buttonDisabledVariants: Record<ButtonVariant, string> = {
  primary:
    "disabled:border-[var(--sp-border-subtle)] disabled:bg-[var(--sp-surface-disabled)] disabled:text-[var(--sp-text-helper)]",
  secondary:
    "disabled:border-[var(--sp-border-subtle)] disabled:bg-[var(--sp-layer-accent)] disabled:text-[var(--sp-text-disabled)]",
  quiet: "disabled:border-transparent disabled:bg-transparent disabled:text-[var(--sp-neutral-muted)]",
  destructive:
    "disabled:border-[var(--sp-status-danger-border)] disabled:bg-[var(--sp-status-danger-border)] disabled:text-[var(--sp-status-danger-text)]"
};

const buttonSizes: Record<ButtonSize, string> = {
  small: "min-h-9 px-3 text-xs",
  medium: "min-h-11 px-4 text-sm"
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    children,
    className,
    disabled,
    leftIcon,
    loading = false,
    rightIcon,
    size = "medium",
    type = "button",
    variant = "secondary",
    ...props
  },
  ref
) {
  const isDisabled = disabled || loading;

  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      aria-busy={loading ? "true" : undefined}
      className={cx(
        "inline-flex max-w-full items-center justify-center gap-2 rounded-[var(--sp-radius-xl)] border text-center font-semibold leading-tight transition duration-sp-standard disabled:cursor-not-allowed",
        "active:translate-y-px",
        focusRingClass,
        buttonSizes[size],
        buttonVariants[variant],
        buttonDisabledVariants[variant],
        loading ? buttonLoadingVariants[variant] : null,
        className
      )}
      {...props}
    >
      {loading ? <span className={loadingSpinnerClass} aria-hidden="true" /> : leftIcon}
      <span>{children}</span>
      {!loading ? rightIcon : null}
    </button>
  );
});

export type IconButtonVariant = "neutral" | "primary" | "destructive";
export type IconButtonSize = "small" | "medium";

export type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label" | "children"> & {
  icon: ReactNode;
  label: string;
  loading?: boolean;
  size?: IconButtonSize;
  variant?: IconButtonVariant;
};

const iconButtonVariants: Record<IconButtonVariant, string> = {
  neutral:
    "border-[var(--sp-border-strong)] bg-[var(--sp-layer-02)] text-[var(--sp-text-secondary)] hover:border-[var(--sp-button-primary)] hover:bg-[var(--sp-brand-subtle)] hover:text-[var(--sp-brand-deep)]",
  primary:
    "border-[var(--sp-button-primary)] bg-[var(--sp-button-primary)] text-white hover:border-[var(--sp-button-primary-hover)] hover:bg-[var(--sp-button-primary-hover)]",
  destructive:
    "border-[var(--sp-status-danger-strong)] bg-[var(--sp-status-danger-surface)] text-[var(--sp-status-danger-text)] hover:border-[var(--sp-status-danger-strong)] hover:bg-[var(--sp-status-danger-strong)] hover:text-white"
};

const iconButtonLoadingVariants: Record<IconButtonVariant, string> = {
  neutral: "!border-[var(--sp-border-strong)] !bg-[var(--sp-layer-02)] !text-[var(--sp-text-secondary)]",
  primary: "!border-[var(--sp-button-primary)] !bg-[var(--sp-button-primary)] !text-white",
  destructive: "!border-[var(--sp-status-danger-strong)] !bg-[var(--sp-status-danger-strong)] !text-white"
};

const iconButtonSizes: Record<IconButtonSize, string> = {
  small: "min-h-10 min-w-10",
  medium: "min-h-11 min-w-11"
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { className, disabled, icon, label, loading = false, size = "medium", type = "button", variant = "neutral", ...props },
  ref
) {
  const isDisabled = disabled || loading;

  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      disabled={isDisabled}
      aria-busy={loading ? "true" : undefined}
      className={cx(
        "grid place-items-center rounded-[var(--sp-radius-xl)] border transition duration-sp-standard disabled:cursor-not-allowed disabled:border-[var(--sp-border-subtle)] disabled:bg-[var(--sp-layer-accent)] disabled:text-[var(--sp-text-disabled)]",
        "active:translate-y-px",
        focusRingClass,
        iconButtonSizes[size],
        iconButtonVariants[variant],
        loading ? iconButtonLoadingVariants[variant] : null,
        className
      )}
      {...props}
    >
      {loading ? <span className={loadingSpinnerClass} aria-hidden="true" /> : icon}
    </button>
  );
});

export type StatusBadgeTone =
  | "neutral"
  | "published"
  | "draft"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "readonly"
  | "blocked"
  | "pending";

export type StatusBadgeProps = {
  children: ReactNode;
  className?: string;
  icon?: ReactNode;
  tone?: StatusBadgeTone;
};

const statusBadgeTones: Record<StatusBadgeTone, string> = {
  neutral: "bg-[var(--sp-layer-accent)] text-[var(--sp-text-secondary)] ring-[var(--sp-border-subtle)]",
  published:
    "bg-[var(--sp-status-published-surface)] text-[var(--sp-status-published-text)] ring-[var(--sp-status-published-border)]",
  draft: "bg-[var(--sp-status-draft-surface)] text-[var(--sp-status-draft-text)] ring-[var(--sp-status-draft-border)]",
  success:
    "bg-[var(--sp-status-success-surface)] text-[var(--sp-status-success-text)] ring-[var(--sp-status-success-border)]",
  warning:
    "bg-[var(--sp-status-pending-surface)] text-[var(--sp-status-pending-text)] ring-[var(--sp-status-pending-border)]",
  danger: "bg-[var(--sp-status-danger-surface)] text-[var(--sp-status-danger-text)] ring-[var(--sp-status-danger-border)]",
  info: "bg-[var(--sp-status-neutral-surface)] text-[var(--sp-status-neutral-text)] ring-[var(--sp-status-neutral-border)]",
  readonly: "bg-[var(--sp-layer-01)] text-[var(--sp-text-helper)] ring-[var(--sp-border-subtle)]",
  blocked: "bg-[var(--sp-status-danger-surface)] text-[var(--sp-status-danger-text)] ring-[var(--sp-status-danger-border)]",
  pending: "bg-[var(--sp-status-neutral-surface)] text-[var(--sp-status-neutral-text)] ring-[var(--sp-status-neutral-border)]"
};

export function StatusBadge({ children, className, icon, tone = "neutral" }: StatusBadgeProps) {
  return (
    <span
      className={cx(
        "inline-flex min-h-7 items-center gap-1.5 rounded-[var(--sp-radius-full)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ring-1",
        statusBadgeTones[tone],
        className
      )}
    >
      {icon ? <span className="shrink-0" aria-hidden="true">{icon}</span> : null}
      <span>{children}</span>
    </span>
  );
}

export const markerStateClassRecipes = {
  available: "border-[#BEB4A8] bg-white text-[#070A0D]",
  assigned: "border-[#8E8276] bg-white text-[#070A0D]",
  selected: "border-[#D46A24] bg-[#171A1D] text-white ring-4 ring-[#D46A24]/35",
  searchResult: "border-[#D23F0A] bg-[#FBEAE1] text-[#9E2F06] ring-4 ring-[#F0B49A]",
  keyboardFocus: "border-[#070A0D] bg-white text-[#070A0D] ring-4 ring-[#D46A24]/45",
  draftModified: "border-[#3E6F72] bg-[#DCEDEA] text-[#244E50]",
  moveOrigin: "border-[#6E655A] bg-[#EFE9DF] text-[#353532] ring-4 ring-[#D8D0C5]",
  validDestination: "border-[#1D6E41] bg-[#DEF3E4] text-[#284C3B] ring-4 ring-[#A9D7B8]",
  invalidDestination: "border-[#B3232C] bg-[#FBE9EA] text-[#7E2F24] ring-4 ring-[#E8A5A9]",
  swapSource: "border-[#1D6E41] bg-[#DEF3E4] text-[#284C3B] ring-4 ring-[#A9D7B8]",
  swapTarget: "border-[#6E655A] bg-[#F1ECE4] text-[#353532] ring-4 ring-[#D8D0C5]",
  protectedOriginal: "border-[#696159] bg-[#E7E1D8] text-[#353532]",
  customSeat: "border-[#D46A24] bg-[#F6E7D8] text-[#6F2C13]",
  reserved: "border-[#3E6F72] bg-[#DCEDEA] text-[#244E50]",
  unavailable: "border-[#BEB4A8] bg-[#E7E1D8] text-[#696159]",
  plannerHighlight: "border-[#6E655A] bg-[#EFE9DF] text-[#353532] ring-4 ring-[#D8D0C5]"
} as const;

export type MarkerStateRecipe = keyof typeof markerStateClassRecipes;
