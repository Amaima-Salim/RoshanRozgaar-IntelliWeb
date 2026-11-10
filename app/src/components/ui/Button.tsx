import { Slot } from "@radix-ui/react-slot";
import { LoaderCircle } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

export type ButtonVariant = "primary" | "secondary" | "outline" | "accent" | "danger";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-primary text-on-primary hover:bg-primary-strong",
  secondary: "bg-primary-soft text-primary-strong hover:bg-primary-soft/70",
  outline: "border-2 border-primary bg-surface text-primary hover:bg-primary-soft",
  accent: "bg-accent text-text hover:brightness-95",
  danger: "bg-danger text-on-primary hover:brightness-95",
};

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  /** Main label in the current language. */
  label: ReactNode;
  /** Small caption in the other language (key actions are bilingual, docs/03 §4). */
  caption?: ReactNode;
  icon?: ReactNode;
  variant?: ButtonVariant;
  size?: "md" | "lg";
  loading?: boolean;
  /** Shown under the button when disabled, so the reason is never hidden (docs/03 §4). */
  disabledReason?: string;
  fullWidth?: boolean;
  /** Render the child element (e.g. a Link) with button styling. */
  asChild?: boolean;
  children?: ReactNode;
};

export function Button({
  label,
  caption,
  icon,
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  disabledReason,
  fullWidth,
  asChild,
  className,
  children,
  type = "button",
  ...rest
}: Props) {
  const isDisabled = disabled || loading;
  const Comp = asChild ? Slot : "button";
  const content = (
    <>
      <span
        aria-hidden={loading || undefined}
        className={cn("flex items-center gap-2", loading && "invisible")}
      >
        {icon}
        <span className="flex flex-col items-center leading-tight">
          <span className="text-base font-semibold">{label}</span>
          {caption ? (
            <span dir="auto" className="text-xs font-normal">
              {caption}
            </span>
          ) : null}
        </span>
      </span>
      {loading ? (
        <>
          <LoaderCircle aria-hidden className="absolute size-6 animate-spin" />
          {/* The visible label is hidden while loading; keep the accessible name. */}
          <span className="sr-only">{label}</span>
        </>
      ) : null}
    </>
  );
  const reasonId = disabledReason && rest.id ? `${rest.id}-reason` : undefined;
  return (
    <span className={cn("inline-flex flex-col gap-1", fullWidth && "w-full")}>
      <Comp
        {...(!asChild && { type, disabled: isDisabled })}
        aria-busy={loading || undefined}
        aria-disabled={isDisabled || undefined}
        aria-describedby={isDisabled && reasonId ? reasonId : undefined}
        className={cn(
          "relative inline-flex items-center justify-center rounded-lg px-5 transition-colors",
          "disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed",
          size === "lg" ? "min-h-button-lg" : "min-h-14",
          fullWidth && "w-full",
          variants[variant],
          className,
        )}
        {...rest}
      >
        {asChild ? children : content}
      </Comp>
      {isDisabled && disabledReason && !loading ? (
        <span id={reasonId} className="text-sm text-text-muted">
          {disabledReason}
        </span>
      ) : null}
    </span>
  );
}
