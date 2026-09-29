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
        "hf-rise rounded-[28px] border-2 border-dashed border-border bg-card px-6 py-10 text-center",
        className
      )}
    >
      {Icon && (
        <span className="hf-bob mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary text-secondary-foreground">
          <Icon className="h-7 w-7" aria-hidden />
        </span>
      )}
      <Heading className="mt-4 text-xl font-extrabold">{title}</Heading>
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
