import { Suspense } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Clock,
  Gauge,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { categories } from "@/lib/helpdesk-data";
import { getIssueBySlug, getAllIssueSlugs } from "@/lib/search";
import { BackToResults } from "@/components/back-to-results";
import { StartGuideButton } from "@/components/start-guide-button";
import type { Metadata } from "next";

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
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const issue = getIssueBySlug(slug);

  if (!issue) {
    notFound();
  }

  const category = categories.find((c) => c.id === issue.categoryId);
  const riskColor =
    issue.riskLevel === "High"
      ? "text-destructive"
      : issue.riskLevel === "Medium"
        ? "text-amber-600"
        : "text-emerald-600";

  return (
    <section className="flex flex-1 flex-col px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-3xl">
        <Suspense
          fallback={
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to results
            </Link>
          }
        >
          <BackToResults />
        </Suspense>

        <h1 className="mt-6 text-3xl font-bold tracking-tight sm:text-4xl">
          {issue.title}
        </h1>

        <div className="mt-4">
          <Suspense
            fallback={
              <button
                type="button"
                disabled
                className="inline-flex h-8 items-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground opacity-50"
              >
                Start troubleshooting guide
              </button>
            }
          >
            <StartGuideButton slug={issue.slug} />
          </Suspense>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <span className="rounded-full border border-border bg-background px-3 py-1">
            {category?.label ?? issue.categoryId}
          </span>
          <span className="inline-flex items-center gap-1">
            <Gauge className="h-4 w-4" />
            {issue.difficulty}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="h-4 w-4" />
            About {issue.estimatedTimeMinutes} minutes
          </span>
          <span
            className={`inline-flex items-center gap-1 font-medium ${riskColor}`}
          >
            {issue.riskLevel === "Low" ? (
              <ShieldCheck className="h-4 w-4" />
            ) : (
              <ShieldAlert className="h-4 w-4" />
            )}
            {issue.riskLevel} risk
          </span>
        </div>

        <div className="mt-4 text-sm">
          <span className="font-medium text-foreground">Applies to:</span>{" "}
          {issue.platforms.join(", ")}
        </div>

        {issue.safetyWarning && (
          <div className="mt-6 rounded-lg border-l-4 border-amber-500 bg-amber-50 p-4 text-amber-900 dark:bg-amber-950 dark:text-amber-100">
            <p className="font-semibold">Safety note</p>
            <p className="mt-1">{issue.safetyWarning}</p>
          </div>
        )}

        <div className="mt-8">
          <h2 className="text-xl font-semibold">
            Initial troubleshooting steps
          </h2>
          <ol className="mt-4 list-decimal space-y-3 rounded-xl border border-border bg-background p-6 pl-10">
            {issue.steps.map((step, index) => (
              <li key={index} className="pl-2 text-muted-foreground">
                {step}
              </li>
            ))}
          </ol>
        </div>

        {issue.escalationWarning && (
          <div className="mt-6 rounded-lg border-l-4 border-destructive bg-destructive/5 p-4 text-destructive">
            <p className="font-semibold">Escalate if needed</p>
            <p className="mt-1">{issue.escalationWarning}</p>
          </div>
        )}
      </div>
    </section>
  );
}
