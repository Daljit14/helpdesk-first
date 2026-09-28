import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminBreadcrumbs } from "@/components/admin/v2/breadcrumbs";
import { AutonomyMetricsCard } from "@/components/admin/resolution/autonomy-metrics-card";
import { ResolutionCenterTable } from "@/components/admin/resolution/resolution-center-table";
import { getAutonomyMetrics } from "@/lib/analytics/autonomy-metrics";
import { requireAdminPage } from "@/lib/admin/auth";
import { isResolutionCenterEnabled } from "@/lib/admin/flags";
import { getResolutionCenterOverview } from "@/lib/admin/resolution-center";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "AI Resolution Center",
  robots: { index: false, follow: false },
};

export default async function ResolutionCenterPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; showExcluded?: string }>;
}) {
  if (!isResolutionCenterEnabled()) notFound();
  const session = await requireAdminPage("/admin/resolution");
  const params = await searchParams;
  const showExcluded =
    session.role === "org_admin" && params.showExcluded === "1";
  const [overview, autonomyMetrics] = await Promise.all([
    getResolutionCenterOverview(session, { showExcluded }),
    getAutonomyMetrics(session, { showExcluded }),
  ]);
  const status = params.status?.toLowerCase();
  const runs = overview.runs.filter((run) => {
    if (!status) return true;
    if (status === "active")
      return [
        "queued",
        "investigating",
        "planning",
        "policy_check",
        "executing",
      ].includes(run.status);
    if (status === "awaiting")
      return ["awaiting_consent", "awaiting_approval"].includes(run.status);
    return run.status === status;
  });
  return (
    <section className="flex flex-1 flex-col px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-7xl">
        <AdminBreadcrumbs items={[{ label: "AI Resolution Center" }]} />
        <div className="mb-6 mt-4">
          <p className="text-sm text-muted-foreground">Autonomy operations</p>
          <h1 className="mt-1 text-3xl font-bold">AI Resolution Center</h1>
          <p className="mt-2 max-w-3xl text-muted-foreground">
            Review AI-owned runs, independent verification, rollback activity,
            and safe staff controls.
          </p>
        </div>
        <div className="mb-6">
          <AutonomyMetricsCard metrics={autonomyMetrics} />
        </div>
        <ResolutionCenterTable
          runs={runs}
          metrics={overview.metrics}
          showExcluded={showExcluded}
        />
      </div>
    </section>
  );
}
