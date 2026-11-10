import { Check } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  icon: ReactNode;
  label: ReactNode;
  caption?: ReactNode;
  selected?: boolean;
};

/** Icon + bilingual label, used instead of form fields. Selection never relies on colour alone. */
export function Tile({
  icon,
  label,
  caption,
  selected = false,
  className,
  type = "button",
  ...rest
}: Props) {
  return (
    <button
      type={type}
      aria-pressed={selected}
      className={cn(
        "relative flex min-h-28 flex-col items-center justify-center gap-2 rounded-lg border-2 bg-surface p-3 text-center",
        "transition-colors hover:bg-primary-soft/50",
        selected ? "border-[3px] border-primary bg-primary-soft" : "border-border",
        className,
      )}
      {...rest}
    >
      {selected ? (
        <span className="absolute end-2 top-2 rounded-pill bg-primary p-0.5 text-on-primary">
          <Check aria-hidden className="size-4" />
        </span>
      ) : null}
      <span aria-hidden className="text-primary [&_svg]:size-9">
        {icon}
      </span>
      <span className="font-semibold leading-tight">{label}</span>
      {caption ? (
        <span dir="auto" className="text-xs text-text-muted">
          {caption}
        </span>
      ) : null}
    </button>
  );
}
