"use client";

import { Button } from "@/components/ui/button";
import { platforms, type Platform } from "@/lib/helpdesk-data";

type PlatformButtonsProps = {
  selected: Platform | null;
  onSelect: (platform: Platform | null) => void;
};

export function PlatformButtons({ selected, onSelect }: PlatformButtonsProps) {
  return (
    <div
      className="flex flex-wrap items-center justify-center gap-3"
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
          >
            {platform}
          </Button>
        );
      })}
    </div>
  );
}
