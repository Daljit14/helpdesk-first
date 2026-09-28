import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type BadgeVariant = "neutral" | "success" | "warning" | "danger" | "info";

const variantClasses: Record<BadgeVariant, string> = {
  neutral: "border-border bg-secondary text-secondary-foreground",
  success:
    "border-[var(--status-success)]/40 bg-[var(--status-success)] text-[var(--status-success-foreground)]",
  warning:
    "border-[var(--status-warning)]/40 bg-[var(--status-warning)] text-[var(--status-warning-foreground)]",
  danger:
    "border-[var(--status-danger)]/40 bg-[var(--status-danger)] text-[var(--status-danger-foreground)]",
  info: "border-[var(--status-info)]/40 bg-[var(--status-info)] text-[var(--status-info-foreground)]",
};

export function Badge({
  className,
  variant = "neutral",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium",
        variantClasses[variant],
        className
      )}
      {...props}
    />
  );
}
