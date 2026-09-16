import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminBreadcrumbs } from "@/components/admin/v2/breadcrumbs";
import { PilotReviewForm } from "@/components/admin/resolution/pilot-review-form";
import { resumePilotAction } from "@/app/actions/admin-pilot";
import { requireAdminPage } from "@/lib/admin/auth";
import { isResolutionCenterEnabled } from "@/lib/admin/flags";
import { getPilotOverview } from "@/lib/admin/resolution-center";
import { computePilotReadiness } from "@/lib/admin/pilot-readiness";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "AI Pilot",
  robots: { index: false, follow: false },
};

export default async function PilotPage() {
  if (!isResolutionCenterEnabled()) notFound();
  const session = await requireAdminPage("/admin/resolution/pilot");
  const overview = await getPilotOverview(session);
  const readiness = await computePilotReadiness(
    createAdminClient(),
    session.organizationId
  );
  const metrics = [
    [
      "Executions today",
      `${overview.executionsToday} / ${overview.limits.orgDaily}`,
    ],
    [
      "Verification pass",
      `${Math.round(overview.verificationPassRate * 100)}%`,
    ],
    ["Reopen rate", `${Math.round(overview.reopenRate * 100)}%`],
    ["Pending reviews", overview.reviewCounts.pending],
    ["Unsafe reviews", overview.reviewCounts.unsafe],
  ] as const;
  return (
    <section className="flex flex-1 flex-col px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-7xl">
        <AdminBreadcrumbs
          items={[
            { label: "AI Resolution Center", href: "/admin/resolution" },
            { label: "Pilot" },
          ]}
        />
        <h1 className="mt-4 text-3xl font-bold">Controlled AI pilot</h1>
        <section className="mt-6 rounded-lg border p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-semibold">Pilot readiness</h2>
            <span
              className={readiness.ready ? "text-emerald-600" : "text-red-600"}
            >
              {readiness.verdict}
            </span>
          </div>
          <ul className="mt-3 space-y-2 text-sm">
            {readiness.items.map((item) => (
              <li className="flex gap-2" key={item.label}>
                <span aria-hidden="true">{item.ready ? "✓" : "!"}</span>
                <span>
                  <strong>{item.label}:</strong> {item.reason}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">
            Execution flag: {readiness.executionEnabled ? "on" : "off"}{" "}
            (informational only)
          </p>
        </section>
        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
          {metrics.map(([label, value]) => (
            <div className="rounded-lg border bg-background p-4" key={label}>
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="mt-2 text-2xl font-semibold">{value}</p>
            </div>
          ))}
        </div>
        {overview.error && (
          <p className="mt-6 rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
            Pilot data is unavailable: {overview.error}
          </p>
        )}
        {overview.paused && (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/50 bg-amber-500/10 p-4">
            <p>Pilot paused: {overview.pauseReason}</p>
            {session.role === "org_admin" && (
              <form
                action={async () => {
                  await resumePilotAction();
                }}
              >
                <button className="rounded border px-3 py-1" type="submit">
                  Resume
                </button>
              </form>
            )}
          </div>
        )}
        <section className="mt-8">
          <h2 className="font-semibold">Capabilities</h2>
          <ul className="mt-3 space-y-2">
            {overview.perCapability.map((item) => (
              <li
                className="flex justify-between rounded border p-3"
                key={item.id}
              >
                <span>{item.id}</span>
                <span>{item.count}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="mt-8 space-y-4">
          <h2 className="font-semibold">Reviews</h2>
          {overview.reviews.map((review) => (
            <article className="rounded-lg border p-4" key={review.id}>
              <div className="flex justify-between gap-2">
                <span>{review.capabilityId ?? "Unknown capability"}</span>
                <span className="font-mono text-xs">{review.reviewStatus}</span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Ticket {review.ticketId} ·{" "}
                {new Date(review.resolvedAt).toLocaleString()}
              </p>
              <PilotReviewForm
                review={review}
                canReview={session.role === "org_admin"}
              />
            </article>
          ))}
          {overview.reviews.length === 0 && (
            <p className="text-muted-foreground">No pilot reviews.</p>
          )}
        </section>
      </div>
    </section>
  );
}
