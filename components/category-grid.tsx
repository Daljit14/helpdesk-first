"use client";

import { cn } from "@/lib/utils";
import { categories } from "@/lib/helpdesk-data";

type CategoryGridProps = {
  selected: string | null;
  onSelect: (id: string | null) => void;
};

export function CategoryGrid({ selected, onSelect }: CategoryGridProps) {
  return (
    <ul className="grid grid-cols-1 gap-2 min-[400px]:grid-cols-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4">
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
                "glass glass-interactive flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring",
                "sm:flex-col sm:items-center sm:justify-center sm:gap-2 sm:py-5 sm:text-center",
                isSelected &&
                  "border-foreground bg-foreground text-background hover:bg-foreground"
              )}
            >
              <span
                className={cn(
                  "rounded-full p-2 sm:p-3",
                  isSelected ? "bg-background/15" : "bg-primary/10 text-primary"
                )}
              >
                <Icon className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden="true" />
              </span>
              <span className="leading-tight">{category.label}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
