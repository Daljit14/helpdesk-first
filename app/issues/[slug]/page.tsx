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
  getIssueStepMeta,
  getIssueStepSource,
} from "@/lib/steps";
import { getCurrentUser } from "@/lib/supabase/user";
import { buildBrowseReturnHref } from "@/lib/browse-return";
import { platformSlug } from "@/lib/platform";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Badge } from "@/components/ui/badge";
import {
  getBookmarkedIssueIds,
  getRatingTotals,
  getUserRating,
} from "@/lib/guides-data";
import { GuideActions } from "@/components/guide-actions";
import { RecentTracker } from "@/components/recent-tracker";
import { NetworkCheckWidget } from "@/components/network-check-widget";
import {
  isSecureAttachmentsEnabled,
  isTicketWorkflowEnabled,
} from "@/lib/admin/flags";

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
    title: issue ? issue.title : "Issue not found",
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

  const backHref = buildBrowseReturnHref(query);
  const hasBrowseParams = backHref !== "/browse";

  const category = categories.find((c) => c.id === issue.category);
  const steps = getIssueSteps(issue);
  const safetyWarning = getIssueSafetyWarning(issue);
  const escalationWarning = getIssueEscalationWarning(issue);
  const stepSource = getIssueStepSource(issue);
  const stepMeta = getIssueStepMeta(issue);
  const user = await getCurrentUser();
  const [bookmarkedIds, userRating, ratingTotals] = await Promise.all([
    user ? getBookmarkedIssueIds(user.id) : Promise.resolve([]),
    user ? getUserRating(user.id, issue.id) : Promise.resolve(null),
    getRatingTotals(issue.id),
  ]);

  return (
    <section className="flex flex-1 flex-col px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-3xl">
        <RecentTracker issueId={issue.id} />
        <Breadcrumbs
          label="Issue breadcrumb"
          items={[
            { label: "Start", href: "/" },
            { label: "Browse solutions", href: backHref },
            { label: issue.title },
          ]}
        />
        <Link
          href={backHref}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {hasBrowseParams ? "Back to results" : "Browse all solutions"}
        </Link>

        <div className="mt-6 rounded-xl border border-border bg-card p-6 shadow-sm">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            {issue.title}
          </h1>
          <p className="mt-2 text-muted-foreground">
            {issue.symptoms[0] ?? issue.title}
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <Badge variant="neutral">{category?.label ?? issue.category}</Badge>
            <span className="inline-flex items-center gap-1">
              <Gauge className="h-4 w-4" />
              Difficulty {issue.difficulty}/3
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock className="h-4 w-4" />
              {issue.time}
            </span>
            <Badge
              variant={
                issue.risk === "Low"
                  ? "success"
                  : issue.risk === "Medium"
                    ? "warning"
                    : "danger"
              }
            >
              {issue.risk === "Low" ? (
                <ShieldCheck className="h-4 w-4" />
              ) : (
                <ShieldAlert className="h-4 w-4" />
              )}
              {issue.risk} risk
            </Badge>
          </div>

          <div className="mt-4 flex flex-wrap gap-2 text-sm">
            <span className="font-medium text-foreground">Applies to:</span>
            {issue.devices.map((device) => {
              const selected =
                query.platform?.toString().toLowerCase() ===
                device.toLowerCase();
              const params = new URLSearchParams();
              for (const [key, value] of Object.entries(query)) {
                if (Array.isArray(value)) params.set(key, value[0] ?? "");
                else if (value !== undefined) params.set(key, value);
              }
              params.set("platform", platformSlug(device));
              return (
                <Link
                  key={device}
                  href={`/issues/${issue.id}?${params.toString()}`}
                  aria-current={selected ? "page" : undefined}
                  className="rounded-full border border-border px-3 py-1 hover:border-primary"
                >
                  {device}
                </Link>
              );
            })}
          </div>
        </div>

        {issue.category === "network" && <NetworkCheckWidget />}

        <div className="mt-6">
          <StartGuideButton slug={issue.id} />
          <Link
            href={`/assistant?q=${encodeURIComponent(issue.title)}&intent=human`}
            className="ml-2 inline-flex min-h-11 items-center rounded-lg border border-border px-5 font-medium hover:bg-secondary"
          >
            Contact support
          </Link>
        </div>

        <GuideActions
          issueId={issue.id}
          user={user}
          initialBookmarked={bookmarkedIds.includes(issue.id)}
          initialVote={userRating}
          initialTotals={ratingTotals}
          workflowEnabled={isTicketWorkflowEnabled()}
          secureAttachmentsEnabled={isSecureAttachmentsEnabled()}
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
          <ol className="mt-4 list-decimal space-y-3 border-l border-border pl-8">
            {steps.map((step, index) => (
              <li key={index} className="pl-2 text-muted-foreground">
                {step}
              </li>
            ))}
          </ol>
        </div>

        {stepSource === "category" && (
          <p className="mt-4 text-sm text-muted-foreground">
            These are general steps for {category?.label ?? issue.category}. If
            they don&apos;t match your situation, use Contact support /
            escalate.
          </p>
        )}

        {stepMeta?.sources && stepMeta.sources.length > 0 && (
          <div className="mt-6 text-sm">
            <h2 className="font-semibold">Sources</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {stepMeta.sources.map((source) => (
                <li key={source.url}>
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-4"
                  >
                    {source.title}
                  </a>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-muted-foreground">
              Reviewed {stepMeta.reviewedAt}
            </p>
          </div>
        )}

        {issue.related && issue.related.length > 0 && (
          <div className="mt-8">
            <h2 className="text-xl font-semibold">Related guides</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5">
              {issue.related.map((relatedId) => {
                const relatedIssue = getIssueBySlug(relatedId);
                if (!relatedIssue) return null;
                const relatedHref = buildBrowseReturnHref(query).replace(
                  /^\/browse/,
                  `/issues/${relatedIssue.id}`
                );
                return (
                  <li key={relatedIssue.id}>
                    <Link
                      href={relatedHref}
                      className="underline underline-offset-4"
                    >
                      {relatedIssue.title}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

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
