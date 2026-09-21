import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/admin/auth";
import { isDeviceAgentEnabled } from "@/lib/admin/flags";
import { createAdminClient } from "@/lib/supabase/admin";
import { createEnrollmentTokenAction } from "@/app/actions/admin-devices";

export const dynamic = "force-dynamic";

async function createTokenFromForm(form: FormData): Promise<void> {
  await createEnrollmentTokenAction({
    deviceClass: String(form.get("deviceClass") ?? "managed"),
    label: String(form.get("label") ?? ""),
    ttlHours: Number(form.get("ttlHours") ?? 24),
    maxUses: Number(form.get("maxUses") ?? 1),
  });
}

export default async function DevicesPage() {
  if (!isDeviceAgentEnabled()) notFound();
  const session = await requireAdminPage("/admin/devices");
  if (session.role !== "org_admin") notFound();
  const admin = createAdminClient();
  const [devices, tokens, shadows] = await Promise.all([
    admin
      .from("devices_public")
      .select(
        "id,device_class,platform,hostname,agent_version,status,last_seen_at"
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
        "id,device_id,action_id,action_version,reason,review_status,created_at"
      )
      .eq("organization_id", session.organizationId)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);
  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-10">
      <h1 className="text-3xl font-bold">Devices</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Enrollment and shadow-only diagnostics. Device execution remains off.
      </p>
      <form
        className="mt-6 grid gap-3 rounded-lg border p-4"
        action={createTokenFromForm}
      >
        <input name="deviceClass" type="hidden" value="managed" />
        <label>
          Label
          <input className="ml-2 rounded border p-2" name="label" required />
        </label>
        <label>
          TTL hours
          <input
            className="ml-2 rounded border p-2"
            name="ttlHours"
            type="number"
            defaultValue={24}
          />
        </label>
        <label>
          Max uses
          <input
            className="ml-2 rounded border p-2"
            name="maxUses"
            type="number"
            defaultValue={1}
          />
        </label>
        <button className="rounded border px-3 py-2" type="submit">
          Create enrollment token
        </button>
      </form>
      <h2 className="mt-8 font-semibold">Enrolled devices</h2>
      <ul className="mt-3 space-y-2">
        {(devices.data ?? []).map((device) => (
          <li className="rounded border p-3" key={device.id}>
            {device.hostname} · {device.platform} · {device.status}
          </li>
        ))}
      </ul>
      <h2 className="mt-8 font-semibold">Enrollment tokens</h2>
      <ul className="mt-3 space-y-2">
        {(tokens.data ?? []).map((token) => (
          <li className="rounded border p-3" key={token.id}>
            {token.label} · {token.used_count}/{token.max_uses} ·{" "}
            {token.revoked_at ? "revoked" : "active"}
          </li>
        ))}
      </ul>
      <h2 className="mt-8 font-semibold">Shadow actions</h2>
      <ul className="mt-3 space-y-2">
        {(shadows.data ?? []).map((shadow) => (
          <li className="rounded border p-3" key={shadow.id}>
            {shadow.action_id} · {shadow.review_status}
          </li>
        ))}
      </ul>
    </section>
  );
}
