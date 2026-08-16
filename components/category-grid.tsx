"use client";

import { Button } from "@/components/ui/button";
import { categories } from "@/lib/helpdesk-data";

type CategoryGridProps = {
  selected: string | null;
  onSelect: (id: string | null) => void;
};

export function CategoryGrid({ selected, onSelect }: CategoryGridProps) {
  return (
    <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
      {categories.map((category) => {
        const Icon = category.icon;
        const isSelected = selected === category.id;
        return (
          <li key={category.id}>
            <Button
              type="button"
              variant={isSelected ? "default" : "outline"}
              onClick={() => onSelect(isSelected ? null : category.id)}
              className="h-auto w-full flex-col gap-3 py-6 text-base"
              aria-pressed={isSelected}
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
