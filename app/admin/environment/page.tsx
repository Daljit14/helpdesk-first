import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AlertTriangle, Settings2 } from "lucide-react";
import { OrgEnvironmentPanel } from "@/components/admin/org-environment-panel";
import {
  AdminHero,
  AdminPage,
  HeroChip,
  Panel,
} from "@/components/admin/ui/admin-kit";
import { requireAdminPage } from "@/lib/admin/auth";
import { isOrgEnvironmentEnabled } from "@/lib/admin/flags";
import { loadInventorySuggestions } from "@/lib/org-environment/inventory";
import {
  orgEnvironmentInputSchema,
  type OrgEnvironmentProfile,
} from "@/lib/org-environment/types";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Environment profile",
  robots: { index: false, follow: false },
};

function missingTable(error: { code?: string } | null): boolean {
  return error?.code === "42P01" || error?.code === "PGRST205";
}

export default async function EnvironmentPage() {
  const session = await requireAdminPage("/admin/environment");
  if (!isOrgEnvironmentEnabled() || session.role !== "org_admin") notFound();

  const admin = createAdminClient();
  const [profileResult, suggestions] = await Promise.all([
    admin
      .from("org_environment_profile")
      .select(
        "vpn_client,mdm_provider,email_stack,chat_stack,sso_provider,standard_platforms,standard_os_versions,printer_fleet,approved_software,status,confirmed_by,confirmed_at"
      )
      .eq("organization_id", session.organizationId)
      .maybeSingle(),
    loadInventorySuggestions(admin, session.organizationId),
  ]);
  const row = profileResult.data as {
    vpn_client: string | null;
    mdm_provider: string | null;
    email_stack: string | null;
    chat_stack: string | null;
    sso_provider: string | null;
    standard_platforms: string[];
    standard_os_versions: string[];
    printer_fleet: string[];
    approved_software: string[];
    status: "draft" | "confirmed";
    confirmed_by: string | null;
    confirmed_at: string | null;
  } | null;
  const parsed = row
    ? orgEnvironmentInputSchema.safeParse({
        vpnClient: row.vpn_client,
        mdmProvider: row.mdm_provider,
        emailStack: row.email_stack,
        chatStack: row.chat_stack,
        ssoProvider: row.sso_provider,
        standardPlatforms: row.standard_platforms,
        standardOsVersions: row.standard_os_versions,
        printerFleet: row.printer_fleet,
        approvedSoftware: row.approved_software,
      })
    : null;
  const profile: OrgEnvironmentProfile | null =
    row && parsed?.success
      ? {
          ...parsed.data,
          status: row.status,
          confirmedAt: row.confirmed_at,
        }
      : null;
  const missing = missingTable(profileResult.error);
  let confirmedBy: string | null = null;
  if (row?.confirmed_by) {
    const profileName = await admin
      .from("admin_profiles")
      .select("display_name")
      .eq("user_id", row.confirmed_by)
      .maybeSingle();
    confirmedBy = profileName.data?.display_name ?? row.confirmed_by;
  }

  return (
    <AdminPage>
      <AdminHero
        eyebrow="Organization settings"
        title="Environment profile"
        description="Record verified, organization-wide IT environment details to reduce repeated troubleshooting questions."
        icon={Settings2}
        tone="forest"
      >
        <div className="flex flex-wrap gap-2">
          <HeroChip
            label="Profile"
            value={profile?.status === "confirmed" ? "Confirmed" : "Draft"}
            pulse={profile?.status === "confirmed"}
          />
          <HeroChip label="Enrolled devices" value={suggestions.deviceCount} />
        </div>
      </AdminHero>

      {missing && (
        <p
          role="status"
          className="hf-rise flex items-center gap-2 rounded-2xl border border-status-warning/40 bg-status-warning/10 p-3 text-sm font-bold text-status-warning"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
          Environment profile table not applied
        </p>
      )}

      <Panel
        title="Organization environment"
        description="Use inventory as a starting point, save a draft, then confirm its accuracy."
        icon={Settings2}
      >
        <OrgEnvironmentPanel
          profile={profile}
          confirmedBy={confirmedBy}
          suggestions={suggestions}
        />
      </Panel>
    </AdminPage>
  );
}
