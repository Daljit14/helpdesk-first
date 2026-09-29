"use client";

import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { categories } from "@/lib/helpdesk-data";
import { categoryLook } from "@/components/home/category-look";

type CategoryGridProps = {
  selected: string | null;
  onSelect: (id: string | null) => void;
  variant?: "cards" | "list";
  counts?: Record<string, number>;
  limit?: number;
};

export function CategoryGrid({
  selected,
  onSelect,
  variant = "cards",
  counts,
  limit,
}: CategoryGridProps) {
  const visibleCategories = limit ? categories.slice(0, limit) : categories;
  if (variant === "list") {
    return (
      <ul className="grid gap-1">
        {visibleCategories.map((category) => {
          const Icon = category.icon;
          const isSelected = selected === category.id;
          const look = categoryLook(category.id);
          return (
            <li key={category.id}>
              <button
                type="button"
                aria-pressed={isSelected}
                onClick={() => onSelect(isSelected ? null : category.id)}
                className={cn(
                  "hf-navlink flex min-h-11 w-full items-center gap-3 rounded-xl px-2.5 py-1.5 text-left text-sm font-semibold outline-none focus-visible:ring-4 focus-visible:ring-primary/20",
                  isSelected
                    ? "bg-secondary text-secondary-foreground"
                    : "hover:bg-muted"
                )}
              >
                <span
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]",
                    look.tile
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1 leading-tight">
                  {category.label}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {visibleCategories.map((category, index) => {
        const isSelected = selected === category.id;
        const look = categoryLook(category.id);
        return (
          <li
            key={category.id}
            className="hf-pop"
            style={{ animationDelay: `${0.1 + index * 0.05}s` }}
          >
            <button
              type="button"
              aria-pressed={isSelected}
              onClick={() => onSelect(isSelected ? null : category.id)}
              className={cn(
                "hf-cat flex h-full w-full flex-col gap-3 rounded-[18px] border bg-card p-4 text-left outline-none focus-visible:ring-4 focus-visible:ring-primary/25",
                isSelected ? "border-primary" : "border-border"
              )}
            >
              <span className="flex items-center justify-between">
                <span
                  className={cn(
                    "hf-cat-icon flex h-[42px] w-[42px] items-center justify-center rounded-[13px]",
                    look.tile
                  )}
                >
                  {look.icon}
                </span>
                <ArrowRight
                  className="hf-cat-arrow h-4 w-4 text-primary"
                  aria-hidden
                />
              </span>
              <span className="flex flex-col gap-0.5">
                <span className="text-[15px] font-extrabold">
                  {category.label}
                </span>
                <span
                  aria-hidden="true"
                  className="text-xs font-semibold text-muted-foreground"
                >
                  {look.hint}
                  {counts ? ` · ${counts[category.id] ?? 0} guides` : ""}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
