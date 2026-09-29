import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Activity,
  Cpu,
  Eye,
  KeyRound,
  Laptop,
  Lock,
  ShieldCheck,
  Wifi,
} from "lucide-react";
import { requireAdminPage } from "@/lib/admin/auth";
import { isDeviceAgentEnabled } from "@/lib/admin/flags";
import { createAdminClient } from "@/lib/supabase/admin";
import { DeviceEnrollmentForm } from "@/components/admin/device-enrollment-form";
import {
  DeviceShadowReviewForm,
  RevokeDeviceButton,
  RevokeTokenButton,
} from "@/components/admin/device-actions";
import { DeviceConsentPolicyForm } from "@/components/admin/device-consent-policy-form";
import { readConsentPolicies } from "@/lib/device-agent/server/consent-policies";
import { getDeviceShadowActivity } from "@/lib/admin/device-shadow";
import { resolveDeviceOwnerEmails } from "@/lib/admin/device-owner";
import { isRealDeviceJob } from "@/lib/device-agent/server/job-status";
import { DeviceJobCancel } from "@/components/admin/device-job-cancel";
import { CapabilityAutonomyLadder } from "@/components/admin/capability-autonomy-ladder";
import { listLadder } from "@/lib/autonomy/ladder";
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
  title: "Devices",
  robots: { index: false, follow: false },
};

const ONLINE_WINDOW_MS = 15 * 60 * 1000;
const DETAILS =
  "mt-3 rounded-2xl border border-border bg-card/50 p-3 [&[open]>summary]:mb-1";
const SUMMARY =
  "cursor-pointer text-sm font-extrabold transition-colors hover:text-primary";

function formatShadowDate(value: string): string {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? value : new Date(timestamp).toLocaleString();
}

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString();
}

function deviceTone(status: string | null): StatTone {
  if (status === "active") return "good";
  if (status === "revoked") return "danger";
  return "neutral";
}

function jobTone(status: string): StatTone {
  if (["succeeded", "completed", "done"].includes(status)) return "good";
  if (["failed", "error"].includes(status)) return "danger";
  if (["queued", "leased", "running"].includes(status)) return "info";
  return "neutral";
}

function summarizeFleet(
  devices: { status: string | null; last_seen_at: string | null }[],
  tokens: {
    expires_at: string;
    revoked_at: string | null;
    used_count: number | null;
    max_uses: number | null;
  }[]
) {
  const now = Date.now();
  const active = devices.filter((device) => device.status === "active").length;
  const online = devices.filter(
    (device) =>
      device.status === "active" &&
      device.last_seen_at !== null &&
      now - Date.parse(device.last_seen_at) < ONLINE_WINDOW_MS
  ).length;
  const openTokens = tokens.filter(
    (token) =>
      !token.revoked_at &&
      Date.parse(token.expires_at) > now &&
      (token.used_count ?? 0) < (token.max_uses ?? 1)
  ).length;
  return { active, online, openTokens };
}

