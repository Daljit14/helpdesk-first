import type { Metadata } from "next";
import { AdminDashboard } from "@/components/admin/admin-dashboard";
import { requireAdminPage } from "@/lib/admin/auth";
import {
  defaultAdminFilters,
  getOperationsData,
} from "@/lib/admin/operations-data";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Operations",
  robots: { index: false, follow: false },
};

export default async function OperationsPage() {
  const session = await requireAdminPage("/admin/operations");
  const snapshot = await getOperationsData(session, defaultAdminFilters());
  return <AdminDashboard initialSnapshot={snapshot} />;
}
