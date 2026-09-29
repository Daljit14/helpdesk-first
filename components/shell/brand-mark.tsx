import { LifeBuoy } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * HelpDesk First logo: a soft violet tile with a lifebuoy and a small
 * marigold "all good" dot. Decorative only; pair it with the visible name.
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
      <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-card bg-highlight" />
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
