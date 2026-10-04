"use server";

import { revalidatePath } from "next/cache";
import { isOrgEnvironmentEnabled } from "@/lib/admin/flags";
import { getAdminSession, recordAudit } from "@/lib/admin/auth";
import { createRateLimiter, getRateLimitConfig } from "@/lib/ai/rate-limit";
import { orgEnvironmentInputSchema } from "@/lib/org-environment/types";
import { createAdminClient } from "@/lib/supabase/admin";

export type OrgEnvironmentActionState = { success: true } | { error: string };
type Result = OrgEnvironmentActionState | null;
type Session = NonNullable<Awaited<ReturnType<typeof getAdminSession>>>;

const limiter = createRateLimiter(
  { ...getRateLimitConfig(), maxRequests: 20 },
  "org-environment-profile"
);

async function sessionOrError(): Promise<Session | OrgEnvironmentActionState> {
  if (!isOrgEnvironmentEnabled())
    return { error: "Organization environment profile is disabled." };
  const session = await getAdminSession();
  if (!session || session.role !== "org_admin")
    return { error: "Organization admin access required." };
  if (
    !(
      await limiter.check(
        `org:${session.organizationId}:user:${session.userId}`
      )
    ).allowed
  )
    return { error: "Too many environment profile requests." };
  return session;
}

function nullableField(formData: FormData, name: string): unknown {
  const value = formData.get(name);
  if (value === null) return null;
  if (typeof value !== "string") return value;
  return value.trim() ? value : null;
}

function listField(formData: FormData, name: string): unknown[] {
  const value = formData.get(name);
  if (value === null) return [];
  if (typeof value !== "string") return [value];
  return value
    .split(/[,\r\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseInput(formData: FormData) {
  return orgEnvironmentInputSchema.safeParse({
    vpnClient: nullableField(formData, "vpnClient"),
    mdmProvider: nullableField(formData, "mdmProvider"),
    emailStack: nullableField(formData, "emailStack"),
    chatStack: nullableField(formData, "chatStack"),
    ssoProvider: nullableField(formData, "ssoProvider"),
    standardPlatforms: formData.getAll("standardPlatforms"),
    standardOsVersions: listField(formData, "standardOsVersions"),
    printerFleet: listField(formData, "printerFleet"),
    approvedSoftware: listField(formData, "approvedSoftware"),
  });
}

export async function saveOrgEnvironmentAction(
  _previous: Result,
  formData: FormData
): Promise<OrgEnvironmentActionState> {
  const session = await sessionOrError();
  if (!("organizationId" in session)) return session;
  const parsed = parseInput(formData);
  if (!parsed.success)
    return { error: "Review the environment profile fields and try again." };

  try {
    const now = new Date().toISOString();
    const result = await createAdminClient()
      .from("org_environment_profile")
      .upsert(
        {
          organization_id: session.organizationId,
          vpn_client: parsed.data.vpnClient,
          mdm_provider: parsed.data.mdmProvider,
          email_stack: parsed.data.emailStack,
          chat_stack: parsed.data.chatStack,
          sso_provider: parsed.data.ssoProvider,
          standard_platforms: parsed.data.standardPlatforms,
          standard_os_versions: parsed.data.standardOsVersions,
          printer_fleet: parsed.data.printerFleet,
          approved_software: parsed.data.approvedSoftware,
          status: "draft",
          updated_by: session.userId,
          updated_at: now,
          confirmed_by: null,
          confirmed_at: null,
        },
        { onConflict: "organization_id" }
      );
    if (result.error)
      return { error: "Environment profile could not be saved." };

    await recordAudit(session, "org_environment.saved", session.organizationId);
    revalidatePath("/admin/environment");
    return { success: true };
  } catch {
    return { error: "Environment profile could not be saved." };
  }
}

export async function confirmOrgEnvironmentAction(
  _previous: Result,
  _formData: FormData
): Promise<OrgEnvironmentActionState> {
  void _previous;
  void _formData;
  const session = await sessionOrError();
  if (!("organizationId" in session)) return session;

  try {
    const now = new Date().toISOString();
    const result = await createAdminClient()
      .from("org_environment_profile")
      .update({
        status: "confirmed",
        confirmed_by: session.userId,
        confirmed_at: now,
        updated_by: session.userId,
        updated_at: now,
      })
      .eq("organization_id", session.organizationId)
      .select("organization_id")
      .maybeSingle();
    if (result.error || !result.data)
      return { error: "Environment profile could not be confirmed." };

    await recordAudit(
      session,
      "org_environment.confirmed",
      session.organizationId
    );
    revalidatePath("/admin/environment");
    return { success: true };
  } catch {
    return { error: "Environment profile could not be confirmed." };
  }
}
