import { filterIssues } from "@/lib/search";
import { snapshotEscalationPackage } from "@/lib/investigation/escalation";
import { redactAuditDetail } from "../../audit/redact";
import { auditVersions, initiatedBy } from "../../audit/versions";
import type { HandlerContext, HandlerResult, CapabilityHandler } from "./types";
import { getIdentityBinding } from "@/lib/autonomy/connectors/binding";
import { loadDirectoryForOrganization } from "@/lib/autonomy/connectors";

const scalar = (
  output: Record<string, string | number | boolean | null>
): HandlerResult => ({ ok: true, output });

async function resolutionEvent(
  ctx: HandlerContext,
  kind: string,
  detail: Record<string, unknown>
): Promise<void> {
  await ctx.admin.from("resolution_events").insert({
    organization_id: ctx.organizationId,
    run_id: ctx.runId,
    ticket_id: ctx.ticketId,
    kind,
    actor: ctx.actor,
    detail: redactAuditDetail(detail),
    initiated_by: initiatedBy(ctx.actor),
    versions: auditVersions(),
  });
}

async function requesterEmail(
  ctx: HandlerContext,
  userId: string
): Promise<string | null> {
  const user = await ctx.admin.auth.admin.getUserById(userId);
  return user.data.user?.email ?? null;
}

function aborted(ctx: HandlerContext): HandlerResult | null {
  return ctx.signal.aborted
    ? { ok: false, output: {}, error: "aborted" }
    : null;
}

