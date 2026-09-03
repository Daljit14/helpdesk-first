"use client";

import { useSyncExternalStore } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  clearRecentlyViewed,
  getRecentlyViewed,
  removeRecentlyViewed,
  subscribeToRecentlyViewed,
} from "@/lib/recent";
import { getIssueBySlug } from "@/lib/search";
import { IssueCard } from "@/components/issue-card";
import type { Issue } from "@/lib/issues";

const EMPTY_RECENT: string[] = [];

export function RecentlyViewed() {
  const recentIds = useSyncExternalStore(
    subscribeToRecentlyViewed,
    getRecentlyViewed,
    () => EMPTY_RECENT
  );
  const issues = recentIds
    .map((id) => getIssueBySlug(id))
    .filter((issue): issue is Issue => Boolean(issue));

  if (issues.length === 0) return null;

  return (
    <section className="mt-8" aria-labelledby="recently-viewed-heading">
      <div className="flex items-center justify-between">
        <h2 id="recently-viewed-heading" className="text-lg font-semibold">
          Recently viewed
        </h2>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={clearRecentlyViewed}
          aria-label="Clear recently viewed"
        >
          Clear
        </Button>
      </div>
      <ul className="mt-3 grid gap-4 sm:grid-cols-2">
        {issues.map((issue) => (
          <IssueCard key={issue.id} issue={issue}>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-2 top-2 z-10 h-7 w-7"
              onClick={() => removeRecentlyViewed(issue.id)}
              aria-label={`Remove ${issue.title} from recently viewed`}
            >
              <X className="h-4 w-4" />
            </Button>
          </IssueCard>
        ))}
      </ul>
    </section>
  );
}
