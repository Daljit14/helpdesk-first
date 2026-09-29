import { AdminDashboard, type TabId } from "@/components/admin/admin-dashboard";
import { requireAdminPage } from "@/lib/admin/auth";
import {
  defaultAdminFilters,
  getOperationsData,
  type AdminFilters,
} from "@/lib/admin/operations-data";
import {
  isResolutionTrackingEnabled,
  isTicketWorkflowEnabled,
} from "@/lib/admin/flags";
import { notifyOverdueTickets } from "@/lib/tickets/notify";
import { getOrganizationPolicy } from "@/lib/admin/policies";
import { isUiV2Enabled } from "@/lib/ui-v2";

const QUEUES = new Set<NonNullable<AdminFilters["queue"]>>([
  "needs_human",
  "assigned_to_me",
  "unassigned",
  "ai_working",
  "waiting",
  "sla_breached",
  "resolved",
  "reopened",
]);

export type OperationsSearchParams = {
  showExcluded?: string;
  queue?: string;
};

/**
 * Server view shared by /admin/operations, /admin/tickets and
 * /admin/analytics. Each sidebar department is a real route, so clicking it
 * always navigates and opens the right tab (and queue) on first render.
 */
export async function OperationsView({
  path,
  initialTab,
  params,
}: {
  path: string;
  initialTab: TabId;
  params: OperationsSearchParams;
}) {
  const session = await requireAdminPage(path);
  if (isTicketWorkflowEnabled())
    void notifyOverdueTickets(session.organizationId);
  const queue =
    params.queue &&
    QUEUES.has(params.queue as NonNullable<AdminFilters["queue"]>)
      ? (params.queue as AdminFilters["queue"])
      : undefined;
  const snapshot = await getOperationsData(session, {
    ...defaultAdminFilters(),
    ...(queue ? { queue } : {}),
    showExcluded: session.role === "org_admin" && params.showExcluded === "1",
  });
  const organizationPolicy = await getOrganizationPolicy(
    session.organizationId
  );
  return (
    <AdminDashboard
      // Remount when the sidebar switches queue so state starts fresh.
      key={`${path}:${queue ?? "all"}`}
      initialSnapshot={snapshot}
      resolutionTrackingEnabled={isResolutionTrackingEnabled()}
      workflowEnabled={isTicketWorkflowEnabled()}
      organizationPolicy={organizationPolicy}
      uiV2={isUiV2Enabled()}
      initialTab={initialTab}
      basePath={path}
    />
  );
}
