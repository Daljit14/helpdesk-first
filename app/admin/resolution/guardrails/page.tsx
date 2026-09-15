import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminBreadcrumbs } from "@/components/admin/v2/breadcrumbs";
import { requireAdminPage } from "@/lib/admin/auth";
import { isResolutionCenterEnabled } from "@/lib/admin/flags";
import { getGuardrailOverview } from "@/lib/admin/resolution-center";

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
  return (
    <section className="flex flex-1 flex-col px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-7xl">
        <AdminBreadcrumbs
          items={[
            { label: "AI Resolution Center", href: "/admin/resolution" },
            { label: "Guardrails" },
          ]}
        />
        <div className="mb-6 mt-4">
          <p className="text-sm text-muted-foreground">Security and audit</p>
          <h1 className="mt-1 text-3xl font-bold">AI guardrails</h1>
          <p className="mt-2 text-muted-foreground">
            Organization-scoped guardrail activity from the last 30 days.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
          {metrics.map(([label, value]) => (
            <div className="rounded-lg border bg-background p-4" key={label}>
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="mt-2 text-2xl font-semibold">{value}</p>
            </div>
          ))}
        </div>
        <div className="mt-8 overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b bg-muted/40">
              <tr>
                <th className="px-4 py-3 font-medium">Event</th>
                <th className="px-4 py-3 font-medium">Reason</th>
                <th className="px-4 py-3 font-medium">Actor</th>
                <th className="px-4 py-3 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {overview.events.map((event, index) => (
                <tr
                  className="border-b last:border-0"
                  key={`${event.createdAt}-${index}`}
                >
                  <td className="px-4 py-3 font-mono text-xs">{event.kind}</td>
                  <td className="px-4 py-3">{event.reasonCode ?? "—"}</td>
                  <td className="px-4 py-3">{event.actor ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {event.createdAt}
                  </td>
                </tr>
              ))}
              {overview.events.length === 0 && (
                <tr>
                  <td className="px-4 py-6 text-muted-foreground" colSpan={4}>
                    No guardrail events in this window.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
