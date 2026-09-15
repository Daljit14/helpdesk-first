import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminBreadcrumbs } from "@/components/admin/v2/breadcrumbs";
import { requireAdminPage } from "@/lib/admin/auth";
import { isResolutionCenterEnabled } from "@/lib/admin/flags";
import { getShadowOverview } from "@/lib/admin/resolution-center";
import { reviewShadowDecision } from "@/app/actions/admin-shadow";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "AI Shadow Review",
  robots: { index: false, follow: false },
};

export default async function ShadowReviewPage() {
  if (!isResolutionCenterEnabled()) notFound();
  const session = await requireAdminPage("/admin/resolution/shadow");
  const overview = await getShadowOverview(session);
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
        <p className="mt-2 text-muted-foreground">
          {overview.metrics.total} decisions ·{" "}
          {Math.round(overview.metrics.agreementRate * 100)}% agreement
        </p>
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
              <form
                action={async (formData) => {
                  await reviewShadowDecision(formData);
                }}
                className="mt-4 flex flex-wrap gap-2"
              >
                <input type="hidden" name="id" value={decision.id} />
                <select
                  name="status"
                  defaultValue={
                    decision.reviewStatus === "unreviewed"
                      ? "agree"
                      : decision.reviewStatus
                  }
                >
                  <option value="agree">Agree</option>
                  <option value="disagree">Disagree</option>
                  <option value="unsafe">Unsafe</option>
                </select>
                <input
                  name="note"
                  placeholder="Review note"
                  className="min-w-64 rounded border px-2 py-1"
                />
                <button type="submit" className="rounded border px-3 py-1">
                  Save
                </button>
              </form>
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
