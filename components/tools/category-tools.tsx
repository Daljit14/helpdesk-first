"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { ArrowRight, Stethoscope } from "lucide-react";
import { cn } from "@/lib/utils";
import { CATALOG, catalogToolsForCategory } from "./tool-catalog";
import { ToolRenderer } from "./tool-renderer";

/**
 * "Check your device" section for a guide page: the self-check tools that
 * fit this guide's category, shown as tabs when there's more than one.
 */
export function CategoryTools({ category }: { category: string }) {
  const ids = catalogToolsForCategory(category);
  const [active, setActive] = useState<string>(ids[0]);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const current = ids.includes(active) ? active : ids[0];

  function onTabKey(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = -1;
    if (e.key === "ArrowRight") next = (index + 1) % ids.length;
    else if (e.key === "ArrowLeft")
      next = (index - 1 + ids.length) % ids.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = ids.length - 1;
    if (next < 0) return;
    e.preventDefault();
    setActive(ids[next]);
    tabRefs.current[next]?.focus();
  }

  const onSpeedTest = ids.includes("speed-test")
    ? () => {
        setActive("speed-test");
        tabRefs.current[ids.indexOf("speed-test")]?.focus();
      }
    : undefined;

  return (
    <section aria-labelledby="category-tools-heading" className="hf-rise mt-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-[0.12em] text-secondary-foreground">
            <Stethoscope className="h-3.5 w-3.5" aria-hidden />
            Self-check
          </p>
          <h2
            id="category-tools-heading"
            className="mt-2 text-2xl font-extrabold"
          >
            Check your device
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Quick tests that run right here in your browser — nothing is
            uploaded. If you still need help, copy the results into your ticket.
          </p>
        </div>
        <Link
          href="/tools"
          className="group inline-flex min-h-10 items-center gap-1 text-sm font-bold text-primary hover:underline"
        >
          All self-checks
          <ArrowRight
            className="h-4 w-4 transition-transform group-hover:translate-x-1"
            aria-hidden
          />
        </Link>
      </div>

      {ids.length > 1 && (
        <div
          role="tablist"
          aria-label="Self-check tools"
          className="mt-4 flex flex-wrap gap-2"
        >
          {ids.map((id, i) => {
            const meta = CATALOG[id];
            const Icon = meta.icon;
            const selected = id === current;
            return (
              <button
                key={id}
                ref={(el) => {
                  tabRefs.current[i] = el;
                }}
                type="button"
                role="tab"
                id={`category-tool-tab-${id}`}
                aria-selected={selected}
                aria-controls={`category-tool-panel-${id}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => setActive(id)}
                onKeyDown={(e) => onTabKey(e, i)}
                className={cn(
                  "inline-flex min-h-11 items-center gap-2 rounded-2xl border px-4 text-sm font-extrabold transition-[background-color,border-color,color,transform] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25",
                  selected
                    ? "border-primary bg-primary text-primary-foreground shadow-sm"
                    : "border-border bg-card text-foreground hover:-translate-y-0.5 hover:border-primary/40 hover:bg-secondary hover:text-secondary-foreground"
                )}
              >
                <Icon className="h-4 w-4" aria-hidden />
                {meta.label}
              </button>
            );
          })}
        </div>
      )}

      <div
        key={current}
        id={`category-tool-panel-${current}`}
        role={ids.length > 1 ? "tabpanel" : undefined}
        aria-labelledby={
          ids.length > 1 ? `category-tool-tab-${current}` : undefined
        }
        className="hf-swap mt-4"
      >
        <ToolRenderer id={current} onSpeedTest={onSpeedTest} />
      </div>
    </section>
  );
}
