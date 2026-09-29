import { LifeBuoy } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * HelpDesk First logo: a soft violet tile with a lifebuoy.
 * Decorative only; pair it with the visible name.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] bg-primary text-primary-foreground shadow-sm",
        className
      )}
    >
      <LifeBuoy className="h-5 w-5" strokeWidth={2.25} />
    </span>
  );
}

export function BrandName({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "font-heading text-lg font-bold tracking-tight text-foreground",
        className
      )}
    >
      HelpDesk First
    </span>
  );
}
