"use client";

import {
  Laptop,
  CircleHelp,
  Layers,
  Monitor,
  Smartphone,
  TabletSmartphone,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { platforms, type Platform } from "@/lib/helpdesk-data";
import { cn } from "@/lib/utils";

type PlatformButtonsProps = {
  selected: Platform | null;
  onSelect: (platform: Platform | null) => void;
  variant?: "buttons" | "list" | "pills";
};

const PLATFORM_ICON: Record<string, LucideIcon> = {
  Windows: Monitor,
  Mac: Laptop,
  iOS: Smartphone,
  Android: TabletSmartphone,
  Other: CircleHelp,
};

export function PlatformButtons({
  selected,
  onSelect,
  variant = "buttons",
}: PlatformButtonsProps) {
  if (variant === "pills") {
    return (
      <div
        className="flex gap-2 overflow-x-auto pb-1 hf-scrollbar"
        role="group"
        aria-label="Filter by platform"
      >
        <button
          type="button"
          onClick={() => onSelect(null)}
          aria-pressed={selected === null}
          className={cn(
            "inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-extrabold transition-all",
            selected === null
              ? "border-primary bg-primary text-primary-foreground shadow-[0_8px_20px_-10px_var(--primary)]"
              : "border-border bg-card text-muted-foreground hover:-translate-y-0.5 hover:border-primary/40 hover:text-foreground"
          )}
        >
          <Layers className="h-4 w-4" aria-hidden />
          All devices
        </button>
        {platforms.map((platform) => {
          const isSelected = selected === platform;
          const Icon = PLATFORM_ICON[platform] ?? CircleHelp;
          return (
            <button
              key={platform}
              type="button"
              onClick={() => onSelect(isSelected ? null : platform)}
              aria-pressed={isSelected}
              className={cn(
                "inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-extrabold transition-all",
                isSelected
                  ? "border-primary bg-primary text-primary-foreground shadow-[0_8px_20px_-10px_var(--primary)]"
                  : "border-border bg-card text-muted-foreground hover:-translate-y-0.5 hover:border-primary/40 hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4" aria-hidden />
              {platform}
            </button>
          );
        })}
      </div>
    );
  }
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
