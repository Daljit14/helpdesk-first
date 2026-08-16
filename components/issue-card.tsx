import Link from "next/link";
import { Clock, Gauge, ShieldAlert, ShieldCheck } from "lucide-react";
import { type Issue } from "@/lib/knowledge-base";

type IssueCardProps = {
  issue: Issue;
  backParams?: string;
};

export function IssueCard({ issue, backParams = "" }: IssueCardProps) {
  const riskColor =
    issue.riskLevel === "High"
      ? "text-destructive"
      : issue.riskLevel === "Medium"
        ? "text-amber-600"
        : "text-emerald-600";

  const href = `/issues/${issue.slug}${backParams ? `?${backParams}` : ""}`;

  return (
    <li>
      <Link
        href={href}
        className="group block rounded-xl border border-border bg-background p-5 shadow-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold group-hover:underline">
              {issue.title}
            </h3>
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
              {issue.symptoms.join(" · ")}
            </p>
          </div>
          <span
            className={`inline-flex items-center gap-1 text-sm font-medium ${riskColor}`}
          >
            {issue.riskLevel === "Low" ? (
              <ShieldCheck className="h-4 w-4" />
            ) : (
              <ShieldAlert className="h-4 w-4" />
            )}
            {issue.riskLevel} risk
          </span>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Gauge className="h-4 w-4" />
            {issue.difficulty}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="h-4 w-4" />
            {issue.estimatedTimeMinutes} min
          </span>
          <span className="inline-flex items-center gap-1">
            {issue.platforms.join(", ")}
          </span>
        </div>
      </Link>
    </li>
  );
}