export default async function DevicesPage({
  searchParams,
}: {
  searchParams: Promise<{ showAllJobs?: string }>;
}) {
  if (!isDeviceAgentEnabled()) notFound();
  const session = await requireAdminPage("/admin/devices");
  if (session.role !== "org_admin") {
    return (
      <AdminPage>
        <AdminHero title="Devices" icon={Laptop} tone="ocean" />
        <Panel title="Access" icon={Lock}>
          <EmptyState
            icon={Lock}
            title="Not available"
            body="Devices are not available for your role."
          />
        </Panel>
      </AdminPage>
    );
  }

  const admin = createAdminClient();
  const params = await searchParams;
  const [devices, tokens, shadows, policies, ladder] = await Promise.all([
    admin
      .from("devices_public")
      .select(
        "id,user_id,device_class,platform,hostname,agent_version,catalog_version,status,last_seen_at"
      )
      .eq("organization_id", session.organizationId)
      .order("last_seen_at", { ascending: false }),
    admin
      .from("device_enrollment_tokens")
      .select("id,label,device_class,expires_at,used_count,max_uses,revoked_at")
      .eq("organization_id", session.organizationId)
      .order("created_at", { ascending: false }),
    getDeviceShadowActivity(admin, session.organizationId, {
      includeNonReal: params.showAllJobs === "1",
    }),
    readConsentPolicies(admin, session.organizationId),
    listLadder(admin, session.organizationId),
  ]);
  const deviceRows = devices.data ?? [];
  const owners = await resolveDeviceOwnerEmails(
    admin,
    deviceRows.map((device) => device.user_id)
  );
  const diagnosticResults = await Promise.all(
    deviceRows.map((device) =>
      admin
        .from("device_diagnostics")
        .select("id,device_id,kind,ok,summary,collected_at")
        .eq("organization_id", session.organizationId)
        .eq("device_id", device.id)
        .order("collected_at", { ascending: false })
        .limit(20)
    )
  );
  const jobResults = await Promise.all(
    deviceRows.map((device) =>
      admin
        .from("device_jobs")
        .select(
          "id,run_id,action_id,mode,status,snapshot_hash,reported_at,error"
        )
        .eq("organization_id", session.organizationId)
        .eq("device_id", device.id)
        .order("created_at", { ascending: false })
        .limit(20)
    )
  );
  const diagnostics = new Map(
    deviceRows.map((device, index) => [
      device.id,
      diagnosticResults[index].data ?? [],
    ])
  );
  const jobs = new Map(
    deviceRows.map((device, index) => [
      device.id,
      jobResults[index].error
        ? []
        : (jobResults[index].data ?? []).filter(
            (job) =>
              params.showAllJobs === "1" ||
              isRealDeviceJob({ status: String(job.status) })
          ),
    ])
  );
  const policySet = new Set(
    policies
      .filter((policy) => policy.auto_approve)
      .map((policy) => `${policy.device_class}:${policy.category}`)
  );
  const categories = ["network", "security", "endpoint", "peripheral"] as const;
  const tokenRows = tokens.data ?? [];
  const fleet = summarizeFleet(deviceRows, tokenRows);
  const unreviewedShadows = shadows.filter(
    (shadow) => shadow.status === "unreviewed"
  ).length;

  return (
    <AdminPage>
      <AdminHero
        eyebrow="Administration"
        title="Devices"
        description="Enrollment and shadow-only diagnostics. Device execution remains off."
        icon={Laptop}
        tone="ocean"
      >
        <div className="flex flex-wrap gap-2">
          <HeroChip
            label="Online now"
            value={fleet.online}
            pulse={fleet.online > 0}
          />
          <HeroChip label="Enrolled" value={deviceRows.length} />
          <HeroChip
            label="Auto-approved categories"
            value={`${policySet.size}/${categories.length * 2}`}
          />
        </div>
      </AdminHero>

      <StatGrid>
        <StatTile
          label="Enrolled devices"
          value={deviceRows.length}
          icon={Laptop}
          index={0}
        />
        <StatTile
          label="Active"
          value={fleet.active}
          icon={Wifi}
          tone="good"
          index={1}
          progress={
            deviceRows.length > 0 ? fleet.active / deviceRows.length : 0
          }
          hint={`${fleet.online} seen in the last 15 min`}
        />
        <StatTile
          label="Open enrollment tokens"
          value={fleet.openTokens}
          icon={KeyRound}
          tone="info"
          index={2}
          hint={`${tokenRows.length} total`}
        />
        <StatTile
          label="Shadow actions"
          value={shadows.length}
          icon={Eye}
          tone="warn"
          index={3}
          hint={`${unreviewedShadows} unreviewed`}
        />
      </StatGrid>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <DeviceEnrollmentForm />
        <Panel
          title="Consent pre-approval"
          description="Irreversible actions always ask the user; read-only never asks."
          icon={ShieldCheck}
          delay={0.1}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {(["managed", "byod"] as const).flatMap((deviceClass) =>
              categories.map((category) => (
                <DeviceConsentPolicyForm
                  key={`${deviceClass}:${category}`}
                  deviceClass={deviceClass}
                  category={category}
                  enabled={policySet.has(`${deviceClass}:${category}`)}
                />
              ))
            )}
          </div>
        </Panel>
      </div>

      <Panel title="Autonomy ladder" icon={Activity} delay={0.15}>
        <CapabilityAutonomyLadder rows={ladder} />
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Enrollment tokens" icon={KeyRound} delay={0.2}>
          <div className="space-y-3">
            {tokenRows.map((token) => (
              <div
                key={token.id}
                className="hf-adm-row flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card/60 p-3 transition-colors hover:border-primary/40"
              >
                <div className="min-w-0">
                  <p className="font-extrabold">{token.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {token.device_class} · {token.used_count}/{token.max_uses}{" "}
                    uses · expires {formatTimestamp(token.expires_at)}
                  </p>
                </div>
                {token.revoked_at ? (
                  <StatusPill tone="neutral">Revoked</StatusPill>
                ) : (
                  <RevokeTokenButton id={token.id} />
                )}
              </div>
            ))}
            {tokenRows.length === 0 && (
              <EmptyState icon={KeyRound} title="No enrollment tokens." />
            )}
          </div>
        </Panel>

        <Panel
          title="Shadow actions"
          icon={Eye}
          delay={0.25}
          actions={
            <Link
              href={
                params.showAllJobs === "1"
                  ? "/admin/devices"
                  : "/admin/devices?showAllJobs=1"
              }
              className="inline-flex h-8 items-center rounded-xl border border-border bg-card px-3 text-xs font-extrabold transition-colors hover:border-primary/40 hover:text-primary"
            >
              {params.showAllJobs === "1"
                ? "Hide cancelled/expired jobs"
                : "Show cancelled/expired jobs"}
            </Link>
          }
        >
          <div className="space-y-3">
            {shadows.map((shadow) => (
              <div
                key={shadow.id}
                className="hf-adm-row rounded-2xl border border-border bg-card/60 p-3 transition-colors hover:border-primary/40"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="flex flex-wrap items-center gap-1.5 font-extrabold">
                    <StatusPill tone="info">Shadow</StatusPill>
                    <span>
                      {shadow.actionId}@{shadow.actionVersion ?? "?"} ·{" "}
                      {shadow.source === "shadow_plan"
                        ? "agent plan"
                        : "device job"}
                    </span>
                  </p>
                  <StatusPill
                    tone={shadow.status === "unreviewed" ? "warn" : "neutral"}
                  >
                    {shadow.status}
                  </StatusPill>
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Device:{" "}
                  {shadow.hostname ??
                    (shadow.deviceId
                      ? shadow.deviceId.slice(0, 8)
                      : "unknown")}{" "}
                  · owner {shadow.ownerEmail ?? "unclaimed"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Params: {shadow.paramsSummary} · Would have:{" "}
                  {shadow.wouldHave}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Policy: {shadow.policyDecision} ·{" "}
                  {formatShadowDate(shadow.createdAt)}
                </p>
                {shadow.runId && (
                  <Link
                    href={`/admin/resolution/${shadow.runId}`}
                    className="mt-2 inline-block text-xs font-bold text-primary underline-offset-4 hover:underline"
                  >
                    View resolution run
                  </Link>
                )}
                {shadow.source === "shadow_plan" && (
                  <DeviceShadowReviewForm id={shadow.id} />
                )}
              </div>
            ))}
            {shadows.length === 0 && (
              <EmptyState icon={Eye} title="No shadow actions." />
            )}
          </div>
        </Panel>
      </div>

      <Panel
        title="Enrolled devices"
        description={`${deviceRows.length} ${deviceRows.length === 1 ? "device" : "devices"} · ${fleet.active} active`}
        icon={Cpu}
        delay={0.3}
      >
        <div className="space-y-4">
          {deviceRows.map((device, index) => {
            const deviceDiagnostics = diagnostics.get(device.id) ?? [];
            const deviceJobs = jobs.get(device.id) ?? [];
            const owner = owners.get(device.user_id ?? "");
            return (
              <article
                key={device.id}
                className="hf-adm-card hf-rise rounded-2xl border border-border bg-card/60 p-4"
                style={{ animationDelay: `${0.3 + index * 0.04}s` }}
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
                      <Laptop className="h-5 w-5" aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <h3 className="flex flex-wrap items-center gap-2 font-extrabold">
                        <span>
                          {device.hostname} · {device.platform}
                        </span>
                        <StatusPill
                          tone={deviceTone(device.status)}
                          pulse={device.status === "active"}
                        >
                          {device.status}
                        </StatusPill>
                      </h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {device.device_class} · agent {device.agent_version} ·{" "}
                        {device.status} · last seen{" "}
                        {device.last_seen_at
                          ? formatTimestamp(device.last_seen_at)
                          : "never"}
                        {owner ? ` · owner ${owner}` : " · unclaimed"}
                      </p>
                    </div>
                  </div>
                  {device.status === "active" && (
                    <RevokeDeviceButton id={device.id} />
                  )}
                </div>
                <details className={DETAILS}>
                  <summary className={SUMMARY}>
                    Latest diagnostics ({deviceDiagnostics.length})
                  </summary>
                  <div className="mt-3 space-y-2">
                    {deviceDiagnostics.map((diagnostic) => (
                      <div
                        key={diagnostic.id}
                        className="hf-adm-row rounded-xl bg-muted/50 p-3 text-sm"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="flex items-center gap-2 font-bold">
                            {diagnostic.kind}
                            <StatusPill
                              tone={diagnostic.ok ? "good" : "danger"}
                            >
                              {diagnostic.ok ? "ok" : "failed"}
                            </StatusPill>
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {formatTimestamp(diagnostic.collected_at)}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {diagnostic.summary}
                        </p>
                      </div>
                    ))}
                  </div>
                </details>
                <details className={DETAILS}>
                  <summary className={SUMMARY}>Jobs</summary>
                  <div className="mt-3 space-y-2">
                    {deviceJobs.map((job) => (
                      <div
                        key={job.id}
                        className="hf-adm-row rounded-xl bg-muted/50 p-3 text-xs"
                      >
                        <p className="flex flex-wrap items-center gap-2 font-bold">
                          <span>
                            {job.action_id} · {job.mode}
                          </span>
                          <StatusPill tone={jobTone(String(job.status))}>
                            {job.status}
                          </StatusPill>
                        </p>
                        <p className="mt-1 text-muted-foreground">
                          Snapshot: {job.snapshot_hash ?? "—"} · Reported:{" "}
                          {job.reported_at
                            ? formatTimestamp(job.reported_at)
                            : "—"}
                        </p>
                        {job.error && (
                          <p className="font-semibold text-status-danger">
                            {job.error}
                          </p>
                        )}
                        <DeviceJobCancel
                          jobId={String(job.id)}
                          canCancel={
                            session.role === "org_admin" &&
                            ["queued", "leased"].includes(String(job.status))
                          }
                        />
                      </div>
                    ))}
                    {deviceJobs.length === 0 && (
                      <p className="text-xs text-muted-foreground">
                        No device jobs.
                      </p>
                    )}
                  </div>
                </details>
              </article>
            );
          })}
          {deviceRows.length === 0 && (
            <EmptyState
              icon={Laptop}
              title="No devices enrolled."
              body="Create an enrollment token above and run the agent on a device to see it here."
            />
          )}
        </div>
      </Panel>
    </AdminPage>
  );
}
