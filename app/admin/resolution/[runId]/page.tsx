import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Activity,
  CheckCircle2,
  Clock,
  Eye,
  FileText,
  Gauge,
  Layers,
  Lightbulb,
  ListChecks,
  Play,
  RotateCcw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { RunControls } from "@/components/admin/resolution/run-controls";
import { runStatusTone } from "@/components/admin/resolution/resolution-center-table";
import { requireAdminPage } from "@/lib/admin/auth";
import { isResolutionCenterEnabled } from "@/lib/admin/flags";
import { getResolutionRunDetail } from "@/lib/admin/resolution-center";
import { DeviceJobCancel } from "@/components/admin/device-job-cancel";
import { isRealDeviceJob } from "@/lib/device-agent/server/job-status";
import { RecordExclusionControl } from "@/components/admin/record-exclusion-control";
import { createAdminClient } from "@/lib/supabase/admin";
import { isRecordExcluded } from "@/lib/admin/record-exclusions";
import {
  AdminHero,
  AdminPage,
  EmptyState,
  HeroChip,
  Panel,
  StatGrid,
  StatTile,
  StatusPill,
  heroButton,
  type StatTone,
} from "@/components/admin/ui/admin-kit";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "AI Resolution Run",
  robots: { index: false, follow: false },
};

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-2xl border border-border bg-muted/40 p-3 font-mono text-xs leading-relaxed">
      {JSON.stringify(value, null, 2) ?? "—"}
    </pre>
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

function toneFor(status: unknown): StatTone {
  const value = String(status ?? "").toLowerCase();
  if (
    [
      "succeeded",
      "success",
      "completed",
      "passed",
      "resolved",
      "verified",
    ].includes(value)
  )
    return "good";
  if (["failed", "error", "escalated", "blocked", "cancelled"].includes(value))
    return "danger";
  if (["queued", "leased", "pending", "running", "executing"].includes(value))
    return "info";
  return "neutral";
}

