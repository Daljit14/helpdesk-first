import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Sparkles,
} from "lucide-react";
import { AutonomyMetricsCard } from "@/components/admin/resolution/autonomy-metrics-card";
import { AnswerEngineCard } from "@/components/admin/resolution/answer-engine-card";
import { OutcomeFeedbackPanel } from "@/components/admin/resolution/outcome-feedback-panel";
import { ResolutionCenterTable } from "@/components/admin/resolution/resolution-center-table";
import { ResolutionTabs } from "@/components/admin/resolution/resolution-tabs";
import { AuditChainExportForm } from "./audit-chain-export-form";
import { getAutonomyMetrics } from "@/lib/analytics/autonomy-metrics";
import { loadAnswerEngineMetrics } from "@/lib/analytics/answer-engine-metrics";
import { requireAdminPage } from "@/lib/admin/auth";
import {
  isOutcomeFeedbackEnabled,
  isResolutionCenterEnabled,
  isAnswerEngineEnabled,
} from "@/lib/admin/flags";
import { getResolutionCenterOverview } from "@/lib/admin/resolution-center";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  AdminHero,
  AdminPage,
  HeroChip,
  StatGrid,
  StatTile,
} from "@/components/admin/ui/admin-kit";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "AI Resolution Center",
  robots: { index: false, follow: false },
};

const ACTIVE_STATUSES = [
  "queued",
  "investigating",
  "planning",
  "policy_check",
  "executing",
];
const AWAITING_STATUSES = ["awaiting_consent", "awaiting_approval"];

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
  const admin = createAdminClient();
  const [overview, autonomyMetrics, answerEngineMetrics] = await Promise.all([
    getResolutionCenterOverview(session, { showExcluded }),
    getAutonomyMetrics(session, { showExcluded }),
    loadAnswerEngineMetrics(admin, session.organizationId, { windowDays: 30 }),
  ]);
  const status = params.status?.toLowerCase();
  const runs = overview.runs.filter((run) => {
    if (!status) return true;
    if (status === "active") return ACTIVE_STATUSES.includes(run.status);
    if (status === "awaiting") return AWAITING_STATUSES.includes(run.status);
    return run.status === status;
  });
  const allRuns = overview.runs;
  const activeCount = allRuns.filter((run) =>
    ACTIVE_STATUSES.includes(run.status)
  ).length;
  const awaitingCount = allRuns.filter((run) =>
    AWAITING_STATUSES.includes(run.status)
  ).length;
  const resolvedCount = allRuns.filter(
    (run) => run.status === "resolved"
  ).length;
  const escalatedCount = allRuns.filter(
    (run) => run.status === "escalated" || run.status === "failed"
  ).length;

  return (
    <AdminPage>
      <AdminHero
        eyebrow="Autonomy operations"
        title="AI Resolution Center"
        description="Review AI-owned runs, independent verification, rollback activity, and safe staff controls."
        icon={Sparkles}
        tone="aurora"
      >
        <div className="flex flex-wrap gap-2">
          <HeroChip
            label="Active runs"
            value={activeCount}
            pulse={activeCount > 0}
          />
          <HeroChip label="AI assigned" value={overview.metrics.aiAssigned} />
          <HeroChip
            label="Auto resolved"
            value={overview.metrics.autoResolved}
          />
          <HeroChip
            label="Reopen rate"
            value={`${Math.round(overview.metrics.reopenRate * 100)}%`}
          />
        </div>
      </AdminHero>

      <ResolutionTabs active="runs" />

      <StatGrid>
        <StatTile
          label="Active"
          value={activeCount}
          icon={Activity}
          tone="info"
          index={0}
          hint={`${allRuns.length} runs loaded`}
        />
        <StatTile
          label="Awaiting people"
          value={awaitingCount}
          icon={Clock}
          tone="warn"
          index={1}
          hint="consent or approval"
        />
        <StatTile
          label="Resolved"
          value={resolvedCount}
          icon={CheckCircle2}
          tone="good"
          index={2}
          progress={allRuns.length ? resolvedCount / allRuns.length : 0}
        />
        <StatTile
          label="Escalated or failed"
          value={escalatedCount}
          icon={AlertTriangle}
          tone="danger"
          index={3}
        />
      </StatGrid>

      <AutonomyMetricsCard metrics={autonomyMetrics} />
      <AnswerEngineCard
        metrics={answerEngineMetrics}
        enabled={isAnswerEngineEnabled()}
      />
      {session.role === "org_admin" && <AuditChainExportForm />}
      {isOutcomeFeedbackEnabled() && (
        <OutcomeFeedbackPanel
          items={autonomyMetrics.recentFeedback}
          total={autonomyMetrics.outcomeFeedback}
        />
      )}
      <ResolutionCenterTable
        runs={runs}
        metrics={overview.metrics}
        showExcluded={showExcluded}
      />
    </AdminPage>
  );
}