const handlers: CapabilityHandler[] = [
  {
    capabilityId: "search_approved_knowledge",
    version: 1,
    async run(ctx, params) {
      const stopped = aborted(ctx);
      if (stopped) return stopped;
      const matches = filterIssues({ query: String(params.query) });
      return scalar({
        matches: matches.length,
        topSlug: matches[0]?.id ?? null,
      });
    },
  },
  {
    capabilityId: "ask_diagnostic_question",
    version: 1,
    async run(ctx, params) {
      const stopped = aborted(ctx);
      if (stopped) return stopped;
      const ticket = await ctx.admin
        .from("tickets")
        .select("diagnostic_answers")
        .eq("id", ctx.ticketId)
        .eq("organization_id", ctx.organizationId)
        .maybeSingle();
      if (ticket.error)
        return { ok: false, output: {}, error: ticket.error.message };
      const questionId = String(params.questionId);
      const answers = Array.isArray(ticket.data?.diagnostic_answers)
        ? ticket.data.diagnostic_answers
        : [];
      if (
        answers.some(
          (answer) =>
            answer &&
            typeof answer === "object" &&
            "questionId" in answer &&
            answer.questionId === questionId
        )
      ) {
        return { ok: false, output: {}, error: "question_already_asked" };
      }
      if (ctx.signal.aborted)
        return { ok: false, output: {}, error: "aborted" };
      await resolutionEvent(ctx, "question.asked", { questionId });
      return scalar({ queued: true });
    },
  },
  {
    capabilityId: "collect_platform_context",
    version: 1,
    async run(ctx) {
      const ticket = await ctx.admin
        .from("tickets")
        .select("platform")
        .eq("id", ctx.ticketId)
        .eq("organization_id", ctx.organizationId)
        .maybeSingle();
      if (ticket.error || !ticket.data)
        return { ok: false, output: {}, error: "ticket_not_found" };
      return scalar({ platform: ticket.data.platform ?? null });
    },
  },
  {
    capabilityId: "check_helpdesk_service_status",
    version: 1,
    async run(ctx) {
      const result = await ctx.admin
        .from("notification_outbox")
        .select("status")
        .eq("organization_id", ctx.organizationId)
        .gte(
          "created_at",
          new Date(Date.now() - 24 * 60 * 60_000).toISOString()
        );
      if (result.error)
        return { ok: false, output: {}, error: result.error.message };
      const rows = (result.data ?? []) as { status: string }[];
      return scalar({
        pending: rows.filter((row) => row.status === "pending").length,
        failed: rows.filter((row) => row.status === "failed").length,
        dead: rows.filter((row) => row.status === "dead").length,
      });
    },
  },
  {
    capabilityId: "resend_ticket_notification",
    version: 1,
    async run(ctx, params) {
      const row = await ctx.admin
        .from("notification_outbox")
        .select(
          "id,event_type,channel,recipient_user_id,subject,body,url,dedupe_key"
        )
        .eq("id", params.notificationId)
        .eq("ticket_id", ctx.ticketId)
        .eq("organization_id", ctx.organizationId)
        .maybeSingle();
      if (row.error || !row.data)
        return { ok: false, output: {}, error: "notification_not_found" };
      if (ctx.signal.aborted)
        return { ok: false, output: {}, error: "aborted" };
      const inserted = await ctx.admin
        .from("notification_outbox")
        .insert({
          organization_id: ctx.organizationId,
          ticket_id: ctx.ticketId,
          event_type: row.data.event_type,
          channel: row.data.channel,
          recipient_user_id: row.data.recipient_user_id,
          subject: row.data.subject,
          body: row.data.body,
          url: row.data.url,
          dedupe_key: `${row.data.dedupe_key}:resend:${ctx.runId}`,
          status: "pending",
          attempts: 0,
          next_attempt_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (inserted.error || !inserted.data)
        return {
          ok: false,
          output: {},
          error: inserted.error?.message ?? "insert_failed",
        };
      return scalar({ newNotificationId: inserted.data.id });
    },
  },
  {
    capabilityId: "retry_failed_notification",
    version: 1,
    async run(ctx, params) {
      if (ctx.signal.aborted)
        return { ok: false, output: {}, error: "aborted" };
      const updated = await ctx.admin
        .from("notification_outbox")
        .update({
          status: "pending",
          attempts: 0,
          next_attempt_at: new Date().toISOString(),
          last_error: null,
        })
        .eq("id", params.notificationId)
        .eq("ticket_id", ctx.ticketId)
        .eq("organization_id", ctx.organizationId)
        .in("status", ["failed", "dead"])
        .select("id,status")
        .maybeSingle();
      if (updated.error || !updated.data)
        return { ok: false, output: {}, error: "notification_not_retryable" };
      return scalar({ notificationId: updated.data.id, status: "pending" });
    },
  },
  {
    capabilityId: "validate_attachment_scan_status",
    version: 1,
    async run(ctx, params) {
      const result = await ctx.admin
        .from("ticket_attachments")
        .select("id,scan_verdict,status")
        .eq("id", params.attachmentId)
        .eq("ticket_id", ctx.ticketId)
        .eq("organization_id", ctx.organizationId);
      if (result.error)
        return { ok: false, output: {}, error: result.error.message };
      const rows = (result.data ?? []) as {
        scan_verdict: string | null;
        status: string;
      }[];
      return scalar({
        total: rows.length,
        clean: rows.filter((row) => row.scan_verdict === "clean").length,
        pending: rows.filter(
          (row) => row.status === "scanning" || row.scan_verdict === "unscanned"
        ).length,
        infected: rows.filter((row) => row.scan_verdict === "infected").length,
      });
    },
  },
  {
    capabilityId: "generate_diagnosis_package",
    version: 1,
    async run(ctx) {
      const stopped = aborted(ctx);
      if (stopped) return stopped;
      const packageSnapshot = await snapshotEscalationPackage(
        ctx.admin,
        ctx.ticketId,
        ctx.organizationId
      );
      return packageSnapshot
        ? scalar({ generated: true })
        : { ok: false, output: {}, error: "diagnosis_package_failed" };
    },
  },
  {
    capabilityId: "request_user_verification",
    version: 1,
    async run(ctx) {
      if (ctx.signal.aborted)
        return { ok: false, output: {}, error: "aborted" };
      const updated = await ctx.admin
        .from("tickets")
        .update({ status: "Pending Verification" })
        .eq("id", ctx.ticketId)
        .eq("organization_id", ctx.organizationId)
        .select("id")
        .maybeSingle();
      if (updated.error)
        return { ok: false, output: {}, error: updated.error.message };
      await resolutionEvent(ctx, "verification.requested", {});
      return scalar({ requested: true });
    },
  },
  {
    capabilityId: "route_to_department",
    version: 1,
    async run(ctx, params) {
      if (ctx.signal.aborted)
        return { ok: false, output: {}, error: "aborted" };
      await resolutionEvent(ctx, "ticket.department_routed", {
        department: params.department,
      });
      await resolutionEvent(ctx, "resolution.event", {
        action: "route_to_department",
        department: params.department,
      });
      return scalar({ routed: true });
    },
  },
  {
    capabilityId: "escalate_with_evidence",
    version: 1,
    async run(ctx, params) {
      if (ctx.signal.aborted)
        return { ok: false, output: {}, error: "aborted" };
      await ctx.escalate(String(params.reason));
      return scalar({ escalated: true });
    },
  },
  {
    capabilityId: "check_account_status",
    version: 1,
    async run(ctx) {
      const binding = await getIdentityBinding(ctx.admin, ctx.runId);
      if (
        !binding ||
        binding.organizationId !== ctx.organizationId ||
        binding.ticketId !== ctx.ticketId
      )
        return { ok: false, output: {}, error: "identity_unbound" };
      const loaded = await loadDirectoryForOrganization(
        ctx.admin,
        ctx.organizationId
      );
      if (!loaded)
        return { ok: false, output: {}, error: "connector_unavailable" };
      const email = await requesterEmail(ctx, binding.userId);
      if (!email) return { ok: false, output: {}, error: "identity_unbound" };
      const result = await loaded.directory.lookupUserByEmail(
        email,
        ctx.signal
      );
      if (!result.ok)
        return { ok: false, output: {}, error: result.error.kind };
      await resolutionEvent(ctx, "identity.status_checked", {
        provider: binding.provider,
        enabled: result.value.enabled,
        suspended: result.value.suspended,
        lastSignInAt: result.value.lastSignInAt,
      });
      return scalar({
        directoryUserId: result.value.directoryUserId,
        enabled: result.value.enabled,
        suspended: result.value.suspended,
        passwordExpired: result.value.passwordExpired,
        lastSignInAt: result.value.lastSignInAt,
        mfaRegistered: result.value.mfaRegistered,
      });
    },
  },
  {
    capabilityId: "send_password_reset_link",
    version: 1,
    async run(ctx) {
      const binding = await getIdentityBinding(ctx.admin, ctx.runId);
      if (
        !binding ||
        binding.organizationId !== ctx.organizationId ||
        binding.ticketId !== ctx.ticketId
      )
        return { ok: false, output: {}, error: "identity_unbound" };
      const loaded = await loadDirectoryForOrganization(
        ctx.admin,
        ctx.organizationId
      );
      if (!loaded)
        return { ok: false, output: {}, error: "connector_unavailable" };
      const url =
        loaded.config.resetUrl ??
        (binding.provider === "entra"
          ? "https://passwordreset.microsoftonline.com/"
          : "https://accounts.google.com/signin/recovery");
      const ticket = await ctx.admin
        .from("tickets")
        .select("issue_title,user_id")
        .eq("id", ctx.ticketId)
        .eq("organization_id", ctx.organizationId)
        .maybeSingle();
      if (ticket.error || !ticket.data)
        return { ok: false, output: {}, error: "ticket_not_found" };
      const inserted = await ctx.admin.from("notification_outbox").insert({
        organization_id: ctx.organizationId,
        ticket_id: ctx.ticketId,
        event_type: "ticket.status_changed",
        channel: "email",
        recipient_user_id: ticket.data.user_id,
        dedupe_key: `identity-recovery:${ctx.runId}`,
        subject: "Self-service account recovery",
        body: `Use this self-service account recovery link: ${url}`,
        url,
      });
      if (inserted.error)
        return { ok: false, output: {}, error: "notification_enqueue_failed" };
      await resolutionEvent(ctx, "identity.recovery_link_sent", {
        provider: binding.provider,
        url,
      });
      return scalar({ queued: true, resetUrl: url });
    },
  },
  {
    capabilityId: "revoke_user_sessions",
    version: 1,
    async run(ctx) {
      const binding = await getIdentityBinding(ctx.admin, ctx.runId);
      if (
        !binding ||
        binding.organizationId !== ctx.organizationId ||
        binding.ticketId !== ctx.ticketId
      )
        return { ok: false, output: {}, error: "identity_unbound" };
      const loaded = await loadDirectoryForOrganization(
        ctx.admin,
        ctx.organizationId
      );
      if (!loaded)
        return { ok: false, output: {}, error: "connector_unavailable" };
      const result = await loaded.directory.revokeSessions(
        binding.directoryUserId,
        ctx.signal
      );
      if (!result.ok)
        return { ok: false, output: {}, error: result.error.kind };
      await resolutionEvent(ctx, "identity.sessions_revoked", {
        provider: binding.provider,
        revokedAt: result.value.revokedAt,
      });
      return scalar({ revokedAt: result.value.revokedAt });
    },
  },
  {
    capabilityId: "verify_group_access",
    version: 1,
    async run(ctx, params) {
      const binding = await getIdentityBinding(ctx.admin, ctx.runId);
      if (
        !binding ||
        binding.organizationId !== ctx.organizationId ||
        binding.ticketId !== ctx.ticketId
      )
        return { ok: false, output: {}, error: "identity_unbound" };
      const loaded = await loadDirectoryForOrganization(
        ctx.admin,
        ctx.organizationId
      );
      if (
        !loaded ||
        !loaded.config.allowedGroupIds.includes(String(params.groupId))
      )
        return { ok: false, output: {}, error: "group_not_allowlisted" };
      const result = await loaded.directory.isMemberOfGroup(
        binding.directoryUserId,
        String(params.groupId),
        ctx.signal
      );
      if (!result.ok)
        return { ok: false, output: {}, error: result.error.kind };
      await resolutionEvent(ctx, "identity.group_verified", {
        provider: binding.provider,
        groupId: params.groupId,
        isMemberOfGroup: result.value,
      });
      return scalar({
        groupId: String(params.groupId),
        isMemberOfGroup: result.value,
      });
    },
  },
  {
    capabilityId: "grant_group_access",
    version: 1,
    async run(ctx, params) {
      const binding = await getIdentityBinding(ctx.admin, ctx.runId);
      if (
        !binding ||
        binding.organizationId !== ctx.organizationId ||
        binding.ticketId !== ctx.ticketId
      )
        return { ok: false, output: {}, error: "identity_unbound" };
      const loaded = await loadDirectoryForOrganization(
        ctx.admin,
        ctx.organizationId
      );
      if (
        !loaded ||
        !loaded.config.allowedGroupIds.includes(String(params.groupId))
      )
        return { ok: false, output: {}, error: "group_not_allowlisted" };
      const result = await loaded.directory.addToGroup(
        binding.directoryUserId,
        String(params.groupId),
        ctx.signal
      );
      if (!result.ok)
        return { ok: false, output: {}, error: result.error.kind };
      await resolutionEvent(ctx, "identity.group_granted", {
        provider: binding.provider,
        groupId: params.groupId,
        addedAt: result.value.addedAt,
      });
      return scalar({
        groupId: String(params.groupId),
        addedAt: result.value.addedAt,
        isMemberOfGroup: true,
      });
    },
  },
  {
    capabilityId: "check_sso_health",
    version: 1,
    async run(ctx) {
      const loaded = await loadDirectoryForOrganization(
        ctx.admin,
        ctx.organizationId
      );
      if (!loaded)
        return { ok: false, output: {}, error: "connector_unavailable" };
      const result = await loaded.directory.health(ctx.signal);
      if (!result.ok)
        return { ok: false, output: {}, error: result.error.kind };
      await resolutionEvent(ctx, "identity.sso_health_checked", {
        provider: loaded.config.provider,
        tokenAcquired: result.value.tokenAcquired,
        latencyMs: result.value.latencyMs,
      });
      return scalar(result.value);
    },
  },
];

export function getHandler(
  capabilityId: string,
  version: number
): CapabilityHandler | null {
  return (
    handlers.find(
      (handler) =>
        handler.capabilityId === capabilityId && handler.version === version
    ) ?? null
  );
}
