import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon,
  title,
  description,
  actions,
  className,
  headingLevel = 2,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
  headingLevel?: 1 | 2 | 3;
}) {
  const Heading = `h${headingLevel}` as const;
  return (
    <section
      className={cn(
        "rounded-xl border border-dashed border-border bg-card p-8 text-center",
        className
      )}
    >
      {Icon && (
        <Icon className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden />
      )}
      <Heading className="mt-3 text-lg font-semibold">{title}</Heading>
      {description && (
        <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
          {description}
        </p>
      )}
      {actions && (
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          {actions}
        </div>
      )}
    </section>
  );
}
