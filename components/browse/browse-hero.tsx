import type { ReactNode } from "react";
import { BookOpen, LayoutGrid, MonitorSmartphone } from "lucide-react";
import { categories } from "@/lib/helpdesk-data";
import { categoryLook } from "@/components/home/category-look";

/**
 * Gradient header for /browse: title, live counts, the search box (children)
 * and a decorative orbit of category icons on wide screens.
 */
export function BrowseHero({
  guideCount,
  platformCount,
  children,
}: {
  guideCount: number;
  platformCount: number;
  children: ReactNode;
}) {
  const orbit = categories.slice(0, 8);
  return (
    <section className="hf-browse-hero hf-rise relative overflow-hidden rounded-[32px] px-5 py-8 text-white shadow-[0_28px_60px_-30px_var(--primary)] sm:px-8 lg:py-10">
      <span
        aria-hidden
        className="hf-blob-a pointer-events-none absolute -right-20 -top-28 h-80 w-80 rounded-full bg-[radial-gradient(closest-side,rgb(255_255_255/0.25),transparent)]"
      />
      <span
        aria-hidden
        className="hf-blob-b pointer-events-none absolute -bottom-36 left-1/4 h-80 w-80 rounded-full bg-[radial-gradient(closest-side,rgb(255_214_248/0.35),transparent)]"
      />
      <div className="relative grid items-center gap-8 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/15 px-3 py-1 text-xs font-extrabold backdrop-blur">
            <BookOpen className="h-3.5 w-3.5" aria-hidden />
            Self-service guide library
          </p>
          <h1 className="mt-3 text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl">
            Browse solutions
          </h1>
          <p className="mt-3 max-w-xl text-[15px] font-semibold text-white/90 sm:text-base">
            Search issues, filter by category, or choose a platform to find
            Level-1 support guidance.
          </p>
          <div className="mt-5 flex flex-wrap gap-2 text-xs font-bold">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 backdrop-blur">
              <BookOpen className="h-3.5 w-3.5" aria-hidden />
              {guideCount} guides
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 backdrop-blur">
              <LayoutGrid className="h-3.5 w-3.5" aria-hidden />
              {categories.length} categories
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 backdrop-blur">
              <MonitorSmartphone className="h-3.5 w-3.5" aria-hidden />
              {platformCount} platforms
            </span>
          </div>
          <div className="mt-6">{children}</div>
        </div>

        {/* Decorative orbit of category icons */}
        <div
          aria-hidden
          className="relative mx-auto hidden h-[280px] w-[280px] xl:block"
        >
          <span className="absolute inset-6 rounded-full border border-dashed border-white/30" />
          <span className="absolute inset-[72px] rounded-full border border-white/20" />
          <span className="absolute inset-[108px] flex items-center justify-center rounded-full bg-white/20 shadow-[0_0_40px_rgb(255_255_255/0.35)] backdrop-blur">
            <BookOpen className="hf-bob h-8 w-8" />
          </span>
          <div className="hf-browse-orbit absolute inset-0">
            {orbit.map((category, index) => {
              const angle = (index / orbit.length) * Math.PI * 2;
              const x = 50 + Math.cos(angle) * 40;
              const y = 50 + Math.sin(angle) * 40;
              const look = categoryLook(category.id);
              return (
                <span
                  key={category.id}
                  className="absolute -translate-x-1/2 -translate-y-1/2"
                  style={{ left: `${x}%`, top: `${y}%` }}
                >
                  <span
                    className={`hf-browse-counter flex h-12 w-12 items-center justify-center rounded-2xl shadow-lg ring-2 ring-white/60 ${look.tile}`}
                  >
                    {look.icon}
                  </span>
                </span>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
