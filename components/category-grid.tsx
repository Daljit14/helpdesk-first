"use client";

import { Button } from "@/components/ui/button";
import { categories } from "@/lib/helpdesk-data";

type CategoryGridProps = {
  query?: string;
};

export function CategoryGrid({ query = "" }: CategoryGridProps) {
  const normalizedQuery = query.trim().toLowerCase();
  const visible = normalizedQuery
    ? categories.filter((category) =>
        category.label.toLowerCase().includes(normalizedQuery)
      )
    : categories;

  return (
    <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
      {visible.map((category) => {
        const Icon = category.icon;
        return (
          <li key={category.id}>
            <Button
              variant="outline"
              className="h-auto w-full flex-col gap-3 py-6 text-base"
            >
              <Icon className="h-8 w-8" aria-hidden="true" />
              {category.label}
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
