import type { Metadata } from "next";
import { requireAdminPage } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  saveConnectorAction,
  disableConnectorAction,
  testConnectorAction,
} from "@/app/actions/admin-connectors";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Identity connectors",
  robots: { index: false, follow: false },
};

export default async function ConnectorsPage() {
  const session = await requireAdminPage("/admin/connectors");
  const row = await createAdminClient()
    .from("organization_connectors_public")
    .select("provider,config,allowed_group_ids,reset_url,status")
    .eq("organization_id", session.organizationId)
    .maybeSingle();
  const config = (row.data?.config ?? {}) as Record<string, string>;
  return (
    <section className="flex flex-1 flex-col px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-3xl">
        <p className="text-sm text-muted-foreground">Administration</p>
        <h1 className="mt-2 text-3xl font-bold">Identity connectors</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Secrets are encrypted server-side and never returned to the browser.
        </p>
        <form
          action={async (formData) => {
            await saveConnectorAction(formData);
          }}
          className="mt-6 space-y-4 rounded-lg border p-5"
        >
          <label className="block text-sm">
            Provider
            <select
              name="provider"
              defaultValue={row.data?.provider ?? "entra"}
              className="mt-1 block w-full rounded border p-2"
            >
              <option value="entra">Microsoft Entra ID</option>
              <option value="google">Google Workspace</option>
            </select>
          </label>
          <label className="block text-sm">
            Tenant ID
            <input
              name="tenantId"
              defaultValue={config.tenantId}
              className="mt-1 block w-full rounded border p-2"
            />
          </label>
          <label className="block text-sm">
            Client ID
            <input
              name="clientId"
              defaultValue={config.clientId}
              className="mt-1 block w-full rounded border p-2"
            />
          </label>
          <label className="block text-sm">
            Client secret
            <input
              name="clientSecret"
              type="password"
              className="mt-1 block w-full rounded border p-2"
            />
          </label>
          <label className="block text-sm">
            Google service-account JSON
            <textarea
              name="serviceAccountJson"
              className="mt-1 block w-full rounded border p-2"
            />
          </label>
          <label className="block text-sm">
            Google admin subject
            <input
              name="adminSubject"
              type="email"
              className="mt-1 block w-full rounded border p-2"
            />
          </label>
          <label className="block text-sm">
            Allowed group IDs
            <input
              name="allowedGroupIds"
              defaultValue={(row.data?.allowed_group_ids ?? []).join(",")}
              className="mt-1 block w-full rounded border p-2"
            />
          </label>
          <label className="block text-sm">
            Recovery URL
            <input
              name="resetUrl"
              defaultValue={row.data?.reset_url ?? ""}
              className="mt-1 block w-full rounded border p-2"
            />
          </label>
          <p className="text-xs text-muted-foreground">
            {row.data
              ? `Secret set · status ${row.data.status}`
              : "No secret configured."}
          </p>
          <button className="rounded border px-4 py-2" type="submit">
            Save connector
          </button>
        </form>
        <div className="mt-4 flex gap-3">
          <form
            action={async () => {
              await testConnectorAction();
            }}
          >
            <button className="rounded border px-4 py-2" type="submit">
              Test connector
            </button>
          </form>
          <form
            action={async () => {
              await disableConnectorAction();
            }}
          >
            <button className="rounded border px-4 py-2" type="submit">
              Disable
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}
