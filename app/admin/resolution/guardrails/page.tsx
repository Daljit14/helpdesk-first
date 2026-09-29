import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileText,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { ResolutionTabs } from "@/components/admin/resolution/resolution-tabs";
import { requireAdminPage } from "@/lib/admin/auth";
import { isResolutionCenterEnabled } from "@/lib/admin/flags";
import { getGuardrailOverview } from "@/lib/admin/resolution-center";
import {
  AdminHero,
  AdminPage,
  BarRows,
  EmptyState,
  HeroChip,
  Panel,
  StatGrid,
  StatTile,
} from "@/components/admin/ui/admin-kit";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "AI Guardrails",
  robots: { index: false, follow: false },
};

export default async function GuardrailsPage() {
  if (!isResolutionCenterEnabled()) notFound();
  const session = await requireAdminPage("/admin/resolution/guardrails");
  const overview = await getGuardrailOverview(session);
  const metrics = [
    ["Allowed", overview.allowed],
    ["Blocked", overview.blocked],
    ["Injection detections", overview.injectionDetections],
    ["Consent pending", overview.consentPending],
    ["Approval pending", overview.approvalPending],
    ["Kill-switch events", overview.killSwitchEvents],
    ["Provider failures", overview.providerFailures],
    ["Tenant violations", overview.tenantViolations],
    ["Verification blocks", overview.verificationBlocks],
  ] as const;
  const decisions = overview.allowed + overview.blocked;
  const pendingPeople = overview.consentPending + overview.approvalPending;
  const breakdown = metrics
    .slice(2)
    .map(([label, value]) => ({ key: label, count: Number(value) }))
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count);

  return (
    <AdminPage>
      <AdminHero
        eyebrow="AI Resolution Center"
        title="AI guardrails"
        description="Organization-scoped guardrail activity from the last 30 days."
        icon={ShieldCheck}
        tone="aurora"
      >
        <div className="flex flex-wrap gap-2">
          <HeroChip label="Allowed" value={overview.allowed} />
          <HeroChip label="Blocked" value={overview.blocked} />
          <HeroChip label="Events" value={overview.events.length} />
        </div>
      </AdminHero>

      <ResolutionTabs active="guardrails" />

      <StatGrid>
        <StatTile
          label="Allowed"
          value={overview.allowed}
          icon={CheckCircle2}
          tone="good"
          index={0}
          progress={decisions ? overview.allowed / decisions : 0}
        />
        <StatTile
          label="Blocked"
          value={overview.blocked}
          icon={XCircle}
          tone="danger"
          index={1}
          progress={decisions ? overview.blocked / decisions : 0}
        />
        <StatTile
          label="Injection detections"
          value={overview.injectionDetections}
          icon={AlertTriangle}
          tone="warn"
          index={2}
        />
        <StatTile
          label="Waiting on people"
          value={pendingPeople}
          icon={Clock}
          tone="info"
          index={3}
          hint="consent + approval pending"
        />
      </StatGrid>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <Panel title="Guardrail signals" icon={ShieldCheck} delay={0.1}>
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {metrics.map(([label, value], index) => (
              <div
                className="hf-adm-card hf-rise rounded-2xl border border-border bg-card/60 p-3"
                style={{ animationDelay: `${0.1 + index * 0.03}s` }}
                key={label}
              >
                <p className="text-xs font-bold text-muted-foreground">
                  {label}
                </p>
                <p className="mt-1 text-2xl font-extrabold tabular-nums">
                  {value}
                </p>
              </div>
            ))}
          </div>
          <BarRows
            items={breakdown}
            tone="warn"
            empty="No blocking signals in this window."
          />
        </Panel>
        <Panel
          title="Guardrail events"
          description="Most recent activity"
          icon={FileText}
          delay={0.15}
          flush
        >
          {overview.events.length === 0 ? (
            <EmptyState
              icon={ShieldCheck}
              title="All quiet"
              body="No guardrail events in this window."
            />
          ) : (
            <div className="max-h-[560px] overflow-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="sticky top-0 z-10 bg-card">
                  <tr>
                    <th className="px-4 py-3 font-extrabold">Event</th>
                    <th className="px-4 py-3 font-extrabold">Reason</th>
                    <th className="px-4 py-3 font-extrabold">Actor</th>
                    <th className="px-4 py-3 font-extrabold">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.events.map((event, index) => (
                    <tr
                      className="border-t border-border"
                      key={`${event.createdAt}-${index}`}
                    >
                      <td className="px-4 py-2.5 font-mono text-xs font-bold">
                        {event.kind}
                      </td>
                      <td className="px-4 py-2.5">{event.reasonCode ?? "—"}</td>
                      <td className="px-4 py-2.5">{event.actor ?? "—"}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-muted-foreground">
                        {event.createdAt}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </AdminPage>
  );
}
