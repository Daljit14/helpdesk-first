import type { Metadata } from "next";
import { requireAdminPage } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  ConnectorForm,
  type ConnectorInitial,
} from "@/components/admin/connector-form";

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
  const initial: ConnectorInitial | null = row.data
    ? {
        provider: row.data.provider as ConnectorInitial["provider"],
        config: (row.data.config ?? {}) as Record<string, string>,
        allowedGroupIds: row.data.allowed_group_ids ?? [],
        resetUrl: row.data.reset_url,
        status: row.data.status,
      }
    : null;
  return (
    <section className="flex flex-1 flex-col px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-3xl">
        <p className="text-sm text-muted-foreground">Administration</p>
        <h1 className="mt-2 text-3xl font-bold">Identity connectors</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Secrets are encrypted server-side and never returned to the browser.
        </p>
        {row.error && (
          <p className="mt-6 rounded-2xl border border-border bg-muted p-3 text-sm text-muted-foreground">
            Connector tables not applied
          </p>
        )}
        <ConnectorForm initial={initial} />
      </div>
    </section>
  );
}
