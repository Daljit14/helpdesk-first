import { createHash } from "node:crypto";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { enqueueNotification } from "@/lib/notifications/enqueue";
import { buildNotification } from "@/lib/notifications/templates";
import { getSiteUrl } from "@/lib/site-url";

export const DEFAULT_ORGANIZATION_ID = "00000000-0000-0000-0000-000000000001";

export type OrganizationMembership = {
  organizationId: string;
  role: "requester" | "support_agent" | "org_admin" | "platform_admin";
};

export function normalizeDomain(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/\.$/, "");
}

export function hashInvitationToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

export async function resolveOrganizationForUser(
  userId: string
): Promise<OrganizationMembership> {
  const { data } = await createAdminClient()
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (data) {
    return {
      organizationId: data.organization_id,
      role: data.role === "admin" ? "org_admin" : data.role,
    };
  }
  return { organizationId: DEFAULT_ORGANIZATION_ID, role: "requester" };
}

export async function ensureRequesterMembership(
  user: User,
  client?: SupabaseClient
): Promise<void> {
  try {
    const supabase = client ?? (await createClient());
    await supabase.rpc("claim_domain_membership");
    const existing = await createAdminClient()
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();
    if (existing.data) return;
    await createAdminClient().from("organization_members").insert({
      organization_id: DEFAULT_ORGANIZATION_ID,
      user_id: user.id,
      role: "requester",
      joined_via: "default",
    });
    await sendWelcomeEmail(user.id);
  } catch (error) {
    console.error("requester membership provisioning failed", error);
  }
}

async function sendWelcomeEmail(userId: string): Promise<void> {
  try {
    const message = buildNotification("account.created", {
      ticketTitle: "HelpDesk First",
      ticketId: userId,
    });
    await enqueueNotification({
      organizationId: DEFAULT_ORGANIZATION_ID,
      ticketId: null,
      eventType: "account.created",
      recipientUserIds: [userId],
      ...message,
      url: `${getSiteUrl()}/tickets`,
      dedupeKey: `account.created:${userId}`,
    });
  } catch (error) {
    console.error("welcome email enqueue failed", error);
  }
}
