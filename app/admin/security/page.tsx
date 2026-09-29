import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  Activity,
  CheckCircle2,
  CircleAlert,
  FileClock,
  Fingerprint,
  Globe2,
  KeyRound,
  ShieldCheck,
  UserCog,
} from "lucide-react";
import { requireAdminPage } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOrganizationPolicy } from "@/lib/admin/policies";
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
} from "@/components/admin/ui/admin-kit";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Security and Audit",
  robots: { index: false, follow: false },
};

type AuditRow = {
  id: string;
  actor_user_id: string | null;
  actor_role: string | null;
  action: string;
  target: string | null;
  created_at: string;
};

function relative(value: string) {
  const minutes = Math.max(
    0,
    Math.round((Date.now() - Date.parse(value)) / 60_000)
  );
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function humanize(action: string) {
  return action.replace(/[_.:-]+/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

function summarize(rows: AuditRow[]) {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const last7 = rows.filter(
    (row) => now - Date.parse(row.created_at) < 7 * day
  ).length;
  const actors = new Set(rows.map((row) => row.actor_user_id).filter(Boolean))
    .size;
  const adminActions = rows.filter(
    (row) => row.actor_role === "org_admin"
  ).length;

  // 14-day activity columns.
  const days = Array.from({ length: 14 }, (_, i) => {
    const start = new Date(now - (13 - i) * day);
    start.setHours(0, 0, 0, 0);
    return {
      start: start.getTime(),
      label: start.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      }),
      count: 0,
    };
  });
  for (const row of rows) {
    const at = Date.parse(row.created_at);
    for (let i = days.length - 1; i >= 0; i -= 1) {
      if (at >= days[i].start) {
        days[i].count += 1;
        break;
      }
    }
  }
  const maxDay = Math.max(1, ...days.map((d) => d.count));

  return { last7, actors, adminActions, days, maxDay };
}

export default async function SecurityPage() {
  const session = await requireAdminPage("/admin/security");
  if (session.role !== "org_admin") notFound();
  const admin = createAdminClient();
  const [audit, total, domains, connector, policy] = await Promise.all([
    admin
      .from("operations_audit")
      .select("id,actor_user_id,actor_role,action,target,created_at")
      .eq("organization_id", session.organizationId)
      .order("created_at", { ascending: false })
      .limit(200),
    admin
      .from("operations_audit")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", session.organizationId),
    admin
      .from("organization_domains")
      .select("verified")
      .eq("organization_id", session.organizationId),
    admin
      .from("organization_connectors_public")
      .select("provider,status")
      .eq("organization_id", session.organizationId)
      .maybeSingle(),
    getOrganizationPolicy(session.organizationId),
  ]);
  const rows = (audit.data ?? []) as AuditRow[];
  const { last7, actors, adminActions, days, maxDay } = summarize(rows);

  const actionCounts = Object.entries(
    rows.reduce<Record<string, number>>((acc, row) => {
      acc[row.action] = (acc[row.action] ?? 0) + 1;
      return acc;
    }, {})
  )
    .map(([key, count]) => ({ key: humanize(key), count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  const verifiedDomains = (domains.data ?? []).filter((d) => d.verified).length;
  const checks = [
    {
      label: "Verified email domain",
      ok: verifiedDomains > 0,
      detail:
        verifiedDomains > 0
          ? `${verifiedDomains} verified`
          : "Add and verify a domain in Settings",
      href: "/admin/settings",
      icon: Globe2,
    },
    {
      label: "Identity connector",
      ok: Boolean(connector.data),
      detail: connector.data
        ? `${connector.data.provider} · ${connector.data.status}`
        : "Connect Entra ID, Okta or Google",
      href: "/admin/connectors",
      icon: KeyRound,
    },
    {
      label: "Strict verification",
      ok: !policy.allowVerificationException,
      detail: policy.allowVerificationException
        ? "Exceptions are allowed"
        : "Employees must confirm fixes",
      href: "/admin/settings",
      icon: Fingerprint,
    },
    {
      label: "Audit trail recording",
      ok: !audit.error,
      detail: audit.error
        ? "Audit table not available"
        : `${total.count ?? rows.length} events stored`,
      href: "/admin/database",
      icon: FileClock,
    },
  ];
  const score = Math.round(
    (checks.filter((c) => c.ok).length / checks.length) * 100
  );

  return (
    <AdminPage>
      <AdminHero
        eyebrow="Data & security"
        title="Security and Audit"
        description="Who changed what, when — plus a quick check of your organization's security basics."
        icon={ShieldCheck}
        tone="rose"
      >
        <div className="flex flex-wrap gap-2">
          <HeroChip label="Security score" value={`${score}%`} pulse />
          <HeroChip label="Events (7 days)" value={last7} />
          <HeroChip label="People acting" value={actors} />
        </div>
      </AdminHero>

      <StatGrid>
        <StatTile
          label="Audit events"
          value={total.count ?? rows.length}
          icon={FileClock}
          index={0}
        />
        <StatTile
          label="Last 7 days"
          value={last7}
          icon={Activity}
          tone="info"
          index={1}
        />
        <StatTile
          label="Admin actions"
          value={adminActions}
          icon={UserCog}
          tone="warn"
          index={2}
          hint="in the latest 200 events"
        />
        <StatTile
          label="Security score"
          value={score}
          suffix="%"
          icon={ShieldCheck}
          tone={score >= 75 ? "good" : "warn"}
          index={3}
          progress={score / 100}
        />
      </StatGrid>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Panel
          title="Activity · last 14 days"
          description="Audit events per day"
          icon={Activity}
          delay={0.1}
        >
          <div
            className="flex h-48 items-end gap-1.5"
            role="img"
            aria-label="Audit events per day for the last 14 days"
          >
            {days.map((d, i) => (
              <div
                key={d.start}
                className="group flex h-full flex-1 flex-col items-center justify-end gap-1"
              >
                <span className="text-[10px] font-bold text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
                  {d.count}
                </span>
                <span
                  className="hf-adm-rise-bar w-full rounded-t-lg bg-gradient-to-t from-[#e11d48] to-[#f472b6]"
                  style={{
                    height: `${Math.max(4, (d.count / maxDay) * 100)}%`,
                    animationDelay: `${i * 0.04}s`,
                  }}
                />
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-between text-[11px] font-bold text-muted-foreground">
            <span>{days[0].label}</span>
            <span>{days[7].label}</span>
            <span>Today</span>
          </div>
        </Panel>
        <Panel title="Security checklist" icon={ShieldCheck} delay={0.15}>
          <ul className="space-y-2.5">
            {checks.map((check) => (
              <li key={check.label}>
                <Link
                  href={check.href}
                  className="flex items-center gap-3 rounded-2xl border border-border p-3 transition-colors hover:border-primary/40 hover:bg-muted/50"
                >
                  <span
                    className={`flex h-9 w-9 items-center justify-center rounded-xl ${check.ok ? "bg-status-success/15 text-status-success" : "bg-status-warning/15 text-status-warning"}`}
                  >
                    <check.icon className="h-4 w-4" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-extrabold">
                      {check.label}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {check.detail}
                    </span>
                  </span>
                  {check.ok ? (
                    <CheckCircle2
                      className="h-5 w-5 text-status-success"
                      aria-label="Passing"
                    />
                  ) : (
                    <CircleAlert
                      className="h-5 w-5 text-status-warning"
                      aria-label="Needs attention"
                    />
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <Panel title="Most common actions" icon={Activity} delay={0.2}>
          <BarRows items={actionCounts} empty="No audit events yet." />
        </Panel>
        <Panel
          title="Audit log"
          description="Latest 200 events"
          icon={FileClock}
          delay={0.25}
          flush
        >
          {rows.length === 0 ? (
            <EmptyState
              icon={FileClock}
              title="No audit events yet"
              body={
                audit.error
                  ? "The audit table is not available in this environment."
                  : "Admin actions such as role changes and ticket updates will appear here."
              }
            />
          ) : (
            <div className="max-h-[520px] overflow-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="sticky top-0 z-10 bg-card">
                  <tr>
                    <th className="px-4 py-3">Action</th>
                    <th className="px-4 py-3">Target</th>
                    <th className="px-4 py-3">Actor</th>
                    <th className="px-4 py-3 text-right">When</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-t border-border">
                      <td className="px-4 py-2.5 font-bold">
                        {humanize(row.action)}
                      </td>
                      <td
                        className="max-w-[240px] truncate px-4 py-2.5 font-mono text-xs text-muted-foreground"
                        title={row.target ?? ""}
                      >
                        {row.target ?? "—"}
                      </td>
                      <td className="px-4 py-2.5">
                        <StatusPill
                          tone={
                            row.actor_role === "org_admin"
                              ? "primary"
                              : "neutral"
                          }
                        >
                          {row.actor_role ?? "system"}
                        </StatusPill>
                      </td>
                      <td
                        className="whitespace-nowrap px-4 py-2.5 text-right text-muted-foreground"
                        title={row.created_at}
                      >
                        {relative(row.created_at)}
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
