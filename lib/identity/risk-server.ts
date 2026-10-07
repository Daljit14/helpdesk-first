import type { createAdminClient } from "@/lib/supabase/admin";
import { loadDirectoryForOrganization } from "@/lib/autonomy/connectors";
import { checkRequesterEmailForOrg } from "@/lib/autonomy/connectors/binding";
import type { DirectoryRiskFacts } from "@/lib/autonomy/connectors/types";
import { CAPABILITIES } from "@/lib/autonomy/capabilities/registry";
import {
  isAccountCapability,
  namesOtherPerson,
  type AccountRiskFacts,
} from "./risk";

type Admin = ReturnType<typeof createAdminClient>;

const unknownDirectoryFacts: DirectoryRiskFacts = {
  privileged: null,
  mfaChangedAt: null,
  signIns: [],
  directoryPhone: null,
  managerName: null,
};

async function requesterDirectoryFacts(
  admin: Admin,
  organizationId: string,
  subjectUserId: string
): Promise<{
  requesterEmail: string | null;
  facts: DirectoryRiskFacts;
}> {
  const signal = AbortSignal.timeout(8_000);
  const operation = (async () => {
    const loaded = await loadDirectoryForOrganization(admin, organizationId);
    if (!loaded) return { requesterEmail: null, facts: unknownDirectoryFacts };
    const requester = await checkRequesterEmailForOrg(
      admin,
      organizationId,
      subjectUserId
    );
    if (!requester.ok)
      return { requesterEmail: null, facts: unknownDirectoryFacts };
    const account = await loaded.directory.lookupUserByEmail(
      requester.email,
      signal
    );
    if (
      !account.ok ||
      account.value.primaryEmail.toLowerCase() !== requester.email
    )
      return { requesterEmail: requester.email, facts: unknownDirectoryFacts };
    const risk = await loaded.directory.getRiskFacts(
      account.value.directoryUserId,
      signal
    );
    return {
      requesterEmail: requester.email,
      facts: risk.ok ? risk.value : unknownDirectoryFacts,
    };
  })();
  let rejectTimeout: (() => void) | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    rejectTimeout = () => reject(signal.reason);
    if (signal.aborted) rejectTimeout();
    else signal.addEventListener("abort", rejectTimeout, { once: true });
  });
  try {
    return await Promise.race([operation, timeout]);
  } catch {
    return { requesterEmail: null, facts: unknownDirectoryFacts };
  } finally {
    if (rejectTimeout) signal.removeEventListener("abort", rejectTimeout);
  }
}

async function organizationRolePrivilege(
  admin: Admin,
  organizationId: string,
  subjectUserId: string
): Promise<boolean | null> {
  try {
    const result = await admin
      .from("organization_members")
      .select("role")
      .eq("organization_id", organizationId)
      .eq("user_id", subjectUserId)
      .maybeSingle();
    if (result.error) return null;
    const role = result.data?.role;
    return ["org_admin", "admin", "platform_admin"].includes(role)
      ? true
      : null;
  } catch {
    return null;
  }
}

export async function isOrganizationPrivileged(
  admin: Admin,
  organizationId: string,
  subjectUserId: string
): Promise<boolean> {
  return (
    (await organizationRolePrivilege(admin, organizationId, subjectUserId)) ===
    true
  );
}

