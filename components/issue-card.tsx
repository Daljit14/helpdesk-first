import Link from "next/link";
import { createElement } from "react";
import type { ReactNode } from "react";
import { Clock, Monitor } from "lucide-react";
import type { Issue } from "@/lib/issues";
import { getCategoryIcon } from "@/components/category-icon";
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
  const href = `/issues/${issue.id}${backParams ? `?${backParams}` : ""}`;

  return (
    <li className="relative">
      <Link
        href={href}
        className="group block rounded-xl border border-border bg-card p-5 shadow-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="mt-1 rounded-lg bg-muted p-2 text-indigo-500">
              {createElement(Icon, { className: "h-5 w-5" })}
            </div>
            <div>
              <h2 className="text-lg font-semibold group-hover:underline">
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

        <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <DifficultyMeter level={issue.difficulty} />
            <span className="sr-only">Difficulty:</span> {issue.difficulty}/3
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="h-4 w-4" />
            {issue.time}
          </span>
          <span className="inline-flex items-center gap-1">
            <Monitor className="h-4 w-4" />
            {issue.devices.join(", ")}
          </span>
        </div>
      </Link>
      {children}
    </li>
  );
}
