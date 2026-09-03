import { Suspense } from "react";
import { notFound, permanentRedirect } from "next/navigation";
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
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const issue = getIssueBySlug(slug);

  if (!issue) {
    notFound();
  }
  if (slug !== issue.id) {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (Array.isArray(value)) {
        value.forEach((item) => search.append(key, item));
      } else if (value !== undefined) {
        search.set(key, value);
      }
    }
    const suffix = search.toString() ? `?${search.toString()}` : "";
    permanentRedirect(`/issues/${issue.id}/guide${suffix}`);
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
