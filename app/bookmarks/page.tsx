import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { IssueCard } from "@/components/issue-card";
import { getBookmarkedIssueIds } from "@/lib/guides-data";
import { getIssueBySlug } from "@/lib/search";
import { getCurrentUser } from "@/lib/supabase/user";
import type { Issue } from "@/lib/issues";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { BookmarkX } from "lucide-react";

export const metadata: Metadata = {
  title: "Bookmarks",
};

export default async function BookmarksPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/bookmarks");
  const issues = (await getBookmarkedIssueIds(user.id))
    .map((id) => getIssueBySlug(id))
    .filter((issue): issue is Issue => issue !== undefined);

  return (
    <section className="flex flex-1 flex-col px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-4xl">
        <PageHeader title="Bookmarks" />
        {issues.length === 0 ? (
          <EmptyState
            className="mt-8"
            icon={BookmarkX}
            title="No bookmarks yet"
            description="Save a guide to make it easier to find next time."
            actions={<Link href="/browse">Browse solutions</Link>}
          />
        ) : (
          <ul className="mt-8 grid gap-4">
            {issues.map((issue) => (
              <IssueCard key={issue.id} issue={issue} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
