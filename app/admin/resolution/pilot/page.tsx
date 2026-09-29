import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  FlaskConical,
  Layers,
  ListChecks,
  Pause,
  Play,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
  XCircle,
} from "lucide-react";
import { PilotReviewForm } from "@/components/admin/resolution/pilot-review-form";
import { ResolutionTabs } from "@/components/admin/resolution/resolution-tabs";
import { resumePilotAction } from "@/app/actions/admin-pilot";
import { requireAdminPage } from "@/lib/admin/auth";
import { isResolutionCenterEnabled } from "@/lib/admin/flags";
import { getPilotOverview } from "@/lib/admin/resolution-center";
import { computePilotReadiness } from "@/lib/admin/pilot-readiness";
import { createAdminClient } from "@/lib/supabase/admin";
import { CapabilityAutonomyLadder } from "@/components/admin/capability-autonomy-ladder";
import { listLadder } from "@/lib/autonomy/ladder";
import {
  AdminHero,
  AdminPage,
  BarRows,
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
  title: "AI Pilot",
  robots: { index: false, follow: false },
};

const REVIEW_TONE: Record<string, StatTone> = {
  pending: "warn",
  confirmed: "good",
  incorrect: "info",
  unsafe: "danger",
};

export default async function PilotPage() {
  if (!isResolutionCenterEnabled()) notFound();
  const session = await requireAdminPage("/admin/resolution/pilot");
  const overview = await getPilotOverview(session);
  const readiness = await computePilotReadiness(
    createAdminClient(),
    session.organizationId
  );
  const ladder = await listLadder(createAdminClient(), session.organizationId);
  const readyItems = readiness.items.filter((item) => item.ready).length;
  const usage = overview.limits.orgDaily
    ? overview.executionsToday / overview.limits.orgDaily
    : 0;

  return (
    <AdminPage>
      <AdminHero
        eyebrow="AI Resolution Center"
        title="Controlled AI pilot"
        description="Readiness checks, daily limits, the capability autonomy ladder and human review of every pilot resolution."
        icon={FlaskConical}
        tone="aurora"
      >
        <div className="flex flex-wrap gap-2">
          <HeroChip
            label="Readiness"
            value={readiness.verdict}
            pulse={readiness.ready}
          />
          <HeroChip
            label="Executions today"
            value={`${overview.executionsToday} / ${overview.limits.orgDaily}`}
          />
          <HeroChip
            label="Pending reviews"
            value={overview.reviewCounts.pending}
          />
          {overview.paused && <HeroChip label="Status" value="Paused" />}
        </div>
      </AdminHero>

      <ResolutionTabs active="pilot" />

      <StatGrid columns={5}>
        <StatTile
          label="Executions today"
          value={`${overview.executionsToday} / ${overview.limits.orgDaily}`}
          icon={Play}
          tone="primary"
          index={0}
          progress={usage}
        />
        <StatTile
          label="Verification pass"
          value={`${Math.round(overview.verificationPassRate * 100)}%`}
          icon={CheckCircle2}
          tone="good"
          index={1}
          progress={overview.verificationPassRate}
        />
        <StatTile
          label="Reopen rate"
          value={`${Math.round(overview.reopenRate * 100)}%`}
          icon={RefreshCw}
          tone="warn"
          index={2}
          progress={overview.reopenRate}
        />
        <StatTile
          label="Pending reviews"
          value={overview.reviewCounts.pending}
          icon={ListChecks}
          tone="info"
          index={3}
        />
        <StatTile
          label="Unsafe reviews"
          value={overview.reviewCounts.unsafe}
          icon={AlertTriangle}
          tone="danger"
          index={4}
        />
      </StatGrid>

      {overview.error && (
        <p className="hf-rise flex items-center gap-2 rounded-2xl border border-status-warning/40 bg-status-warning/10 p-4 text-sm font-semibold">
          <AlertTriangle
            className="h-4 w-4 shrink-0 text-status-warning"
            aria-hidden
          />
          Pilot data is unavailable: {overview.error}
        </p>
      )}
      {overview.paused && (
        <div className="hf-rise flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-status-warning/50 bg-status-warning/10 p-4">
          <p className="flex items-center gap-2 font-bold">
            <Pause className="h-4 w-4 text-status-warning" aria-hidden />
            Pilot paused: {overview.pauseReason}
          </p>
          {session.role === "org_admin" && (
            <form
              action={async () => {
                await resumePilotAction();
              }}
            >
              <button
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-extrabold text-primary-foreground shadow-sm transition-transform hover:-translate-y-px disabled:opacity-60"
                type="submit"
              >
                <Play className="h-4 w-4" aria-hidden />
                Resume
              </button>
            </form>
          )}
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Panel
          title="Pilot readiness"
          description={`${readyItems} of ${readiness.items.length} checks passing`}
          icon={ShieldCheck}
          delay={0.1}
          actions={
            <StatusPill
              tone={readiness.ready ? "good" : "warn"}
              pulse={readiness.ready}
            >
              {readiness.verdict}
            </StatusPill>
          }
        >
          <ul className="space-y-2 text-sm">
            {readiness.items.map((item, index) => (
              <li
                className="hf-adm-row flex items-start gap-3 rounded-2xl border border-border p-3"
                style={{ animationDelay: `${Math.min(index, 12) * 0.04}s` }}
                key={item.label}
              >
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                    item.ready
                      ? "bg-status-success/15 text-status-success"
                      : "bg-status-warning/15 text-status-warning"
                  }`}
                >
                  {item.ready ? (
                    <CheckCircle2 className="h-4 w-4" aria-hidden />
                  ) : (
                    <XCircle className="h-4 w-4" aria-hidden />
                  )}
                  <span className="sr-only">
                    {item.ready ? "Ready" : "Blocked"}
                  </span>
                </span>
                <span>
                  <strong className="font-extrabold">{item.label}:</strong>{" "}
                  <span className="text-muted-foreground">{item.reason}</span>
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold">
            <span className="rounded-full bg-muted px-3 py-1.5 text-muted-foreground">
              Execution flag: {readiness.executionEnabled ? "on" : "off"}{" "}
              (informational only)
            </span>
            <span className="rounded-full bg-muted px-3 py-1.5 text-muted-foreground">
              Autorun flag: {readiness.autorunEnabled ? "on" : "off"} ·{" "}
              {readiness.autorunCapabilities} autorun capabilities
            </span>
          </div>
        </Panel>

        <div className="grid gap-5">
          <Panel title="Device jobs" icon={Layers} delay={0.15}>
            <div className="grid grid-cols-2 gap-2 text-sm">
              {(
                [
                  ["Total", overview.deviceJobs.total],
                  ["Real", overview.deviceJobs.real],
                  ["Shadow", overview.deviceJobs.shadow],
                  ["Executed", overview.deviceJobs.executed],
                ] as const
              ).map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-2xl border border-border bg-card/60 p-3 font-bold"
                >
                  {label}:{" "}
                  <span className="text-lg font-extrabold tabular-nums">
                    {value}
                  </span>
                </div>
              ))}
            </div>
          </Panel>
          <Panel title="Capabilities" icon={TrendingUp} delay={0.2}>
            <BarRows
              items={overview.perCapability.map((item) => ({
                key: item.id,
                count: item.count,
              }))}
              empty="No pilot executions yet."
            />
          </Panel>
        </div>
      </div>

      <Panel
        title="Autonomy ladder"
        description="Promote capabilities one tier at a time as evidence builds."
        icon={TrendingUp}
        delay={0.2}
      >
        <CapabilityAutonomyLadder rows={ladder} />
      </Panel>

      <Panel
        title="Reviews"
        description={`${overview.reviews.length} pilot resolutions`}
        icon={FileText}
        delay={0.25}
      >
        {overview.reviews.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="Nothing to review"
            body="No pilot reviews."
          />
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {overview.reviews.map((review, index) => (
              <article
                className="hf-adm-card hf-adm-row rounded-2xl border border-border bg-card/60 p-4"
                style={{ animationDelay: `${Math.min(index, 12) * 0.04}s` }}
                key={review.id}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-extrabold">
                    {review.capabilityId ?? "Unknown capability"}
                  </span>
                  <StatusPill
                    tone={REVIEW_TONE[review.reviewStatus] ?? "neutral"}
                    pulse={review.reviewStatus === "pending"}
                  >
                    {review.reviewStatus}
                  </StatusPill>
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
          </div>
        )}
      </Panel>
    </AdminPage>
  );
}
