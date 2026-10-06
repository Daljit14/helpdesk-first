import { isOrgEnvironmentEnabled } from "@/lib/admin/flags";
import type { DiagnosticAnswer } from "@/lib/ai/types";
import type { Platform } from "@/lib/helpdesk-data";
import { createAdminClient } from "@/lib/supabase/admin";
import { orgEnvironmentInputSchema, type OrgEnvironmentProfile } from "./types";

type Admin = ReturnType<typeof createAdminClient>;

export async function loadIdpMfaAttestation(
  admin: Admin,
  organizationId: string
): Promise<{
  idpEnforcesMfa: boolean;
  ssoProvider: "entra" | "google" | "okta" | "none" | "other" | null;
  profileConfirmed: boolean;
}> {
  try {
    const result = await admin
      .from("org_environment_profile")
      .select("sso_provider,idp_enforces_mfa,status")
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (result.error) {
      return {
        idpEnforcesMfa: false,
        ssoProvider: null,
        profileConfirmed: false,
      };
    }
    const row = result.data as {
      idp_enforces_mfa?: unknown;
      sso_provider?: unknown;
      status?: unknown;
    } | null;
    const providers = new Set(["entra", "google", "okta", "none", "other"]);
    return {
      idpEnforcesMfa: row?.idp_enforces_mfa === true,
      ssoProvider:
        typeof row?.sso_provider === "string" && providers.has(row.sso_provider)
          ? (row.sso_provider as "entra" | "google" | "okta" | "none" | "other")
          : null,
      profileConfirmed: row?.status === "confirmed",
    };
  } catch {
    return {
      idpEnforcesMfa: false,
      ssoProvider: null,
      profileConfirmed: false,
    };
  }
}

export async function loadConfirmedOrgEnvironment(
  admin: Admin,
  organizationId: string
): Promise<OrgEnvironmentProfile | null> {
  if (!isOrgEnvironmentEnabled()) return null;
  try {
    const result = await admin
      .from("org_environment_profile")
      .select(
        "vpn_client,mdm_provider,email_stack,chat_stack,sso_provider,standard_platforms,standard_os_versions,printer_fleet,approved_software,status,confirmed_at"
      )
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (result.error || !result.data || result.data.status !== "confirmed")
      return null;

    const parsed = orgEnvironmentInputSchema.safeParse({
      vpnClient: result.data.vpn_client,
      mdmProvider: result.data.mdm_provider,
      emailStack: result.data.email_stack,
      chatStack: result.data.chat_stack,
      ssoProvider: result.data.sso_provider,
      standardPlatforms: result.data.standard_platforms,
      standardOsVersions: result.data.standard_os_versions,
      printerFleet: result.data.printer_fleet,
      approvedSoftware: result.data.approved_software,
    });
    if (!parsed.success) return null;
    return {
      ...parsed.data,
      status: "confirmed",
      confirmedAt: result.data.confirmed_at,
    };
  } catch {
    return null;
  }
}

export function profileAnswers(
  profile: OrgEnvironmentProfile
): DiagnosticAnswer[] {
  const answers: DiagnosticAnswer[] = [];
  if (
    profile.standardPlatforms.length === 1 &&
    profile.standardPlatforms[0] !== "Other"
  ) {
    answers.push({
      questionId: "which-platform",
      answer: `${profile.standardPlatforms[0]} (organization standard)`,
      source: "org_profile",
    });
  }
  if (profile.emailStack) {
    const emailName =
      profile.emailStack === "microsoft365"
        ? "Microsoft 365"
        : profile.emailStack === "google_workspace"
          ? "Google Workspace"
          : "organization email";
    answers.push({
      questionId: "account-managed",
      answer: `Yes — managed by the organization (${emailName})`,
      source: "org_profile",
    });
  }
  return answers;
}

export function defaultPlatform(
  profile: OrgEnvironmentProfile
): Platform | null {
  if (
    profile.standardPlatforms.length !== 1 ||
    profile.standardPlatforms[0] === "Other"
  )
    return null;
  return profile.standardPlatforms[0] as Platform;
}
