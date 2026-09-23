import type { Verifier, VerifierContext, VerifierResult } from "./types";
import { loadDirectoryForOrganization } from "@/lib/autonomy/connectors";
import { getIdentityBinding } from "@/lib/autonomy/connectors/binding";
import { getDeviceAction } from "@/lib/device-agent/catalog";

export const VERIFIER_VERSION = "1";

const informational = (
  outcome: VerifierResult["outcome"],
  evidence: VerifierResult["evidence"] = {}
): VerifierResult => ({ outcome, evidence, userConfirmationRequired: false });

const resolving = (
  outcome: VerifierResult["outcome"],
  evidence: VerifierResult["evidence"] = {}
): VerifierResult => ({ outcome, evidence, userConfirmationRequired: true });

function idParam(ctx: VerifierContext, key: string): string | null {
  const value = ctx.parameters[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

async function readTicket(ctx: VerifierContext, columns: string) {
  return ctx.admin
    .from("tickets")
    .select(columns)
    .eq("id", ctx.ticketId)
    .eq("organization_id", ctx.organizationId)
    .maybeSingle();
}

async function outboxStatus(ctx: VerifierContext): Promise<VerifierResult> {
  const notificationId = idParam(ctx, "notificationId");
  if (!notificationId) {
    return resolving("inconclusive", { reason: "missing_notification_id" });
  }
  const result = await ctx.admin
    .from("notification_outbox")
    .select("status,sent_at")
    .eq("id", notificationId)
    .eq("organization_id", ctx.organizationId)
    .eq("ticket_id", ctx.ticketId)
    .maybeSingle();
  if (result.error || !result.data) {
    return resolving("inconclusive", { reason: "outbox_row_not_found" });
  }
  const row = result.data as { status: string; sent_at: string | null };
  const evidence = { status: row.status, sentAt: row.sent_at ?? null };
  if (row.status === "sent") return resolving("passed", evidence);
  if (row.status === "failed" || row.status === "dead") {
    return resolving("failed", evidence);
  }
  return resolving("inconclusive", evidence);
}

async function hasResolutionEvent(
  ctx: VerifierContext,
  kinds: string[]
): Promise<boolean> {
  const result = await ctx.admin
    .from("resolution_events")
    .select("id")
    .eq("organization_id", ctx.organizationId)
    .eq("run_id", ctx.runId)
    .in("kind", kinds)
    .limit(1);
  return !result.error && (result.data ?? []).length > 0;
}

const none: Verifier = {
  method: "none",
  version: VERIFIER_VERSION,
  async verify() {
    return informational("inconclusive", { reason: "no_verification_method" });
  },
};

const diagnosticAnswerRecorded: Verifier = {
  method: "diagnostic_answer_recorded",
  version: VERIFIER_VERSION,
  async verify(ctx) {
    const questionId = idParam(ctx, "questionId");
    const ticket = await readTicket(ctx, "diagnostic_answers");
    if (ticket.error || !ticket.data) {
      return informational("inconclusive", { reason: "ticket_not_found" });
    }
    const answers = (ticket.data as unknown as { diagnostic_answers: unknown })
      .diagnostic_answers;
    const answered =
      Array.isArray(answers) &&
      answers.some(
        (answer) =>
          answer !== null &&
          typeof answer === "object" &&
          "questionId" in answer &&
          (answer as { questionId: unknown }).questionId === questionId
      );
    return informational(answered ? "passed" : "inconclusive", {
      questionId,
      answered,
    });
  },
};

const investigationContextPresent: Verifier = {
  method: "investigation_context_present",
  version: VERIFIER_VERSION,
  async verify(ctx) {
    const result = await ctx.admin
      .from("ticket_investigations")
      .select("id,context")
      .eq("ticket_id", ctx.ticketId)
      .eq("organization_id", ctx.organizationId)
      .limit(1)
      .maybeSingle();
    if (result.error || !result.data) {
      return informational("inconclusive", { reason: "no_investigation" });
    }
    const context = (result.data as { context: unknown }).context;
    const present =
      context !== null &&
      typeof context === "object" &&
      Object.keys(context).length > 0;
    return informational(present ? "passed" : "inconclusive", { present });
  },
};

const statusResponseCaptured: Verifier = {
  method: "status_response_captured",
  version: VERIFIER_VERSION,
  async verify(ctx) {
    if (!ctx.executionId) {
      return informational("inconclusive", { reason: "no_execution" });
    }
    const result = await ctx.admin
      .from("capability_executions")
      .select("status")
      .eq("id", ctx.executionId)
      .eq("organization_id", ctx.organizationId)
      .maybeSingle();
    const status = (result.data as { status: string } | null)?.status ?? null;
    return informational(status === "succeeded" ? "passed" : "inconclusive", {
      executionStatus: status,
    });
  },
};

const outboxStatusSent: Verifier = {
  method: "outbox_status_sent",
  version: VERIFIER_VERSION,
  verify: outboxStatus,
};

const outboxSentAndUserConfirms: Verifier = {
  method: "outbox_sent_and_user_confirms",
  version: VERIFIER_VERSION,
  verify: outboxStatus,
};

const attachmentStatusRead: Verifier = {
  method: "attachment_status_read",
  version: VERIFIER_VERSION,
  async verify(ctx) {
    const attachmentId = idParam(ctx, "attachmentId");
    if (!attachmentId) {
      return informational("inconclusive", { reason: "missing_attachment_id" });
    }
    const result = await ctx.admin
      .from("ticket_attachments")
      .select("status")
      .eq("id", attachmentId)
      .eq("ticket_id", ctx.ticketId)
      .eq("organization_id", ctx.organizationId)
      .maybeSingle();
    if (result.error || !result.data) {
      return informational("inconclusive", { reason: "attachment_not_found" });
    }
    const scanStatus =
      (result.data as { status: string | null }).status ?? null;
    return informational(scanStatus ? "passed" : "inconclusive", {
      scanStatus,
    });
  },
};

const escalationPackagePresent: Verifier = {
  method: "escalation_package_present",
  version: VERIFIER_VERSION,
  async verify(ctx) {
    const ticket = await readTicket(ctx, "escalation_package_at");
    const at =
      (ticket.data as { escalation_package_at: string | null } | null)
        ?.escalation_package_at ?? null;
    return informational(at ? "passed" : "inconclusive", { packageAt: at });
  },
};

const userVerificationAnswer: Verifier = {
  method: "user_verification_answer",
  version: VERIFIER_VERSION,
  async verify(ctx) {
    const ticket = await readTicket(ctx, "status");
    const status = (ticket.data as { status: string } | null)?.status ?? null;
    return resolving(
      status?.toLowerCase() === "pending verification"
        ? "passed"
        : "inconclusive",
      { ticketStatus: status }
    );
  },
};

const assignmentUpdated: Verifier = {
  method: "assignment_updated",
  version: VERIFIER_VERSION,
  async verify(ctx) {
    const routed = await hasResolutionEvent(ctx, ["ticket.department_routed"]);
    return informational(routed ? "passed" : "inconclusive", { routed });
  },
};

const needsHumanWithPackage: Verifier = {
  method: "needs_human_with_package",
  version: VERIFIER_VERSION,
  async verify(ctx) {
    const ticket = await readTicket(ctx, "status,escalation_package_at");
    const row = ticket.data as {
      status: string;
      escalation_package_at: string | null;
    } | null;
    const ok =
      row?.status?.toLowerCase() === "needs human" &&
      Boolean(row.escalation_package_at);
    return informational(ok ? "passed" : "inconclusive", {
      ticketStatus: row?.status ?? null,
      packageAt: row?.escalation_package_at ?? null,
    });
  },
};

const directoryStatusRead: Verifier = {
  method: "directory_status_read",
  version: VERIFIER_VERSION,
  async verify(ctx) {
    const result = await ctx.admin
      .from("capability_executions")
      .select("result,status")
      .eq("id", ctx.executionId ?? "")
      .eq("organization_id", ctx.organizationId)
      .maybeSingle();
    const output = (
      result.data as {
        result?: Record<string, unknown>;
        status?: string;
      } | null
    )?.result;
    const passed = Boolean(
      output && ("enabled" in output || "tokenAcquired" in output)
    );
    return informational(passed ? "passed" : "inconclusive", {
      status: result.data?.status ?? null,
    });
  },
};

const directorySignInAfterAction: Verifier = {
  method: "directory_signin_after_action",
  version: VERIFIER_VERSION,
  async verify(ctx) {
    const confirmed = await readTicket(ctx, "user_confirmed");
    const userConfirmed = Boolean(
      (confirmed.data as { user_confirmed?: boolean } | null)?.user_confirmed
    );
    if (userConfirmed) return resolving("passed", { userConfirmed });
    if (!ctx.executionId) {
      return resolving("inconclusive", { reason: "no_execution" });
    }
    const execution = await ctx.admin
      .from("capability_executions")
      .select("created_at,executed_at")
      .eq("id", ctx.executionId)
      .eq("organization_id", ctx.organizationId)
      .maybeSingle();
    const executedAt =
      (execution.data as { executed_at?: string; created_at?: string } | null)
        ?.executed_at ??
      (execution.data as { created_at?: string } | null)?.created_at;
    const binding = await getIdentityBinding(ctx.admin, ctx.runId);
    const loaded = binding
      ? await loadDirectoryForOrganization(ctx.admin, ctx.organizationId)
      : null;
    if (!binding || !loaded) {
      return resolving("inconclusive", {
        reason: "identity_unbound_or_connector_unavailable",
      });
    }
    const user = await ctx.admin.auth.admin.getUserById(binding.userId);
    const email = user.data.user?.email;
    if (!email || !executedAt) {
      return resolving("inconclusive", {
        reason: "missing_identity_or_execution",
      });
    }
    const directory = await loaded.directory.lookupUserByEmail(
      email,
      ctx.signal
    );
    if (!directory.ok) {
      return resolving(
        "inconclusive",
        directory.error.kind === "unsupported"
          ? { reason: "sign_in_activity_unsupported" }
          : { reason: directory.error.kind }
      );
    }
    const lastSignInAt = directory.value.lastSignInAt;
    const passed =
      lastSignInAt !== null &&
      new Date(lastSignInAt).getTime() > new Date(executedAt).getTime();
    return resolving(passed ? "passed" : "inconclusive", {
      lastSignInAt,
      executedAt,
      userConfirmed,
    });
  },
};

const directoryGroupMembership: Verifier = {
  method: "directory_group_membership",
  version: VERIFIER_VERSION,
  async verify(ctx) {
    const groupId = idParam(ctx, "groupId");
    const binding = await getIdentityBinding(ctx.admin, ctx.runId);
    const loaded = binding
      ? await loadDirectoryForOrganization(ctx.admin, ctx.organizationId)
      : null;
    if (!groupId || !binding || !loaded) {
      return resolving("inconclusive", { reason: "identity_or_group_missing" });
    }
    const result = await loaded.directory.isMemberOfGroup(
      binding.directoryUserId,
      groupId,
      ctx.signal
    );
    if (!result.ok)
      return resolving("inconclusive", { reason: result.error.kind });
    return resolving(result.value ? "passed" : "inconclusive", {
      groupId,
      isMemberOfGroup: result.value,
    });
  },
};

const deviceJobCompleted: Verifier = {
  method: "device_job_completed",
  version: VERIFIER_VERSION,
  async verify(ctx) {
    if (!ctx.executionId)
      return informational("inconclusive", { reason: "no_execution" });
    const jobResult = await ctx.admin
      .from("device_jobs")
      .select(
        "status,mode,created_at,result,action_id,action_version,device_id"
      )
      .eq("organization_id", ctx.organizationId)
      .eq("execution_id", ctx.executionId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (jobResult.error || !jobResult.data)
      return informational("inconclusive", { reason: "job_missing" });
    const job = jobResult.data as {
      status: string;
      mode: string;
      created_at: string;
      result: Record<string, unknown>;
      action_id: string;
      action_version: number;
      device_id: string;
    };
    const action = getDeviceAction(job.action_id, job.action_version);
    if (!action) return informational("failed", { reason: "unknown_action" });
    const diagnostics = await ctx.admin
      .from("device_diagnostics")
      .select("kind,collected_at")
      .eq("organization_id", ctx.organizationId)
      .eq("device_id", job.device_id)
      .gt("collected_at", job.created_at)
      .in("kind", action.requiresDiagnostics)
      .limit(20);
    const fresh =
      (diagnostics.data ?? []).length >= action.requiresDiagnostics.length;
    if (!fresh)
      return informational("inconclusive", {
        reason: "post_diagnostics_missing",
      });
    if (job.status === "queued" || job.status === "leased")
      return informational("inconclusive", { status: job.status });
    if (["expired", "failed", "unsupported", "cancelled"].includes(job.status))
      return informational("failed", { status: job.status });
    if (job.status === "shadowed")
      return informational("passed", { mode: "shadow", wouldRun: true });
    if (job.status === "succeeded" && action.sideEffects === "read_only")
      return informational("passed", { mode: job.mode });
    return resolving("passed", { mode: job.mode });
  },
};

export const VERIFIERS: readonly Verifier[] = [
  none,
  diagnosticAnswerRecorded,
  investigationContextPresent,
  statusResponseCaptured,
  outboxStatusSent,
  outboxSentAndUserConfirms,
  attachmentStatusRead,
  escalationPackagePresent,
  userVerificationAnswer,
  assignmentUpdated,
  needsHumanWithPackage,
  directoryStatusRead,
  directorySignInAfterAction,
  directoryGroupMembership,
  deviceJobCompleted,
];

export function getVerifier(method: string): Verifier | null {
  return VERIFIERS.find((verifier) => verifier.method === method) ?? null;
}
