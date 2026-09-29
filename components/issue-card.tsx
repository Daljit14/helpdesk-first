import Link from "next/link";
import { createElement } from "react";
import type { ReactNode } from "react";
import { Clock, Monitor } from "lucide-react";
import type { Issue } from "@/lib/issues";
import { normalizePlatform, platformSlug } from "@/lib/platform";
import { getCategoryIcon, getCategoryTone } from "@/components/category-icon";
import { RiskDot } from "@/components/risk-dot";
import { DifficultyMeter } from "@/components/difficulty-meter";

type IssueCardProps = {
  issue: Issue;
  backParams?: string;
  children?: ReactNode;
};

export function IssueCard({
  issue,
  backParams = "",
  children,
}: IssueCardProps) {
  const Icon = getCategoryIcon(issue.category);
  const params = new URLSearchParams(backParams);
  const platform = normalizePlatform(params.get("platform"));
  if (platform) params.set("platform", platformSlug(platform));
  const query = params.toString();
  const href = `/issues/${issue.id}${query ? `?${query}` : ""}`;

  return (
    <li className="relative">
      <Link
        href={href}
        className="glass glass-interactive group flex h-full flex-col p-5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${getCategoryTone(issue.category)}`}
            >
              {createElement(Icon, {
                className: "h-5 w-5",
                "aria-hidden": true,
              })}
            </div>
            <div>
              <h2 className="text-lg font-semibold leading-snug decoration-primary/40 decoration-2 underline-offset-4 group-hover:underline">
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

        <div className="mt-auto flex flex-wrap items-center gap-2 pt-4 text-xs font-medium text-muted-foreground">
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
