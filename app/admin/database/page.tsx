import type { Metadata } from "next";
import { requireAdminPage } from "@/lib/admin/auth";
import { loadDbOverview } from "@/lib/admin/database-overview";
import { DatabaseOverview } from "@/components/admin/database-overview";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Database — Admin",
  robots: { index: false, follow: false },
};

export default async function DatabasePage() {
  const session = await requireAdminPage("/admin/database");
  const overview = await loadDbOverview({
    organizationId: session.isPlatformAdmin ? null : session.organizationId,
  });

  return <DatabaseOverview initial={overview} />;
}
