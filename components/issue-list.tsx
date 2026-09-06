import type { Platform } from "@/lib/helpdesk-data";
import { filterIssues } from "@/lib/search";
import { IssueCard } from "./issue-card";

type IssueListProps = {
  query?: string;
  categoryId?: string | null;
  platform?: Platform | null;
  backParams?: string;
};

export function IssueList({
  query = "",
  categoryId = null,
  platform = null,
  backParams = "",
}: IssueListProps) {
  const issues = filterIssues({ query, categoryId, platform });

  if (issues.length === 0) {
    return (
      <div className="glass-strong p-8 text-center">
        <p className="text-lg font-medium">No matching problems found.</p>
        <p className="mt-2 text-muted-foreground">
          Try a different search term, category, or platform filter.
        </p>
      </div>
    );
  }

  return (
    <ul className="grid gap-4">
      {issues.map((issue) => (
        <IssueCard key={issue.id} issue={issue} backParams={backParams} />
      ))}
    </ul>
  );
}
