import { redactAuditDetail } from "../audit/redact";
import { auditVersions } from "../audit/versions";
import type { RollbackHandler, RollbackResult } from "./types";
import { getIdentityBinding } from "@/lib/autonomy/connectors/binding";
import { loadDirectoryForOrganization } from "@/lib/autonomy/connectors";

const handlers: RollbackHandler[] = [
  {
    capabilityId: "grant_group_access",
    version: 1,
    method: "handler:remove_group_access",
    async run(context): Promise<RollbackResult> {
      const groupId =
        typeof context.parameters.groupId === "string"
          ? context.parameters.groupId
          : null;
      const binding = await getIdentityBinding(context.admin, context.runId);
      const loaded = await loadDirectoryForOrganization(
        context.admin,
        context.organizationId
      );
      if (!groupId || !binding || !loaded) {
        return { ok: false, output: {}, error: "identity_unbound" };
      }
      const result = await loaded.directory.removeFromGroup(
        binding.directoryUserId,
        groupId,
        context.signal
      );
      if (!result.ok)
        return { ok: false, output: {}, error: result.error.kind };
      await context.admin.from("resolution_events").insert({
        organization_id: context.organizationId,
        run_id: context.runId,
        ticket_id: context.ticketId,
        kind: "identity.group_grant_rolled_back",
        actor: "orchestrator",
        detail: redactAuditDetail({
          groupId,
          removedAt: result.value.removedAt,
        }),
        initiated_by: "ai",
        versions: auditVersions({ id: "grant_group_access", version: 1 }),
      });
      return {
        ok: true,
        output: { groupId, removedAt: result.value.removedAt },
      };
    },
  },
  {
    capabilityId: "route_to_department",
    version: 1,
    method: "compensating",
    async run(context): Promise<RollbackResult> {
      if (context.signal.aborted)
        return { ok: false, output: {}, error: "aborted" };
      const department =
        typeof context.parameters.department === "string"
          ? context.parameters.department
          : null;
      const detail = redactAuditDetail({ department });
      await context.admin.from("resolution_events").insert({
        organization_id: context.organizationId,
        run_id: context.runId,
        ticket_id: context.ticketId,
        kind: "ticket.department_routing_reverted",
        actor: "orchestrator",
        detail,
        initiated_by: "ai",
        versions: auditVersions({ id: "route_to_department", version: 1 }),
      });
      if (context.signal.aborted)
        return { ok: false, output: {}, error: "aborted" };
      await context.admin.from("resolution_events").insert({
        organization_id: context.organizationId,
        run_id: context.runId,
        ticket_id: context.ticketId,
        kind: "resolution.event",
        actor: "orchestrator",
        detail: redactAuditDetail({
          action: "route_to_department.rollback",
          department,
        }),
        initiated_by: "ai",
        versions: auditVersions({ id: "route_to_department", version: 1 }),
      });
      const output: RollbackResult["output"] = {
        reverted: true,
        department,
      };
      return { ok: true, output };
    },
  },
];

export function getRollbackHandler(
  capabilityId: string,
  version: number
): RollbackHandler | null {
  return (
    handlers.find(
      (handler) =>
        handler.capabilityId === capabilityId && handler.version === version
    ) ?? null
  );
}
