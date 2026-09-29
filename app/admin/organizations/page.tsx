import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Activity, Building2, Clock, Globe2 } from "lucide-react";
import { requireAdminPage } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { PlatformOrganizationsPanel } from "@/components/admin/platform-organizations-panel";
import {
  AdminHero,
  AdminPage,
  HeroChip,
  StatGrid,
  StatTile,
} from "@/components/admin/ui/admin-kit";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Organizations",
  robots: { index: false, follow: false },
};

function summarize(rows: { name: string; created_at: string }[]) {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const within = (days: number) =>
    rows.filter((row) => now - Date.parse(row.created_at) < days * day).length;
  const newest = rows[0]?.name ?? "—";
  return {
    last7: within(7),
    last30: within(30),
    newest: newest.length > 22 ? `${newest.slice(0, 21)}…` : newest,
  };
}

export default async function OrganizationsPage() {
  const session = await requireAdminPage("/admin/organizations");
  if (!session.isPlatformAdmin) notFound();
  const { data: organizations } = await createAdminClient()
    .from("organizations")
    .select("id,name,created_at")
    .order("created_at", { ascending: false });
  const rows = organizations ?? [];
  const { last7, last30, newest } = summarize(rows);
  return (
    <AdminPage>
      <AdminHero
        eyebrow="Platform administration"
        title="Organizations"
        description="Every tenant on this help desk platform."
        icon={Building2}
        tone="midnight"
      >
        <div className="flex flex-wrap gap-2">
          <HeroChip label="Organizations" value={rows.length} />
          <HeroChip label="New this month" value={last30} pulse={last7 > 0} />
        </div>
      </AdminHero>

      <StatGrid columns={3}>
        <StatTile
          label="Organizations"
          value={rows.length}
          icon={Globe2}
          index={0}
        />
        <StatTile
          label="Created in last 30 days"
          value={last30}
          icon={Activity}
          tone="info"
          index={1}
          hint={`${last7} in the last 7 days`}
        />
        <StatTile
          label="Newest"
          value={newest}
          icon={Clock}
          tone="good"
          index={2}
        />
      </StatGrid>

      <PlatformOrganizationsPanel organizations={rows} />
    </AdminPage>
  );
}
