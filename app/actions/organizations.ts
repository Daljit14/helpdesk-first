"use server";

import { randomBytes } from "node:crypto";
import { promises as dns } from "node:dns";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSiteUrl } from "@/lib/site-url";
import { getAdminSession, recordAudit } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  hashInvitationToken,
  normalizeDomain,
  resolveOrganizationForUser,
} from "@/lib/org/membership";
import {
  domainSchema,
  invitationSchema,
  organizationSchema,
  roleSchema,
} from "@/lib/org/schemas";

type Result = { error: string } | { success: true; [key: string]: unknown };

async function orgAdmin() {
  const session = await getAdminSession();
  return session?.role === "org_admin" ? session : null;
}

export async function createOrganization(input: unknown): Promise<Result> {
  const session = await getAdminSession();
  if (!session?.isPlatformAdmin) return { error: "Not authorized." };
  const parsed = organizationSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid organization details." };
  const admin = createAdminClient();
  const { data: organization, error } = await admin
    .from("organizations")
    .insert({ name: parsed.data.name })
    .select("id")
    .single();
  if (error || !organization)
    return { error: "Unable to create organization." };
  await admin.from("organization_policies").insert({
    organization_id: organization.id,
  });
  let inviteUrl: string | null = null;
  if (parsed.data.ownerEmail) {
    const rawToken = randomBytes(32).toString("hex");
    await admin.from("organization_invitations").insert({
      organization_id: organization.id,
      email: parsed.data.ownerEmail,
      role: "org_admin",
      token_hash: hashInvitationToken(rawToken),
      invited_by: session.userId,
    });
    inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL || getSiteUrl()}/invite/${rawToken}`;
  }
  await recordAudit(session, "organization.create", organization.id);
  revalidatePath("/admin/organizations");
  return { success: true, organizationId: organization.id, inviteUrl };
}

export async function addDomain(input: unknown): Promise<Result> {
  const session = await orgAdmin();
  if (!session) return { error: "Not authorized." };
  const parsed = domainSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid domain." };
  const domain = normalizeDomain(parsed.data.domain);
  if (
    !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(
      domain
    )
  ) {
    return { error: "Invalid domain." };
  }
  const { error } = await createAdminClient()
    .from("organization_domains")
    .insert({
      organization_id: session.organizationId,
      domain,
      created_by: session.userId,
    });
  if (error) return { error: "Unable to add domain." };
  await recordAudit(session, "organization.domain_add", domain);
  revalidatePath("/admin/organization");
  return { success: true };
}

export async function verifyDomain(input: unknown): Promise<Result> {
  const session = await orgAdmin();
  if (!session) return { error: "Not authorized." };
  const id = z.string().uuid().safeParse(input);
  if (!id.success) return { error: "Invalid domain." };
  const admin = createAdminClient();
  const { data: domain } = await admin
    .from("organization_domains")
    .select("id,domain,verification_token")
    .eq("id", id.data)
    .eq("organization_id", session.organizationId)
    .maybeSingle();
  if (!domain) return { error: "Domain not found." };
  try {
    const records = await dns.resolveTxt(`_helpdesk-first.${domain.domain}`);
    const values = records.map((record) => record.join(""));
    if (
      !values.includes(`helpdesk-first-verify=${domain.verification_token}`)
    ) {
      return { error: "Verification record not found." };
    }
  } catch {
    return { error: "Verification record not found." };
  }
  const { error } = await admin
    .from("organization_domains")
    .update({ verified: true, verified_at: new Date().toISOString() })
    .eq("id", domain.id);
  if (error) return { error: "Unable to verify domain." };
  await recordAudit(session, "organization.domain_verify", domain.domain);
  revalidatePath("/admin/organization");
  return { success: true };
}

export async function inviteMember(input: unknown): Promise<Result> {
  const session = await orgAdmin();
  if (!session) return { error: "Not authorized." };
  const parsed = invitationSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid invitation." };
  const rawToken = randomBytes(32).toString("hex");
  const { error } = await createAdminClient()
    .from("organization_invitations")
    .insert({
      organization_id: session.organizationId,
      email: parsed.data.email,
      role: parsed.data.role,
      token_hash: hashInvitationToken(rawToken),
      invited_by: session.userId,
    });
  if (error) return { error: "Unable to create invitation." };
  await recordAudit(session, "organization.invite", parsed.data.email);
  revalidatePath("/admin/organization");
  return {
    success: true,
    inviteUrl: `${process.env.NEXT_PUBLIC_APP_URL || getSiteUrl()}/invite/${rawToken}`,
  };
}

export async function revokeInvitation(id: string): Promise<Result> {
  const session = await orgAdmin();
  if (!session) return { error: "Not authorized." };
  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) return { error: "Invalid invitation." };
  const { error } = await createAdminClient()
    .from("organization_invitations")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", parsed.data)
    .eq("organization_id", session.organizationId);
  if (error) return { error: "Unable to revoke invitation." };
  await recordAudit(session, "organization.invitation_revoke", id);
  revalidatePath("/admin/organization");
  return { success: true };
}

export async function updateMemberRole(
  userId: string,
  role: string
): Promise<Result> {
  const session = await orgAdmin();
  if (!session || userId === session.userId)
    return { error: "Not authorized." };
  const parsed = roleSchema.safeParse(role);
  if (!parsed.success) return { error: "Invalid role." };
  const admin = createAdminClient();
  const { data: member } = await admin
    .from("organization_members")
    .select("role")
    .eq("organization_id", session.organizationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!member) return { error: "Member not found." };
  if (
    (member.role === "org_admin" || member.role === "admin") &&
    parsed.data !== "org_admin"
  ) {
    const { count } = await admin
      .from("organization_members")
      .select("user_id", { count: "exact", head: true })
      .eq("organization_id", session.organizationId)
      .in("role", ["org_admin", "admin"]);
    if ((count ?? 0) <= 1)
      return { error: "The last organization admin cannot be demoted." };
  }
  const { error } = await admin
    .from("organization_members")
    .update({ role: parsed.data, updated_at: new Date().toISOString() })
    .eq("organization_id", session.organizationId)
    .eq("user_id", userId);
  if (error) return { error: "Unable to update member role." };
  await recordAudit(session, "organization.member_role", userId);
  revalidatePath("/admin/organization");
  return { success: true };
}

export async function removeMember(userId: string): Promise<Result> {
  const session = await orgAdmin();
  if (!session || userId === session.userId)
    return { error: "Not authorized." };
  const admin = createAdminClient();
  const { data: member } = await admin
    .from("organization_members")
    .select("role")
    .eq("organization_id", session.organizationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!member) return { error: "Member not found." };
  if (member.role === "org_admin" || member.role === "admin") {
    const { count } = await admin
      .from("organization_members")
      .select("user_id", { count: "exact", head: true })
      .eq("organization_id", session.organizationId)
      .in("role", ["org_admin", "admin"]);
    if ((count ?? 0) <= 1)
      return { error: "The last organization admin cannot be removed." };
  }
  const { error } = await admin
    .from("organization_members")
    .delete()
    .eq("organization_id", session.organizationId)
    .eq("user_id", userId);
  if (error) return { error: "Unable to remove member." };
  await recordAudit(session, "organization.member_remove", userId);
  revalidatePath("/admin/organization");
  return { success: true };
}

export async function acceptInvitationAction(token: string): Promise<Result> {
  const parsed = z.string().min(1).safeParse(token);
  if (!parsed.success) return { error: "Invalid invitation." };
  const supabase = await createClient();
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return { error: "Please sign in first." };
  const { error } = await supabase.rpc("accept_invitation", {
    raw_token: parsed.data,
  });
  if (error) return { error: "This invitation is invalid or expired." };
  const membership = await resolveOrganizationForUser(user.user.id);
  return { success: true, role: membership.role };
}
