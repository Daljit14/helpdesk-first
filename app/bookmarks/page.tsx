import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { IssueCard } from "@/components/issue-card";
import { getBookmarkedIssueIds } from "@/lib/guides-data";
import { getIssueBySlug } from "@/lib/search";
import { getCurrentUser } from "@/lib/supabase/user";
import type { Issue } from "@/lib/issues";

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
        <h1 className="text-3xl font-bold tracking-tight">Bookmarks</h1>
        {issues.length === 0 ? (
          <div className="glass-strong mt-8 p-8 text-center">
            <p className="text-lg font-medium">You have no saved guides yet.</p>
            <Link
              href="/"
              className="mt-4 inline-block underline underline-offset-4"
            >
              Browse all guides
            </Link>
          </div>
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