export default async function ResolutionRunPage({
  params,
  searchParams,
}: {
  params: Promise<{ runId: string }>;
  searchParams: Promise<{ showAllJobs?: string }>;
}) {
  if (!isResolutionCenterEnabled()) notFound();
  const { runId } = await params;
  const query = await searchParams;
  const session = await requireAdminPage(`/admin/resolution/${runId}`);
  const detail = await getResolutionRunDetail(session, runId);
  if (!detail) notFound();
  const admin = createAdminClient();
  const excluded = await isRecordExcluded(
    admin,
    session.organizationId,
    "resolution_runs",
    runId
  );
  const terminal = ["resolved", "escalated", "failed"].includes(detail.status);
  const visibleJobs = detail.deviceJobs.filter(
    (job) =>
      query.showAllJobs === "1" ||
      (typeof job === "object" &&
        job !== null &&
        isRealDeviceJob({
          status: String((job as Record<string, unknown>).status),
        }))
  );
  const elapsedSeconds = Math.round(detail.elapsedMs / 1000);

  return (
    <AdminPage>
      <AdminHero
        eyebrow={
          <>
            <Link href="/admin/resolution" className="hover:underline">
              AI Resolution Center
            </Link>{" "}
            · Ticket & stage
          </>
        }
        title={detail.ticketTitle}
        description={`${detail.status} · ticket status: ${detail.ticketStatus}`}
        icon={Sparkles}
        tone="aurora"
        actions={
          <Link href="/admin/resolution" className={heroButton}>
            ← Back to runs
          </Link>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <HeroChip
            label="Stage"
            value={detail.status.replaceAll("_", " ")}
            pulse={!terminal && detail.status !== "paused"}
          />
          <HeroChip
            label="Attempts"
            value={`${detail.attempts}/${detail.maxAttempts}`}
          />
          <HeroChip label="Cost" value={`${detail.costCents}¢`} />
          <HeroChip label="Elapsed" value={`${elapsedSeconds}s`} />
          <HeroChip
            label="Reopen"
            value={detail.reopened ? "Reopened" : "Not reopened"}
          />
          <span className="rounded-xl bg-white/90 px-2 py-1 text-foreground empty:hidden">
            <RecordExclusionControl
              table="resolution_runs"
              recordId={runId}
              canExclude={session.role === "org_admin"}
              excluded={excluded}
            />
          </span>
        </div>
      </AdminHero>

      <StatGrid>
        <StatTile
          label="Attempts"
          value={`${detail.attempts}/${detail.maxAttempts}`}
          icon={RotateCcw}
          tone="primary"
          index={0}
          progress={
            detail.maxAttempts ? detail.attempts / detail.maxAttempts : 0
          }
        />
        <StatTile
          label="Cost"
          value={`${detail.costCents}¢`}
          icon={Gauge}
          tone="neutral"
          index={1}
          progress={
            detail.budgetCents
              ? detail.costCents / detail.budgetCents
              : undefined
          }
          hint={
            detail.budgetCents ? `Budget ${detail.budgetCents}¢` : undefined
          }
        />
        <StatTile
          label="Elapsed"
          value={`${elapsedSeconds}s`}
          icon={Clock}
          tone="info"
          index={2}
        />
        <StatTile
          label="Actions attempted"
          value={detail.executions.length}
          icon={Play}
          tone={terminal && detail.status !== "resolved" ? "warn" : "good"}
          index={3}
          hint={`${detail.events.length} events recorded`}
        />
      </StatGrid>

      <RunControls
        runId={detail.id}
        status={detail.status}
        canResume={session.role === "org_admin"}
      />

      {terminal && (
        <p className="hf-rise flex items-center gap-2 rounded-2xl border border-border bg-muted/40 p-3 text-sm font-semibold text-muted-foreground">
          <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden />
          This run is terminal. Staff controls cannot resolve or change it.
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Panel title="Diagnosis and evidence" icon={Lightbulb} delay={0.1}>
          <JsonBlock value={detail.diagnosis ?? detail.evidenceSummary} />
        </Panel>
        <Panel title="Planned capability" icon={Layers} delay={0.15}>
          <p className="font-mono text-sm font-extrabold">
            {detail.plannedCapability ?? "No capability planned"}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <StatusPill tone={runStatusTone(detail.status)}>
              <span className="capitalize">
                {detail.status.replaceAll("_", " ")}
              </span>
            </StatusPill>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            Policy: {detail.lastPolicyDecision ?? "No decision recorded"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Attempts: {detail.attempts}/{detail.maxAttempts} · Cost:{" "}
            {detail.costCents}¢ · Elapsed: {elapsedSeconds}s
          </p>
        </Panel>
      </div>

      <Panel title="Actions attempted" icon={Play} delay={0.15}>
        {detail.executions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No actions attempted.</p>
        ) : (
          <ul className="space-y-3">
            {detail.executions.map((execution, index) => {
              const row = asRecord(execution);
              return (
                <li
                  key={String(row.id ?? index)}
                  className="hf-adm-row space-y-2 rounded-2xl border border-border bg-card/60 p-3"
                  style={{ animationDelay: `${Math.min(index, 12) * 0.05}s` }}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-mono text-sm font-extrabold">
                      {String(row.capability_id ?? "unknown")}@
                      {String(row.capability_version ?? "?")}
                    </p>
                    <StatusPill tone={toneFor(row.status)}>
                      {String(row.status ?? "unknown")}
                    </StatusPill>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Status: {String(row.status ?? "unknown")} · Duration:{" "}
                    {String(row.duration_ms ?? "—")}ms
                  </p>
                  <JsonBlock value={row.result ?? {}} />
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Sources consulted" icon={Eye} delay={0.2}>
          {detail.researchSources.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No external research for this run
            </p>
          ) : (
            <ul className="space-y-2.5">
              {detail.researchSources.map((source) => (
                <li
                  key={`${source.url}-${source.title}`}
                  className="rounded-2xl border border-border p-3 transition-colors hover:border-primary/40 hover:bg-muted/40"
                >
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="font-extrabold text-primary underline-offset-4 hover:underline"
                  >
                    {source.title}
                  </a>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {source.domain} ·{" "}
                    {source.trust === "vendor"
                      ? "Vendor docs"
                      : "Community — unverified"}{" "}
                    · {source.judgement}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          title="Device jobs"
          icon={Activity}
          delay={0.2}
          actions={
            <Link
              href={
                query.showAllJobs === "1"
                  ? `/admin/resolution/${runId}`
                  : `/admin/resolution/${runId}?showAllJobs=1`
              }
              className="inline-flex h-8 items-center rounded-lg border border-border bg-card px-3 text-xs font-extrabold transition-colors hover:border-primary/40 hover:bg-muted/60"
            >
              {query.showAllJobs === "1"
                ? "Hide cancelled/expired jobs"
                : "Show cancelled/expired jobs"}
            </Link>
          }
        >
          {visibleJobs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No device jobs.</p>
          ) : (
            <div className="space-y-2">
              {visibleJobs.map((value, index) => {
                const job = asRecord(value);
                return (
                  <div
                    key={String(job.id ?? index)}
                    className="hf-adm-row space-y-1 rounded-2xl border border-border p-3 text-sm"
                    style={{ animationDelay: `${Math.min(index, 12) * 0.04}s` }}
                  >
                    <p className="flex flex-wrap items-center gap-1.5 font-bold">
                      {job.source === "device_job" || job.mode === "shadow" ? (
                        <StatusPill tone="info">Shadow</StatusPill>
                      ) : null}
                      <span>
                        {String(job.action_id ?? job.actionId ?? "unknown")} ·{" "}
                        {String(job.mode ?? "—")} · {String(job.status ?? "—")}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Device:{" "}
                      {String(job.device_hostname ?? job.device_id ?? "—")} ·
                      Snapshot: {String(job.snapshot_hash ?? "—")} · Reported:{" "}
                      {String(job.reported_at ?? "—")}
                    </p>
                    {typeof job.error === "string" && (
                      <p className="text-xs font-semibold text-status-danger">
                        {job.error}
                      </p>
                    )}
                    {typeof job.id === "string" &&
                      ["queued", "leased"].includes(String(job.status)) && (
                        <DeviceJobCancel
                          jobId={job.id}
                          canCancel={session.role === "org_admin"}
                        />
                      )}
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {(
          [
            ["Policy decisions", detail.policyDecisions, ShieldCheck],
            ["Consent and approval requests", detail.approvals, ListChecks],
            ["Verification results", detail.verifications, CheckCircle2],
            ["Rollback status", detail.rollbacks, RotateCcw],
          ] as const
        ).map(([label, value, icon], index) => (
          <Panel
            key={label}
            title={label}
            icon={icon}
            delay={0.25 + index * 0.03}
            actions={
              <StatusPill tone="neutral">
                {Array.isArray(value) ? value.length : 0}
              </StatusPill>
            }
          >
            <JsonBlock value={value} />
          </Panel>
        ))}
      </div>

      <Panel
        title="Complete event timeline"
        description={`${detail.events.length} ${detail.events.length === 1 ? "event" : "events"}, oldest first as recorded`}
        icon={FileText}
        delay={0.3}
      >
        {detail.events.length === 0 ? (
          <ol>
            <li>
              <EmptyState
                icon={Clock}
                title="Quiet so far"
                body="No events recorded."
              />
            </li>
          </ol>
        ) : (
          <ol className="relative ml-3 border-l-2 border-border">
            {detail.events.map((value, index) => {
              const event = asRecord(value);
              const last = index === detail.events.length - 1;
              return (
                <li
                  key={String(event.id ?? index)}
                  className="hf-rise relative pb-5 pl-6 last:pb-0"
                  style={{
                    animationDelay: `${0.3 + Math.min(index, 20) * 0.05}s`,
                  }}
                >
                  <span
                    aria-hidden
                    className="absolute -left-[9px] top-1 flex h-4 w-4 items-center justify-center"
                  >
                    {last && !terminal && (
                      <span className="hf-ping absolute inset-0 rounded-full bg-primary/60" />
                    )}
                    <span
                      className={`relative h-3 w-3 rounded-full ring-4 ring-card ${
                        last ? "bg-primary" : "bg-muted-foreground/60"
                      }`}
                    />
                  </span>
                  <div className="rounded-2xl border border-border bg-card/60 p-3 transition-colors hover:border-primary/30">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-extrabold">
                        {String(event.kind ?? "event")}
                      </p>
                      <span className="text-xs font-bold text-muted-foreground tabular-nums">
                        #{index + 1}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {String(event.actor ?? "unknown")} ·{" "}
                      {String(event.from_status ?? "—")} →{" "}
                      {String(event.to_status ?? "—")}
                    </p>
                    <p className="mt-1 break-all text-xs text-muted-foreground">
                      initiated by {String(event.initiated_by ?? "unknown")} ·
                      versions {JSON.stringify(event.versions ?? {})}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </Panel>
    </AdminPage>
  );
}
