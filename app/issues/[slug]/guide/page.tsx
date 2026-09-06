import { Suspense } from "react";
import { notFound, permanentRedirect } from "next/navigation";
import { TroubleshootingGuide } from "@/components/troubleshooting-guide";
import { getAllIssueSlugs, getIssueBySlug } from "@/lib/search";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/supabase/user";
import { getProgress } from "@/lib/guides-data";
import { createClient } from "@/lib/supabase/server";
import { isResolutionTrackingEnabled } from "@/lib/admin/flags";

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
  const resolutionTrackingEnabled = isResolutionTrackingEnabled();
  let linkedTicket: { id: string; alreadyResolved: boolean } | null = null;
  const ticketParam = typeof query.ticket === "string" ? query.ticket : null;
  if (
    resolutionTrackingEnabled &&
    user &&
    ticketParam &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      ticketParam
    )
  ) {
    const supabase = await createClient();
    const { data: ticket } = await supabase
      .from("tickets")
      .select("id,status,ai_attempted")
      .eq("id", ticketParam)
      .eq("user_id", user.id)
      .maybeSingle();
    if (ticket) {
      linkedTicket = {
        id: ticket.id,
        alreadyResolved: ["resolved", "closed"].includes(
          String(ticket.status).toLowerCase()
        ),
      };
    }
  }

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
          linkedTicket={linkedTicket}
          resolutionTrackingEnabled={resolutionTrackingEnabled}
        />
      </Suspense>
    </section>
  );
}
