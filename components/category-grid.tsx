"use client";

import { cn } from "@/lib/utils";
import { categories } from "@/lib/helpdesk-data";

type CategoryGridProps = {
  selected: string | null;
  onSelect: (id: string | null) => void;
  variant?: "cards" | "list";
  counts?: Record<string, number>;
};

export function CategoryGrid({
  selected,
  onSelect,
  variant = "cards",
  counts,
}: CategoryGridProps) {
  const isList = variant === "list";
  return (
    <ul
      className={
        isList
          ? "grid gap-1"
          : "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
      }
    >
      {categories.map((category) => {
        const Icon = category.icon;
        const isSelected = selected === category.id;
        return (
          <li key={category.id}>
            <button
              type="button"
              aria-pressed={isSelected}
              onClick={() => onSelect(isSelected ? null : category.id)}
              className={cn(
                isList
                  ? "flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring hover:bg-secondary"
                  : "glass glass-interactive flex min-h-32 w-full items-center gap-3 rounded-xl px-4 py-4 text-left text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-col sm:items-center sm:justify-center sm:gap-2 sm:text-center",
                isSelected &&
                  "border-foreground bg-foreground text-background hover:bg-foreground"
              )}
            >
              <span
                className={cn(
                  isList ? "shrink-0" : "rounded-full p-2 sm:p-3",
                  !isSelected && "text-primary"
                )}
              >
                <Icon
                  className={cn(isList ? "h-4 w-4" : "h-5 w-5 sm:h-6 sm:w-6")}
                  aria-hidden="true"
                />
              </span>
              <span className="min-w-0 flex-1 leading-tight">
                {category.label}
              </span>
              {!isList && counts && (
                <span
                  className={cn(
                    "text-sm font-normal",
                    isSelected ? "text-background/80" : "text-muted-foreground"
                  )}
                >
                  {counts[category.id] ?? 0}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
