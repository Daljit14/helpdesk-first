import { Suspense } from "react";
import { notFound } from "next/navigation";
import { TroubleshootingGuide } from "@/components/troubleshooting-guide";
import { getAllIssueSlugs, getIssueBySlug } from "@/lib/search";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/supabase/user";
import { getProgress } from "@/lib/guides-data";

export async function generateStaticParams() {
  return getAllIssueSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const issue = getIssueBySlug(slug);
  return {
    title: issue
      ? `${issue.title} troubleshooting guide · HelpDesk First`
      : "Issue not found",
  };
}

export default async function GuidePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const issue = getIssueBySlug(slug);

  if (!issue) {
    notFound();
  }
  const user = await getCurrentUser();
  const initialCompletedSteps = user
    ? await getProgress(user.id, issue.id)
    : [];

  return (
    <section className="flex flex-1 flex-col px-4 py-12 sm:px-6 lg:px-8">
      <Suspense
        fallback={
          <div className="mx-auto w-full max-w-3xl">
            <p className="text-muted-foreground">Loading guide…</p>
          </div>
        }
      >
        <TroubleshootingGuide
          issue={issue}
          initialCompletedSteps={initialCompletedSteps}
          canPersist={Boolean(user)}
        />
      </Suspense>
    </section>
  );
}
