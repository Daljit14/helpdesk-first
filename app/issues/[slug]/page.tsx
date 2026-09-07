import { notFound, permanentRedirect } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Clock,
  Gauge,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { getAllIssueSlugs, getIssueBySlug } from "@/lib/search";
import { categories } from "@/lib/helpdesk-data";
import { StartGuideButton } from "@/components/start-guide-button";
import type { Metadata } from "next";
import {
  getIssueSteps,
  getIssueSafetyWarning,
  getIssueEscalationWarning,
} from "@/lib/steps";
import { getCurrentUser } from "@/lib/supabase/user";
import {
  getBookmarkedIssueIds,
  getRatingTotals,
  getUserRating,
} from "@/lib/guides-data";
import { GuideActions } from "@/components/guide-actions";
import { RecentTracker } from "@/components/recent-tracker";
import { NetworkCheckWidget } from "@/components/network-check-widget";
import { isTicketWorkflowEnabled } from "@/lib/admin/flags";

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
    title: issue ? `${issue.title} · HelpDesk First` : "Issue not found",
  };
}

export default async function IssuePage({
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
    permanentRedirect(`/issues/${issue.id}${suffix}`);
  }

  const backParams = new URLSearchParams();
  const q = Array.isArray(query.q) ? query.q[0] : query.q;
  if (q) backParams.set("q", q);
  const categoryId = Array.isArray(query.category)
    ? query.category[0]
    : query.category;
  if (categoryId) backParams.set("category", categoryId);
  const platform = Array.isArray(query.platform)
    ? query.platform[0]
    : query.platform;
  if (platform) backParams.set("platform", platform);
  const backHref = backParams.toString() ? `/?${backParams.toString()}` : "/";

  const category = categories.find((c) => c.id === issue.category);
  const steps = getIssueSteps(issue);
  const safetyWarning = getIssueSafetyWarning(issue);
  const escalationWarning = getIssueEscalationWarning(issue);
  const user = await getCurrentUser();
  const [bookmarkedIds, userRating, ratingTotals] = await Promise.all([
    user ? getBookmarkedIssueIds(user.id) : Promise.resolve([]),
    user ? getUserRating(user.id, issue.id) : Promise.resolve(null),
    getRatingTotals(issue.id),
  ]);

  const riskColor =
    issue.risk === "High"
      ? "text-rose-500"
      : issue.risk === "Medium"
        ? "text-amber-500"
        : "text-emerald-500";

  return (
    <section className="flex flex-1 flex-col px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-3xl">
        <RecentTracker issueId={issue.id} />
        <Link
          href={backHref}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to results
        </Link>

        <h1 className="mt-6 text-3xl font-bold tracking-tight sm:text-4xl">
          {issue.title}
        </h1>

        <p className="mt-2 text-muted-foreground">
          {issue.symptoms.join(" · ")}
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <span className="glass-pill px-3 py-1">
            {category?.label ?? issue.category}
          </span>
          <span className="inline-flex items-center gap-1">
            <Gauge className="h-4 w-4" />
            Difficulty {issue.difficulty}/3
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="h-4 w-4" />
            {issue.time}
          </span>
          <span
            className={`inline-flex items-center gap-1 font-medium ${riskColor}`}
          >
            {issue.risk === "Low" ? (
              <ShieldCheck className="h-4 w-4" />
            ) : (
              <ShieldAlert className="h-4 w-4" />
            )}
            {issue.risk} risk
          </span>
        </div>

        <div className="mt-4 text-sm">
          <span className="font-medium text-foreground">Applies to:</span>{" "}
          {issue.devices.join(", ")}
        </div>

        {issue.category === "network" && <NetworkCheckWidget />}

        <div className="mt-6">
          <StartGuideButton slug={issue.id} />
        </div>

        <GuideActions
          issueId={issue.id}
          user={user}
          initialBookmarked={bookmarkedIds.includes(issue.id)}
          initialVote={userRating}
          initialTotals={ratingTotals}
          workflowEnabled={isTicketWorkflowEnabled()}
        />

        {safetyWarning && (
          <div className="mt-6 rounded-lg border-l-4 border-amber-500 bg-amber-50 p-4 text-amber-900 dark:bg-amber-950 dark:text-amber-100">
            <p className="font-semibold">Safety note</p>
            <p className="mt-1">{safetyWarning}</p>
          </div>
        )}

        <div className="mt-8">
          <h2 className="text-xl font-semibold">
            Initial troubleshooting steps
          </h2>
          <ol className="glass-strong mt-4 list-decimal space-y-3 p-6 pl-10">
            {steps.map((step, index) => (
              <li key={index} className="pl-2 text-muted-foreground">
                {step}
              </li>
            ))}
          </ol>
        </div>

        {escalationWarning && (
          <div className="mt-6 rounded-lg border-l-4 border-destructive bg-destructive/5 p-4 text-destructive">
            <p className="font-semibold">Escalate if needed</p>
            <p className="mt-1">{escalationWarning}</p>
          </div>
        )}
      </div>
    </section>
  );
}
