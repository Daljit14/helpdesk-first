import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { VendorDomainsPanel } from "@/components/admin/vendor-domains-panel";
import {
  AdminHero,
  AdminPage,
  HeroChip,
  Panel,
} from "@/components/admin/ui/admin-kit";
import { requireAdminPage } from "@/lib/admin/auth";
import { isOrgVendorDomainsEnabled } from "@/lib/admin/flags";
import { ORG_VENDOR_DOMAIN_LIMIT } from "@/lib/research/vendor-domains";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Trusted vendor docs",
  robots: { index: false, follow: false },
};

type DomainRow = {
  id: string;
  domain: string;
  added_by: string | null;
  created_at: string;
};

function missingTable(error: { code?: string } | null): boolean {
  return error?.code === "42P01" || error?.code === "PGRST205";
}

export default async function VendorDomainsPage() {
  const session = await requireAdminPage("/admin/vendor-domains");
  if (!isOrgVendorDomainsEnabled() || session.role !== "org_admin") notFound();

  const admin = createAdminClient();
  const result = await admin
    .from("org_research_vendor_domains")
    .select("id,domain,added_by,created_at")
    .eq("organization_id", session.organizationId)
    .order("created_at")
    .limit(ORG_VENDOR_DOMAIN_LIMIT);
  const rows = result.error ? [] : ((result.data ?? []) as DomainRow[]);
  const addedByIds = [
    ...new Set(
      rows
        .map((row) => row.added_by)
        .filter((userId): userId is string => Boolean(userId))
    ),
  ];
  const profiles =
    addedByIds.length > 0
      ? await admin
          .from("admin_profiles")
          .select("user_id,display_name")
          .in("user_id", addedByIds)
      : { data: [], error: null };
  const displayNames = new Map(
    (profiles.data ?? []).map((profile) => [
      String(profile.user_id),
      String(profile.display_name ?? profile.user_id),
    ])
  );
  const domains = rows.map((row) => ({
    id: row.id,
    domain: row.domain,
    addedByName: row.added_by
      ? (displayNames.get(row.added_by) ?? row.added_by)
      : "Unknown",
    createdAt: row.created_at,
  }));

  return (
    <AdminPage>
      <AdminHero
        eyebrow="Organization settings"
        title="Trusted vendor docs"
        description="Approve exact vendor documentation domains for research citations in this organization."
        icon={ShieldCheck}
        tone="forest"
      >
        <HeroChip
          label="Organization domains"
          value={`${domains.length} of ${ORG_VENDOR_DOMAIN_LIMIT}`}
        />
      </AdminHero>

      {missingTable(result.error) && (
        <p
          role="status"
          className="rounded-2xl border border-status-warning/40 bg-status-warning/10 p-3 text-sm font-bold text-status-warning"
        >
          Trusted vendor docs table not applied
        </p>
      )}

      <Panel
        title="Approved documentation sources"
        description="Organization-approved domains are citation sources only. They do not authorize actions."
        icon={ShieldCheck}
      >
        <VendorDomainsPanel domains={domains} />
      </Panel>
    </AdminPage>
  );
}
