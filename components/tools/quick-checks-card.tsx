import Link from "next/link";
import { ArrowRight, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { TOOLS, type ToolId } from "./tool-registry";

const QUICK: Array<{ id: ToolId; tint: string }> = [
  { id: "speed-test", tint: "bg-[linear-gradient(135deg,#22d3ee,#7c5cff)]" },
  { id: "camera", tint: "bg-[linear-gradient(135deg,#7c5cff,#d946ef)]" },
  { id: "microphone", tint: "bg-[linear-gradient(135deg,#f472b6,#fb923c)]" },
  { id: "device", tint: "bg-[linear-gradient(135deg,#14b8a6,#3b82f6)]" },
];

/** Compact home-page card: one-tap links into the Toolkit. */
export function QuickChecksCard({ className }: { className?: string }) {
  return (
    <section
      aria-labelledby="quick-checks-heading"
      className={cn(
        "relative flex flex-col gap-4 overflow-hidden rounded-[28px] border border-border bg-card p-6 shadow-sm",
        className
      )}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute -bottom-12 -right-12 h-36 w-36 rounded-full bg-[radial-gradient(closest-side,rgb(34_211_238/0.22),transparent)]"
      />
      <div className="relative">
        <h2 id="quick-checks-heading" className="text-base font-extrabold">
          Quick self-checks
        </h2>
        <p className="mt-0.5 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
          <Lock className="h-3.5 w-3.5" aria-hidden />
          One tap, right in your browser.
        </p>
      </div>
      <ul className="relative grid grid-cols-2 gap-2.5">
        {QUICK.map(({ id, tint }, i) => {
          const meta = TOOLS[id];
          const Icon = meta.icon;
          return (
            <li
              key={id}
              className="hf-pop"
              style={{ animationDelay: `${0.1 + i * 0.07}s` }}
            >
              <Link
                href={`/tools#${id}`}
                className="hf-tool-tile group flex h-full items-center gap-2.5 rounded-2xl border border-border bg-surface p-2.5 text-sm font-extrabold transition-[transform,border-color] hover:-translate-y-0.5 hover:border-primary/40"
              >
                <span
                  className={cn(
                    "hf-tool-tile-icon flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white shadow-sm",
                    tint
                  )}
                >
                  <Icon className="h-[18px] w-[18px]" aria-hidden />
                </span>
                <span className="min-w-0 leading-tight">{meta.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
      <Link
        href="/tools"
        className="group relative inline-flex min-h-10 items-center gap-1 self-start rounded-lg text-sm font-bold text-primary hover:underline"
      >
        Open Toolkit
        <ArrowRight
          className="h-4 w-4 transition-transform group-hover:translate-x-1"
          aria-hidden
        />
      </Link>
    </section>
  );
}
