import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, Clock, Monitor } from "lucide-react";
import type { Issue } from "@/lib/issues";
import { normalizePlatform, platformSlug } from "@/lib/platform";
import { categoryLook } from "@/components/home/category-look";
import { cn } from "@/lib/utils";
import { RiskDot } from "@/components/risk-dot";
import { DifficultyMeter } from "@/components/difficulty-meter";
import { categories } from "@/lib/helpdesk-data";

const RISK_PILL: Record<string, string> = {
  Low: "bg-status-success/15 text-status-success",
  Medium: "bg-status-warning/15 text-status-warning",
  High: "bg-status-danger/15 text-status-danger",
};

type IssueCardProps = {
  issue: Issue;
  backParams?: string;
  children?: ReactNode;
  /** "rich" is the colourful card used on /browse. */
  variant?: "default" | "rich";
};

export function IssueCard({
  issue,
  backParams = "",
  children,
  variant = "default",
}: IssueCardProps) {
  const look = categoryLook(issue.category);
  const params = new URLSearchParams(backParams);
  const platform = normalizePlatform(params.get("platform"));
  if (platform) params.set("platform", platformSlug(platform));
  const query = params.toString();
  const href = `/issues/${issue.id}${query ? `?${query}` : ""}`;

  if (variant === "rich") {
    const categoryLabel =
      categories.find((category) => category.id === issue.category)?.label ??
      issue.category;
    return (
      <li className="relative">
        <Link
          href={href}
          style={{ ["--cat" as string]: look.ink }}
          className="hf-browse-card group flex h-full flex-col rounded-[24px] border border-border bg-card p-5 shadow-sm focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25"
        >
          <span
            aria-hidden
            className="absolute inset-x-0 top-0 h-1"
            style={{
              background: `linear-gradient(90deg, ${look.ink}, transparent)`,
            }}
          />
          <div className="flex items-start gap-3.5">
            <div
              className={cn(
                "hf-cat-icon flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl shadow-sm",
                look.tile
              )}
            >
              {look.icon}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className="text-[11px] font-extrabold uppercase tracking-wide"
                  style={{
                    color: `color-mix(in srgb, ${look.ink} 70%, var(--foreground))`,
                  }}
                >
                  {categoryLabel}
                </span>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10.5px] font-extrabold",
                    RISK_PILL[issue.risk] ?? "bg-muted text-muted-foreground"
                  )}
                >
                  {issue.risk} risk
                </span>
              </div>
              <h2 className="mt-1 text-[17px] font-extrabold leading-snug">
                {issue.title}
              </h2>
              <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                {issue.symptoms.join(" · ")}
              </p>
            </div>
          </div>

          <div className="mt-auto flex items-center justify-between gap-3 pt-5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-bold text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <DifficultyMeter level={issue.difficulty} />
                <span className="sr-only">Difficulty:</span> {issue.difficulty}
                /3
              </span>
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" aria-hidden />
                {issue.time}
              </span>
              <span className="inline-flex items-center gap-1">
                <Monitor className="h-3.5 w-3.5" aria-hidden />
                {issue.devices.length >= 4
                  ? "All devices"
                  : issue.devices.join(", ")}
              </span>
            </div>
            <span
              aria-hidden
              className="hf-browse-go flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-foreground"
            >
              <ArrowRight className="h-4 w-4" />
            </span>
          </div>
        </Link>
        {children}
      </li>
    );
  }

  return (
    <li className="relative">
      <Link
        href={href}
        className="hf-cat group flex h-full flex-col rounded-[24px] border border-border bg-card p-5 shadow-sm focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div
              className={cn(
                "hf-cat-icon flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl",
                look.tile
              )}
            >
              {look.icon}
            </div>
            <div>
              <h2 className="text-[17px] font-extrabold leading-snug">
                {issue.title}
              </h2>
              <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                {issue.symptoms.join(" · ")}
              </p>
            </div>
          </div>
          <div className="shrink-0">
            <RiskDot risk={issue.risk} />
          </div>
        </div>

        <div className="mt-auto flex flex-wrap items-center gap-2 pt-4 text-xs font-bold text-muted-foreground">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5">
            <DifficultyMeter level={issue.difficulty} />
            <span className="sr-only">Difficulty:</span> {issue.difficulty}/3
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5">
            <Clock className="h-3.5 w-3.5" aria-hidden />
            {issue.time}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5">
            <Monitor className="h-3.5 w-3.5" aria-hidden />
            {issue.devices.join(", ")}
          </span>
        </div>
      </Link>
      {children}
    </li>
  );
}
