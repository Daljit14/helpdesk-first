import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OrganizationPanel } from "@/components/admin/organization-panel";
import { requireAdminPage } from "@/lib/admin/auth";
import { getOrganizationPolicy } from "@/lib/admin/policies";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Organization",
  robots: { index: false, follow: false },
};

export default async function OrganizationPage() {
  const session = await requireAdminPage("/admin/organization");
  if (session.role !== "org_admin") notFound();
  const admin = createAdminClient();
  const [
    { data: organization },
    { data: members },
    { data: domains },
    { data: invitations },
  ] = await Promise.all([
    admin
      .from("organizations")
      .select("name")
      .eq("id", session.organizationId)
      .maybeSingle(),
    admin
      .from("organization_members")
      .select("user_id,role,joined_via")
      .eq("organization_id", session.organizationId)
      .order("created_at"),
    admin
      .from("organization_domains")
      .select("id,domain,verified,verification_token")
      .eq("organization_id", session.organizationId)
      .order("created_at"),
    admin
      .from("organization_invitations")
      .select("id,email,role,expires_at")
      .eq("organization_id", session.organizationId)
      .is("accepted_at", null)
      .is("revoked_at", null)
      .order("created_at", { ascending: false }),
  ]);
  const policy = await getOrganizationPolicy(session.organizationId);
  return (
    <section className="flex flex-1 flex-col px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-5xl">
        <p className="text-sm text-muted-foreground">Administration</p>
        <h1 className="mt-2 text-3xl font-bold">Organization</h1>
        <div className="mt-6">
          <OrganizationPanel
            organizationName={organization?.name ?? "Organization"}
            allowVerificationException={policy.allowVerificationException}
            members={members ?? []}
            domains={domains ?? []}
            invitations={invitations ?? []}
          />
        </div>
      </div>
    </section>
  );
}
