"use client";

import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { categories } from "@/lib/helpdesk-data";
import { categoryLook } from "@/components/home/category-look";

type CategoryGridProps = {
  selected: string | null;
  onSelect: (id: string | null) => void;
  variant?: "cards" | "list" | "tiles" | "chips";
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

  if (variant === "chips") {
    return (
      <ul className="flex gap-2 overflow-x-auto pb-1 hf-scrollbar">
        {visibleCategories.map((category) => {
          const isSelected = selected === category.id;
          const look = categoryLook(category.id);
          return (
            <li key={category.id} className="shrink-0">
              <button
                type="button"
                aria-pressed={isSelected}
                onClick={() => onSelect(isSelected ? null : category.id)}
                className={cn(
                  "inline-flex min-h-10 items-center gap-2 rounded-full border py-1 pl-1 pr-3.5 text-[13px] font-extrabold outline-none transition-all focus-visible:ring-4 focus-visible:ring-primary/25",
                  isSelected
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground hover:-translate-y-0.5 hover:text-foreground"
                )}
              >
                <span
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full [&_svg]:h-4 [&_svg]:w-4",
                    isSelected ? "bg-white/20 text-white" : look.tile
                  )}
                >
                  {look.icon}
                </span>
                {category.label}
              </button>
            </li>
          );
        })}
      </ul>
    );
  }

  if (variant === "tiles") {
    return (
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {visibleCategories.map((category, index) => {
          const isSelected = selected === category.id;
          const look = categoryLook(category.id);
          const count = counts?.[category.id];
          return (
            <li
              key={category.id}
              className="hf-pop"
              style={{ animationDelay: `${0.05 + index * 0.04}s` }}
            >
              <button
                type="button"
                aria-pressed={isSelected}
                onClick={() => onSelect(isSelected ? null : category.id)}
                style={{ ["--cat" as string]: look.ink }}
                className={cn(
                  "hf-browse-card flex h-full w-full flex-col gap-4 rounded-[24px] border bg-card p-5 text-left shadow-sm outline-none focus-visible:ring-4 focus-visible:ring-primary/25",
                  isSelected
                    ? "border-primary ring-2 ring-primary/30"
                    : "border-border"
                )}
              >
                <span className="flex items-start justify-between gap-3">
                  <span
                    className={cn(
                      "hf-cat-icon flex h-14 w-14 items-center justify-center rounded-2xl shadow-sm [&_svg]:h-6 [&_svg]:w-6",
                      look.tile
                    )}
                  >
                    {look.icon}
                  </span>
                  {count !== undefined && (
                    <span
                      aria-hidden="true"
                      className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-extrabold text-muted-foreground"
                    >
                      {count} {count === 1 ? "guide" : "guides"}
                    </span>
                  )}
                </span>
                <span className="flex flex-1 flex-col gap-1">
                  <span className="text-lg font-extrabold leading-tight">
                    {category.label}
                  </span>
                  <span
                    aria-hidden="true"
                    className="text-[13px] font-semibold leading-snug text-muted-foreground"
                  >
                    {look.hint}
                  </span>
                </span>
                <span
                  aria-hidden="true"
                  className="flex items-center justify-between text-xs font-extrabold"
                  style={{
                    color: `color-mix(in srgb, ${look.ink} 70%, var(--foreground))`,
                  }}
                >
                  Explore guides
                  <span className="hf-browse-go flex h-8 w-8 items-center justify-center rounded-full bg-muted">
                    <ArrowRight className="h-4 w-4" />
                  </span>
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
