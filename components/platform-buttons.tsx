"use client";

import { Button } from "@/components/ui/button";
import { platforms, type Platform } from "@/lib/helpdesk-data";

type PlatformButtonsProps = {
  selected: Platform | null;
  onSelect: (platform: Platform | null) => void;
  variant?: "buttons" | "list";
};

export function PlatformButtons({
  selected,
  onSelect,
  variant = "buttons",
}: PlatformButtonsProps) {
  return (
    <div
      className={variant === "list" ? "grid gap-1" : "flex flex-wrap gap-3"}
      role="group"
      aria-label="Filter by platform"
    >
      {platforms.map((platform) => {
        const isSelected = selected === platform;
        return (
          <Button
            key={platform}
            type="button"
            variant={isSelected ? "default" : "outline"}
            onClick={() => onSelect(isSelected ? null : platform)}
            aria-pressed={isSelected}
            className={
              variant === "list" ? "min-h-11 w-full justify-start" : ""
            }
          >
            {platform}
          </Button>
        );
      })}
    </div>
  );
}