export async function loadAccountRiskFacts(
  admin: Admin,
  input: {
    organizationId: string;
    subjectUserId: string;
    currentRunId: string | null;
    texts: string[];
    now: Date;
  }
): Promise<AccountRiskFacts> {
  const cutoff = new Date(input.now.getTime() - 24 * 60 * 60 * 1_000);
  let priorAccountRequests24h: number | null = null;
  try {
    const accountCapabilityIds = CAPABILITIES.filter(isAccountCapability).map(
      (capability) => capability.id
    );
    const [approvals, executions] = await Promise.all([
      admin
        .from("approval_requests")
        .select("run_id,ticket_id")
        .eq("organization_id", input.organizationId)
        .in("capability_id", accountCapabilityIds)
        .gte("created_at", cutoff.toISOString())
        .limit(200),
      admin
        .from("capability_executions")
        .select("run_id")
        .eq("organization_id", input.organizationId)
        .in("capability_id", accountCapabilityIds)
        .gte("created_at", cutoff.toISOString())
        .limit(200),
    ]);
    if (approvals.error || executions.error)
      throw new Error("risk_request_lookup_failed");
    const candidateRunIds = new Set<string>();
    for (const row of [...(approvals.data ?? []), ...(executions.data ?? [])]) {
      if (typeof row.run_id === "string" && row.run_id !== input.currentRunId)
        candidateRunIds.add(row.run_id);
    }
    if (candidateRunIds.size === 0) {
      priorAccountRequests24h = 0;
    } else {
      const runs = await admin
        .from("resolution_runs")
        .select("id,ticket_id")
        .eq("organization_id", input.organizationId)
        .in("id", [...candidateRunIds]);
      if (runs.error) throw new Error("risk_run_lookup_failed");
      const runRows = runs.data ?? [];
      const ticketIds = [
        ...new Set(
          runRows
            .map((row) => row.ticket_id)
            .filter(
              (ticketId): ticketId is string => typeof ticketId === "string"
            )
        ),
      ];
      if (ticketIds.length === 0) {
        priorAccountRequests24h = 0;
      } else {
        const ownedTickets = await admin
          .from("tickets")
          .select("id")
          .eq("organization_id", input.organizationId)
          .in("id", ticketIds)
          .eq("user_id", input.subjectUserId);
        if (ownedTickets.error) throw new Error("risk_ticket_lookup_failed");
        const ownedTicketIds = new Set(
          (ownedTickets.data ?? []).map((row) => row.id as string)
        );
        priorAccountRequests24h = new Set(
          runRows
            .filter(
              (row) =>
                typeof row.id === "string" &&
                typeof row.ticket_id === "string" &&
                ownedTicketIds.has(row.ticket_id)
            )
            .map((row) => row.id as string)
        ).size;
      }
    }
  } catch {
    priorAccountRequests24h = null;
  }

  const directory = await requesterDirectoryFacts(
    admin,
    input.organizationId,
    input.subjectUserId
  );
  const orgRolePrivileged = await organizationRolePrivilege(
    admin,
    input.organizationId,
    input.subjectUserId
  );
  let newestDeviceEnrolledAt: string | null = null;
  try {
    const device = await admin
      .from("devices")
      .select("enrolled_at")
      .eq("organization_id", input.organizationId)
      .eq("user_id", input.subjectUserId)
      .eq("status", "active")
      .order("enrolled_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!device.error && typeof device.data?.enrolled_at === "string")
      newestDeviceEnrolledAt = device.data.enrolled_at;
  } catch {
    newestDeviceEnrolledAt = null;
  }
  return {
    priorAccountRequests24h,
    mfaChangedAt: directory.facts.mfaChangedAt,
    signIns: directory.facts.signIns,
    newestDeviceEnrolledAt,
    namesOtherPerson: namesOtherPerson(input.texts, directory.requesterEmail),
    privileged: orgRolePrivileged === true ? true : directory.facts.privileged,
  };
}

export async function loadCallerDirectoryFacts(
  admin: Admin,
  organizationId: string,
  subjectUserId: string
): Promise<{
  directoryPhone: string | null;
  managerName: string | null;
  privileged: boolean | null;
} | null> {
  const [directory, orgRolePrivileged] = await Promise.all([
    requesterDirectoryFacts(admin, organizationId, subjectUserId),
    organizationRolePrivilege(admin, organizationId, subjectUserId),
  ]);
  if (
    !directory.requesterEmail &&
    orgRolePrivileged !== true &&
    directory.facts === unknownDirectoryFacts
  )
    return null;
  return {
    directoryPhone: directory.facts.directoryPhone,
    managerName: directory.facts.managerName,
    privileged: orgRolePrivileged === true ? true : directory.facts.privileged,
  };
}
