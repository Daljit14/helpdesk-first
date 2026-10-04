import type { Metadata } from "next";
import {
  AlertTriangle,
  KeyRound,
  Link2,
  Lock,
  Plug,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import { requireAdminPage } from "@/lib/admin/auth";
import { isServiceHealthEnabled } from "@/lib/admin/flags";
import { createAdminClient } from "@/lib/supabase/admin";
import { StatusSourcesPanel } from "@/components/admin/status-sources-panel";
import {
  ConnectorForm,
  type ConnectorInitial,
} from "@/components/admin/connector-form";
import {
  AdminHero,
  AdminPage,
  HeroChip,
  Panel,
  StatGrid,
  StatTile,
  type StatTone,
} from "@/components/admin/ui/admin-kit";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Identity connectors",
  robots: { index: false, follow: false },
};

const PROVIDER_LABEL: Record<string, string> = {
  entra: "Microsoft Entra ID",
  google: "Google Workspace",
};

function statusTone(status: string | undefined): StatTone {
  if (!status) return "neutral";
  if (status === "active" || status === "connected" || status === "healthy")
    return "good";
  if (status === "error" || status === "failed") return "danger";
  if (status === "disabled") return "neutral";
  return "warn";
}

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
  const serviceHealthEnabled = isServiceHealthEnabled();
  const statusSourcesResult = serviceHealthEnabled
    ? await createAdminClient()
        .from("org_status_sources")
        .select("id,name,base_url,enabled")
        .eq("organization_id", session.organizationId)
        .order("created_at", { ascending: true })
        .limit(10)
    : null;
  const statusSources = (statusSourcesResult?.data ?? []) as Array<{
    id: string;
    name: string;
    base_url: string;
    enabled: boolean;
  }>;
  const providerLabel = initial
    ? (PROVIDER_LABEL[initial.provider] ?? initial.provider)
    : "Not connected";
  return (
    <AdminPage>
      <AdminHero
        eyebrow="Identity connectors"
        title="Integrations"
        description="Secrets are encrypted server-side and never returned to the browser."
        icon={Plug}
        tone="forest"
      >
        <div className="flex flex-wrap gap-2">
          <HeroChip label="Provider" value={providerLabel} />
          <HeroChip
            label="Status"
            value={initial?.status ?? "not configured"}
            pulse={statusTone(initial?.status) === "good"}
          />
        </div>
      </AdminHero>

      {row.error && (
        <p
          role="status"
          className="hf-rise flex items-center gap-2 rounded-2xl border border-status-warning/40 bg-status-warning/10 p-3 text-sm font-bold text-status-warning"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
          Connector tables not applied
        </p>
      )}

      <StatGrid>
        <StatTile
          label="Provider"
          value={providerLabel}
          icon={KeyRound}
          index={0}
        />
        <StatTile
          label="Status"
          value={initial?.status ?? "—"}
          icon={ShieldCheck}
          tone={statusTone(initial?.status)}
          index={1}
        />
        <StatTile
          label="Allowed groups"
          value={initial?.allowedGroupIds.length ?? 0}
          icon={UsersRound}
          tone="info"
          index={2}
        />
        <StatTile
          label="Recovery URL"
          value={initial?.resetUrl ? "Set" : "Not set"}
          icon={Link2}
          tone={initial?.resetUrl ? "good" : "neutral"}
          index={3}
        />
      </StatGrid>

      <Panel
        title="Identity connector"
        description="Choose a provider, save its credentials, then test the connection."
        icon={Lock}
        delay={0.1}
      >
        <ConnectorForm initial={initial} />
      </Panel>

      {serviceHealthEnabled && (
        <Panel
          title="Status pages"
          description="Configure additional public service-health sources for this organization."
          icon={Plug}
          delay={0.15}
        >
          <StatusSourcesPanel
            sources={statusSources}
            loadError={Boolean(statusSourcesResult?.error)}
          />
        </Panel>
      )}
    </AdminPage>
  );
}
