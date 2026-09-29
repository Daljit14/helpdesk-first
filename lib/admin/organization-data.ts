import { createAdminClient } from "@/lib/supabase/admin";
import { getOrganizationPolicy } from "@/lib/admin/policies";

/** Everything the Users and Settings pages need about one organization. */
export async function loadOrganizationData(organizationId: string) {
  const admin = createAdminClient();
  const [
    { data: organization },
    { data: members },
    { data: domains },
    { data: invitations },
    policy,
  ] = await Promise.all([
    admin
      .from("organizations")
      .select("name")
      .eq("id", organizationId)
      .maybeSingle(),
    admin
      .from("organization_members")
      .select("user_id,role,joined_via")
      .eq("organization_id", organizationId)
      .order("created_at"),
    admin
      .from("organization_domains")
      .select("id,domain,verified,verification_token")
      .eq("organization_id", organizationId)
      .order("created_at"),
    admin
      .from("organization_invitations")
      .select("id,email,role,expires_at")
      .eq("organization_id", organizationId)
      .is("accepted_at", null)
      .is("revoked_at", null)
      .order("created_at", { ascending: false }),
    getOrganizationPolicy(organizationId),
  ]);
  return {
    organizationName: organization?.name ?? "Organization",
    members: members ?? [],
    domains: domains ?? [],
    invitations: invitations ?? [],
    policy,
  };
}
