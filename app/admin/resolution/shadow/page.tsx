import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminBreadcrumbs } from "@/components/admin/v2/breadcrumbs";
import { ShadowReviewForm } from "@/components/admin/resolution/shadow-review-form";
import { requireAdminPage } from "@/lib/admin/auth";
import { isResolutionCenterEnabled } from "@/lib/admin/flags";
import { getShadowOverview } from "@/lib/admin/resolution-center";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "AI Shadow Review",
  robots: { index: false, follow: false },
};

export default async function ShadowReviewPage() {
  if (!isResolutionCenterEnabled()) notFound();
  const session = await requireAdminPage("/admin/resolution/shadow");
  const overview = await getShadowOverview(session);
  const metrics = [
    ["Decisions", overview.metrics.total],
    ["Agreement", `${Math.round(overview.metrics.agreementRate * 100)}%`],
    ["Unsafe plans", `${Math.round(overview.metrics.unsafePlanRate * 100)}%`],
    ["False allows", `${Math.round(overview.metrics.falseAllowRate * 100)}%`],
    ["Planner latency", `${Math.round(overview.metrics.plannerLatencyMs)}ms`],
    ["Planner cost", `${overview.metrics.plannerCostCents.toFixed(2)}¢`],
  ] as const;
  return (
    <section className="flex flex-1 flex-col px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-7xl">
        <AdminBreadcrumbs
          items={[
            { label: "AI Resolution Center", href: "/admin/resolution" },
            { label: "Shadow review" },
          ]}
        />
        <h1 className="mt-4 text-3xl font-bold">AI shadow review</h1>
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
            Shadow decisions are unavailable: {overview.error}
          </p>
        )}
        <div className="mt-8 space-y-4">
          {overview.decisions.map((decision) => (
            <article key={decision.id} className="rounded-lg border p-4">
              <div className="flex flex-wrap justify-between gap-2">
                <h2 className="font-medium">{decision.ticketId}</h2>
                <span className="font-mono text-xs">
                  {decision.reviewStatus}
                </span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {decision.policyDecision ?? "no policy decision"} ·{" "}
                {decision.plannerProvider} · {decision.latencyMs ?? 0}ms
              </p>
              <ShadowReviewForm
                id={decision.id}
                reviewStatus={decision.reviewStatus}
                reviewNote={decision.reviewNote}
                canReview={session.role === "org_admin"}
              />
            </article>
          ))}
          {overview.decisions.length === 0 && (
            <p className="text-muted-foreground">No shadow decisions.</p>
          )}
        </div>
      </div>
    </section>
  );
}
