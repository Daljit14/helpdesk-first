import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type BadgeVariant = "neutral" | "success" | "warning" | "danger" | "info";

const variantClasses: Record<BadgeVariant, string> = {
  neutral: "border-transparent bg-muted text-foreground",
  success:
    "border-transparent bg-[color-mix(in_srgb,var(--status-success)_15%,transparent)] text-[color-mix(in_srgb,var(--status-success)_80%,var(--foreground))]",
  warning:
    "border-transparent bg-[color-mix(in_srgb,var(--status-warning)_15%,transparent)] text-[color-mix(in_srgb,var(--status-warning)_80%,var(--foreground))]",
  danger:
    "border-transparent bg-[color-mix(in_srgb,var(--status-danger)_15%,transparent)] text-[color-mix(in_srgb,var(--status-danger)_80%,var(--foreground))]",
  info: "border-transparent bg-[color-mix(in_srgb,var(--status-info)_15%,transparent)] text-[color-mix(in_srgb,var(--status-info)_80%,var(--foreground))]",
};

export function Badge({
  className,
  variant = "neutral",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold",
        variantClasses[variant],
        className
      )}
      {...props}
    />
  );
}
