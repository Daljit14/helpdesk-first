"use client";

import type { ReactNode, SyntheticEvent } from "react";
import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";

export function CollapsibleSection({
  id,
  title,
  summary,
  defaultOpen = false,
  children,
  className = "",
}: {
  id: string;
  title: string;
  summary?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const storageKey = `hf-admin-section:${id}`;
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    const stored = window.localStorage.getItem(storageKey);
    if (stored !== "open" && stored !== "closed") return;
    const timeout = window.setTimeout(() => setOpen(stored === "open"), 0);
    return () => window.clearTimeout(timeout);
  }, [storageKey]);

  function handleToggle(event: SyntheticEvent<HTMLDetailsElement>) {
    const nextOpen = event.currentTarget.open;
    setOpen(nextOpen);
    window.localStorage.setItem(storageKey, nextOpen ? "open" : "closed");
  }

  return (
    <details
      open={open}
      onToggle={handleToggle}
      className={`glass-strong ${className}`}
    >
      <summary
        onClick={() => {
          const nextOpen = !open;
          setOpen(nextOpen);
          window.localStorage.setItem(storageKey, nextOpen ? "open" : "closed");
        }}
        className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 [&::-webkit-details-marker]:hidden"
      >
        <span className="font-semibold">{title}</span>
        <span className="flex min-w-0 items-center gap-3 text-right text-sm text-muted-foreground">
          {summary && <span className="truncate">{summary}</span>}
          <ChevronDown
            className={`h-4 w-4 shrink-0 transition-transform ${
              open ? "rotate-180" : ""
            }`}
            aria-hidden
          />
        </span>
      </summary>
      <div className="border-t border-border p-5">{children}</div>
    </details>
  );
}
