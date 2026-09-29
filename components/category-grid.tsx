"use client";

import { cn } from "@/lib/utils";
import { categories } from "@/lib/helpdesk-data";
import { getCategoryTone } from "@/components/category-icon";

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
                  ? "flex min-h-11 w-full items-center gap-3 rounded-full px-3 py-2 text-left text-sm font-semibold outline-none focus-visible:ring-4 focus-visible:ring-primary/25 hover:bg-muted"
                  : "glass glass-interactive flex min-h-32 w-full items-center gap-3 px-4 py-4 text-left text-sm font-semibold outline-none focus-visible:ring-4 focus-visible:ring-primary/25 sm:flex-col sm:items-start sm:justify-between sm:gap-3 sm:p-5",
                isSelected &&
                  "border-primary bg-primary text-primary-foreground hover:bg-primary"
              )}
            >
              <span
                className={cn(
                  isList
                    ? cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl",
                        isSelected
                          ? "bg-primary text-primary-foreground"
                          : getCategoryTone(category.id)
                      )
                    : cn(
                        "flex h-11 w-11 items-center justify-center rounded-2xl",
                        isSelected
                          ? "bg-primary-foreground/20 text-primary-foreground"
                          : getCategoryTone(category.id)
                      )
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
                    isSelected
                      ? "text-primary-foreground/80"
                      : "text-muted-foreground"
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
