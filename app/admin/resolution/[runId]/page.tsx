import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminBreadcrumbs } from "@/components/admin/v2/breadcrumbs";
import { RunControls } from "@/components/admin/resolution/run-controls";
import { requireAdminPage } from "@/lib/admin/auth";
import { isResolutionCenterEnabled } from "@/lib/admin/flags";
import { getResolutionRunDetail } from "@/lib/admin/resolution-center";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "AI Resolution Run",
  robots: { index: false, follow: false },
};

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-xl border border-border bg-muted/30 p-3 text-xs">
      {JSON.stringify(value, null, 2) ?? "—"}
    </pre>
  );
}

export default async function ResolutionRunPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  if (!isResolutionCenterEnabled()) notFound();
  const { runId } = await params;
  const session = await requireAdminPage(`/admin/resolution/${runId}`);
  const detail = await getResolutionRunDetail(session, runId);
  if (!detail) notFound();
  const terminal = ["resolved", "escalated", "failed"].includes(detail.status);
  return (
    <section className="flex flex-1 flex-col px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <AdminBreadcrumbs
          items={[
            { label: "AI Resolution Center", href: "/admin/resolution" },
            { label: detail.ticketTitle },
          ]}
        />
        <header className="glass space-y-3 p-5">
          <Link
            href="/admin/resolution"
            className="text-sm underline-offset-4 hover:underline"
          >
            ← Back to runs
          </Link>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Ticket & stage</p>
              <h1 className="mt-1 text-3xl font-bold">{detail.ticketTitle}</h1>
              <p className="mt-2 text-muted-foreground">
                {detail.status} · ticket status: {detail.ticketStatus}
              </p>
            </div>
            <div className="rounded-xl border border-border px-3 py-2 text-sm">
              {detail.reopened ? "Reopened" : "Not reopened"}
            </div>
          </div>
        </header>
        <RunControls
          runId={detail.id}
          status={detail.status}
          canResume={session.role === "org_admin"}
        />
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="glass space-y-3 p-5">
            <h2 className="text-lg font-semibold">Diagnosis and evidence</h2>
            <JsonBlock value={detail.diagnosis ?? detail.evidenceSummary} />
          </section>
          <section className="glass space-y-3 p-5">
            <h2 className="text-lg font-semibold">Planned capability</h2>
            <p>{detail.plannedCapability ?? "No capability planned"}</p>
            <p className="text-sm text-muted-foreground">
              Policy: {detail.lastPolicyDecision ?? "No decision recorded"}
            </p>
            <p className="text-sm text-muted-foreground">
              Attempts: {detail.attempts}/{detail.maxAttempts} · Cost:{" "}
              {detail.costCents}¢ · Elapsed:{" "}
              {Math.round(detail.elapsedMs / 1000)}s
            </p>
          </section>
        </div>
        <section className="glass space-y-3 p-5">
          <h2 className="text-lg font-semibold">Actions attempted</h2>
          {detail.executions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No actions attempted.
            </p>
          ) : (
            <ul className="space-y-3">
              {detail.executions.map((execution, index) => {
                const row =
                  typeof execution === "object" && execution !== null
                    ? (execution as Record<string, unknown>)
                    : {};
                return (
                  <li
                    key={String(row.id ?? index)}
                    className="rounded-xl border border-border p-3"
                  >
                    <p className="font-medium">
                      {String(row.capability_id ?? "unknown")}@
                      {String(row.capability_version ?? "?")}
                    </p>
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
        </section>
        <section className="glass space-y-3 p-5">
          <h2 className="text-lg font-semibold">Sources consulted</h2>
          {detail.researchSources.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No external research for this run
            </p>
          ) : (
            <ul className="space-y-3">
              {detail.researchSources.map((source) => (
                <li
                  key={`${source.url}-${source.title}`}
                  className="rounded-xl border border-border p-3"
                >
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="font-medium underline underline-offset-4"
                  >
                    {source.title}
                  </a>
                  <p className="text-sm text-muted-foreground">
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
        </section>
        {(
          [
            ["Policy decisions", detail.policyDecisions],
            ["Consent and approval requests", detail.approvals],
            ["Verification results", detail.verifications],
            ["Rollback status", detail.rollbacks],
          ] as [string, unknown][]
        ).map(([label, value]) => (
          <section key={label} className="glass space-y-3 p-5">
            <h2 className="text-lg font-semibold">{label}</h2>
            <JsonBlock value={value} />
          </section>
        ))}
        <section className="glass space-y-3 p-5">
          <h2 className="text-lg font-semibold">Complete event timeline</h2>
          <ol className="space-y-3">
            {detail.events.length === 0 ? (
              <li className="text-sm text-muted-foreground">
                No events recorded.
              </li>
            ) : (
              detail.events.map((value, index) => {
                const event =
                  typeof value === "object" && value !== null
                    ? (value as Record<string, unknown>)
                    : {};
                return (
                  <li
                    key={String(event.id ?? index)}
                    className="border-l-2 border-border pl-3"
                  >
                    <p className="font-medium">
                      {String(event.kind ?? "event")}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {String(event.actor ?? "unknown")} ·{" "}
                      {String(event.from_status ?? "—")} →{" "}
                      {String(event.to_status ?? "—")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      initiated by {String(event.initiated_by ?? "unknown")} ·
                      versions {JSON.stringify(event.versions ?? {})}
                    </p>
                  </li>
                );
              })
            )}
          </ol>
        </section>
        {terminal && (
          <p className="text-sm text-muted-foreground">
            This run is terminal. Staff controls cannot resolve or change it.
          </p>
        )}
      </div>
    </section>
  );
}
