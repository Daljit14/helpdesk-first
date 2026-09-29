import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type BadgeVariant = "neutral" | "success" | "warning" | "danger" | "info";

const variantClasses: Record<BadgeVariant, string> = {
  neutral: "border-transparent bg-muted text-foreground",
  success:
    "border-transparent bg-[color-mix(in_srgb,var(--status-success)_14%,transparent)] text-[color-mix(in_srgb,var(--status-success)_78%,var(--foreground))]",
  warning:
    "border-transparent bg-[color-mix(in_srgb,var(--status-warning)_14%,transparent)] text-[color-mix(in_srgb,var(--status-warning)_78%,var(--foreground))]",
  danger:
    "border-transparent bg-[color-mix(in_srgb,var(--status-danger)_14%,transparent)] text-[color-mix(in_srgb,var(--status-danger)_78%,var(--foreground))]",
  info: "border-transparent bg-[color-mix(in_srgb,var(--status-info)_14%,transparent)] text-[color-mix(in_srgb,var(--status-info)_78%,var(--foreground))]",
};

export function Badge({
  className,
  variant = "neutral",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold",
        variantClasses[variant],
        className
      )}
      {...props}
    />
  );
}
