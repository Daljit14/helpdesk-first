import type { Metadata } from "next";
import { AdminDashboard } from "@/components/admin/admin-dashboard";
import { requireAdminPage } from "@/lib/admin/auth";
import {
  defaultAdminFilters,
  getOperationsData,
} from "@/lib/admin/operations-data";
import {
  isResolutionTrackingEnabled,
  isTicketWorkflowEnabled,
} from "@/lib/admin/flags";
import { notifyOverdueTickets } from "@/lib/tickets/notify";
import { getOrganizationPolicy } from "@/lib/admin/policies";
import { isUiV2Enabled } from "@/lib/ui-v2";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Operations",
  robots: { index: false, follow: false },
};

export default async function OperationsPage() {
  const session = await requireAdminPage("/admin/operations");
  if (isTicketWorkflowEnabled())
    void notifyOverdueTickets(session.organizationId);
  const snapshot = await getOperationsData(session, defaultAdminFilters());
  const organizationPolicy = await getOrganizationPolicy(
    session.organizationId
  );
  return (
    <AdminDashboard
      initialSnapshot={snapshot}
      resolutionTrackingEnabled={isResolutionTrackingEnabled()}
      workflowEnabled={isTicketWorkflowEnabled()}
      organizationPolicy={organizationPolicy}
      uiV2={isUiV2Enabled()}
    />
  );
}
