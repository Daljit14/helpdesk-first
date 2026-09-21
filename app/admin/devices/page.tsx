import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/admin/auth";
import { isDeviceAgentEnabled } from "@/lib/admin/flags";
import { createAdminClient } from "@/lib/supabase/admin";
import { DeviceEnrollmentForm } from "@/components/admin/device-enrollment-form";
import {
  DeviceShadowReviewForm,
  RevokeDeviceButton,
  RevokeTokenButton,
} from "@/components/admin/device-actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Devices",
  robots: { index: false, follow: false },
};

export default async function DevicesPage() {
  if (!isDeviceAgentEnabled()) notFound();
  const session = await requireAdminPage("/admin/devices");
  if (session.role !== "org_admin") {
    return (
      <section className="flex flex-1 flex-col px-4 py-10 sm:px-6 lg:px-8">
        <div className="glass-strong mx-auto w-full max-w-3xl p-6">
          <h1 className="text-2xl font-bold">Devices</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Devices are not available for your role.
          </p>
        </div>
      </section>
    );
  }

  const admin = createAdminClient();
  const [devices, tokens, shadows] = await Promise.all([
    admin
      .from("devices_public")
      .select(
        "id,device_class,platform,hostname,agent_version,catalog_version,status,last_seen_at"
      )
      .eq("organization_id", session.organizationId)
      .order("last_seen_at", { ascending: false }),
    admin
      .from("device_enrollment_tokens")
      .select("id,label,device_class,expires_at,used_count,max_uses,revoked_at")
      .eq("organization_id", session.organizationId)
      .order("created_at", { ascending: false }),
    admin
      .from("device_shadow_actions")
      .select(
        "id,device_id,action_id,action_version,reason,review_status,review_note,created_at"
      )
      .eq("organization_id", session.organizationId)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);
  const deviceRows = devices.data ?? [];
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
  const diagnostics = new Map(
    deviceRows.map((device, index) => [
      device.id,
      diagnosticResults[index].data ?? [],
    ])
  );

  return (
    <section className="flex flex-1 flex-col px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-6xl">
        <p className="text-sm text-muted-foreground">Administration</p>
        <h1 className="mt-2 text-3xl font-bold">Devices</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Enrollment and shadow-only diagnostics. Device execution remains off.
        </p>
        <div className="mt-6">
          <DeviceEnrollmentForm />
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <section className="glass-strong p-5">
            <h2 className="font-semibold">Enrollment tokens</h2>
            <div className="mt-4 space-y-3">
              {(tokens.data ?? []).map((token) => (
                <div
                  key={token.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/60 p-3"
                >
                  <div>
                    <p className="font-medium">{token.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {token.device_class} · {token.used_count}/{token.max_uses}{" "}
                      uses · expires{" "}
                      {new Date(token.expires_at).toLocaleString()}
                    </p>
                  </div>
                  {token.revoked_at ? (
                    <span className="text-xs text-muted-foreground">
                      Revoked
                    </span>
                  ) : (
                    <RevokeTokenButton id={token.id} />
                  )}
                </div>
              ))}
              {(tokens.data ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No enrollment tokens.
                </p>
              )}
            </div>
          </section>

          <section className="glass-strong p-5">
            <h2 className="font-semibold">Shadow actions</h2>
            <div className="mt-4 space-y-3">
              {(shadows.data ?? []).map((shadow) => (
                <div
                  key={shadow.id}
                  className="rounded-2xl border border-border/60 p-3"
                >
                  <div className="flex flex-wrap justify-between gap-2">
                    <p className="font-medium">{shadow.action_id}</p>
                    <span className="text-xs text-muted-foreground">
                      {shadow.review_status}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {shadow.reason}
                  </p>
                  <DeviceShadowReviewForm id={shadow.id} />
                </div>
              ))}
              {(shadows.data ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No shadow actions.
                </p>
              )}
            </div>
          </section>
        </div>

        <section className="mt-8">
          <h2 className="text-xl font-semibold">Enrolled devices</h2>
          <div className="mt-4 space-y-4">
            {deviceRows.map((device) => (
              <article key={device.id} className="glass-strong p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h3 className="font-semibold">
                      {device.hostname} · {device.platform}
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {device.device_class} · agent {device.agent_version} ·{" "}
                      {device.status} · last seen{" "}
                      {device.last_seen_at
                        ? new Date(device.last_seen_at).toLocaleString()
                        : "never"}
                    </p>
                  </div>
                  {device.status === "active" && (
                    <RevokeDeviceButton id={device.id} />
                  )}
                </div>
                <details className="mt-4 rounded-2xl border border-border/60 p-3">
                  <summary className="cursor-pointer text-sm font-medium">
                    Latest diagnostics (
                    {diagnostics.get(device.id)?.length ?? 0})
                  </summary>
                  <div className="mt-3 space-y-2">
                    {(diagnostics.get(device.id) ?? []).map((diagnostic) => (
                      <div
                        key={diagnostic.id}
                        className="rounded-xl bg-background/40 p-3 text-sm"
                      >
                        <div className="flex flex-wrap justify-between gap-2">
                          <span className="font-medium">
                            {diagnostic.kind} ·{" "}
                            {diagnostic.ok ? "ok" : "failed"}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(diagnostic.collected_at).toLocaleString()}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {diagnostic.summary}
                        </p>
                      </div>
                    ))}
                  </div>
                </details>
              </article>
            ))}
            {deviceRows.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No devices enrolled.
              </p>
            )}
          </div>
        </section>
      </div>
    </section>
  );
}
