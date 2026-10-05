import type { Platform } from "@/lib/helpdesk-data";
import { filterIssues } from "@/lib/search";
import { IssueCard } from "./issue-card";
import { SearchAssist } from "./search-assist";

type IssueListProps = {
  query?: string;
  categoryId?: string | null;
  platform?: Platform | null;
  backParams?: string;
  forceNoResults?: boolean;
  variant?: "default" | "rich";
};

export function IssueList({
  query = "",
  categoryId = null,
  platform = null,
  backParams = "",
  forceNoResults = false,
  variant = "default",
}: IssueListProps) {
  const issues = forceNoResults
    ? []
    : filterIssues({ query, categoryId, platform });

  if (issues.length === 0) {
    if (!forceNoResults && query.trim().length >= 3) {
      return (
        <SearchAssist
          query={query}
          platform={platform}
          backParams={backParams}
        />
      );
    }

    return (
      <div className="flex flex-col items-center rounded-[28px] border-2 border-dashed border-border bg-card p-10 text-center">
        <span
          aria-hidden
          className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary text-2xl"
        >
          <span>🔍</span>
        </span>
        <p className="text-lg font-extrabold">No matching problems found.</p>
        <p className="mt-2 text-muted-foreground">
          Try a different search term, category, or platform filter.
        </p>
      </div>
    );
  }

  return (
    <ul
      className={
        variant === "rich"
          ? "grid gap-4 md:grid-cols-2 xl:grid-cols-3"
          : "grid gap-4 md:grid-cols-2"
      }
    >
      {issues.map((issue) => (
        <IssueCard
          key={issue.id}
          issue={issue}
          backParams={backParams}
          variant={variant}
        />
      ))}
    </ul>
  );
}
