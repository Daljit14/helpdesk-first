import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Clock,
  Eye,
  Gauge,
  ListChecks,
  XCircle,
} from "lucide-react";
import { ShadowReviewForm } from "@/components/admin/resolution/shadow-review-form";
import { ResolutionTabs } from "@/components/admin/resolution/resolution-tabs";
import { requireAdminPage } from "@/lib/admin/auth";
import { isResolutionCenterEnabled } from "@/lib/admin/flags";
import { getShadowOverview } from "@/lib/admin/resolution-center";
import {
  AdminHero,
  AdminPage,
  EmptyState,
  HeroChip,
  Panel,
  StatGrid,
  StatTile,
  StatusPill,
  type StatTone,
} from "@/components/admin/ui/admin-kit";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "AI Shadow Review",
  robots: { index: false, follow: false },
};

const REVIEW_TONE: Record<string, StatTone> = {
  unreviewed: "warn",
  agree: "good",
  disagree: "info",
  unsafe: "danger",
};

export default async function ShadowReviewPage() {
  if (!isResolutionCenterEnabled()) notFound();
  const session = await requireAdminPage("/admin/resolution/shadow");
  const overview = await getShadowOverview(session);
  const m = overview.metrics;
  const unreviewed = overview.decisions.filter(
    (decision) => decision.reviewStatus === "unreviewed"
  ).length;

  return (
    <AdminPage>
      <AdminHero
        eyebrow="AI Resolution Center"
        title="AI shadow review"
        description="Compare what the planner would have done against staff judgement before anything runs for real."
        icon={Eye}
        tone="aurora"
      >
        <div className="flex flex-wrap gap-2">
          <HeroChip label="Decisions" value={m.total} />
          <HeroChip
            label="Agreement"
            value={`${Math.round(m.agreementRate * 100)}%`}
          />
          <HeroChip
            label="Unreviewed"
            value={unreviewed}
            pulse={unreviewed > 0}
          />
        </div>
      </AdminHero>

      <ResolutionTabs active="shadow" />

      <StatGrid columns={6}>
        <StatTile
          label="Decisions"
          value={m.total}
          icon={ListChecks}
          index={0}
        />
        <StatTile
          label="Agreement"
          value={`${Math.round(m.agreementRate * 100)}%`}
          icon={CheckCircle2}
          tone="good"
          index={1}
          progress={m.agreementRate}
        />
        <StatTile
          label="Unsafe plans"
          value={`${Math.round(m.unsafePlanRate * 100)}%`}
          icon={AlertTriangle}
          tone="danger"
          index={2}
          progress={m.unsafePlanRate}
        />
        <StatTile
          label="False allows"
          value={`${Math.round(m.falseAllowRate * 100)}%`}
          icon={XCircle}
          tone="warn"
          index={3}
          progress={m.falseAllowRate}
        />
        <StatTile
          label="Planner latency"
          value={`${Math.round(m.plannerLatencyMs)}ms`}
          icon={Clock}
          tone="info"
          index={4}
        />
        <StatTile
          label="Planner cost"
          value={`${m.plannerCostCents.toFixed(2)}¢`}
          icon={Gauge}
          tone="neutral"
          index={5}
        />
      </StatGrid>

      {overview.error && (
        <p className="hf-rise flex items-center gap-2 rounded-2xl border border-status-warning/40 bg-status-warning/10 p-4 text-sm font-semibold">
          <AlertTriangle
            className="h-4 w-4 shrink-0 text-status-warning"
            aria-hidden
          />
          Shadow decisions are unavailable: {overview.error}
        </p>
      )}

      <Panel
        title="Shadow decisions"
        description={`${overview.decisions.length} planner decisions to review`}
        icon={Bot}
        delay={0.15}
      >
        {overview.decisions.length === 0 ? (
          <EmptyState
            icon={Eye}
            title="Nothing to review"
            body="No shadow decisions."
          />
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {overview.decisions.map((decision, index) => (
              <article
                key={decision.id}
                className="hf-adm-card hf-adm-row rounded-2xl border border-border bg-card/60 p-4"
                style={{ animationDelay: `${Math.min(index, 12) * 0.04}s` }}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="min-w-0 truncate font-mono text-sm font-extrabold">
                    {decision.ticketId}
                  </h2>
                  <StatusPill
                    tone={REVIEW_TONE[decision.reviewStatus] ?? "neutral"}
                    pulse={decision.reviewStatus === "unreviewed"}
                  >
                    {decision.reviewStatus}
                  </StatusPill>
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
          </div>
        )}
      </Panel>
    </AdminPage>
  );
}
