"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { platforms, type Platform } from "@/lib/helpdesk-data";

export function PlatformButtons() {
  const [selected, setSelected] = useState<Platform | null>(null);

  return (
    <div
      className="flex flex-wrap items-center justify-center gap-3"
      role="group"
      aria-label="Filter by platform"
    >
      {platforms.map((platform) => (
        <Button
          key={platform}
          type="button"
          variant={selected === platform ? "default" : "outline"}
          onClick={() => setSelected(selected === platform ? null : platform)}
          aria-pressed={selected === platform}
        >
          {platform}
        </Button>
      ))}
    </div>
  );
}
