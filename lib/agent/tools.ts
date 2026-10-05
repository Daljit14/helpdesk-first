import { z } from "zod";
import { getApprovedSlugs } from "@/lib/knowledge/governance";
import { suggestIssues } from "@/lib/search";
import { loadDeviceEvidence } from "@/lib/evidence/device-family";
import { decryptTicketRow } from "@/lib/security/ticket-crypto";
import { readKillSwitches } from "@/lib/autonomy/kill-switches";
import { loadDirectoryForOrganization } from "@/lib/autonomy/connectors";
import { checkRequesterEmailForOrg } from "@/lib/autonomy/connectors/binding";
import { createClient } from "@/lib/supabase/server";
import type { AgentContext } from "./types";
import { wrapUntrusted, sanitizeForUser } from "./untrusted";
import { parameterHash } from "@/lib/autonomy/guardrails/hash";
import {
  isAgentDiagnosticSourcesEnabled,
  isRequesterAgentActionsEnabled,
  isOrgEnvironmentEnabled,
  isServiceHealthEnabled,
} from "@/lib/admin/flags";
import { getServiceHealth, matchIncidents } from "@/lib/service-health";
import { loadConfirmedOrgEnvironment } from "@/lib/org-environment/profile";
import type { AccountStatus } from "@/lib/autonomy/connectors/types";

const querySchema = z
  .object({
    query: z.string().trim().min(1).max(200),
    platform: z.string().trim().max(40).optional(),
  })
  .strict();
const emptySchema = z.object({}).strict();
const similarIssuesSchema = z
  .object({ issueSlug: z.string().regex(/^[a-z0-9-]{1,80}$/) })
  .strict();
export const serviceHealthSchema = z
  .object({ symptom: z.string().trim().min(1).max(200) })
  .strict();
const historySchema = z
  .object({ limit: z.number().int().min(1).max(10).default(10) })
  .strict();
const paramsSchema = z
  .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
  .refine((value) => Object.keys(value).length <= 10);
export const proposeActionSchema = z
  .object({
    capability_id: z.string().trim().min(1).max(80),
    params: paramsSchema,
    hypothesis_id: z.string().regex(/^ev-\d+$/),
    rationale: z.string().trim().min(1).max(300),
  })
  .strict();

export const AGENT_TOOLS = [
  {
    name: "search_guides",
    description: "Search approved support guides.",
    input_schema: z.toJSONSchema(querySchema, { io: "input" }),
  },
  {
    name: "get_device_diagnostics",
    description: "Read the requester's stored device diagnostics.",
    input_schema: z.toJSONSchema(emptySchema, { io: "input" }),
  },
  {
    name: "get_account_status",
    description: "Read the requester's own directory account status.",
    input_schema: z.toJSONSchema(emptySchema, { io: "input" }),
  },
  {
    name: "get_ticket_history",
    description: "Read the requester's own recent tickets.",
    input_schema: z.toJSONSchema(historySchema, { io: "input" }),
  },
] as const;

const PROPOSE_ACTION_TOOL = {
  name: "propose_action" as const,
  description: "Propose one consent-gated state-changing action.",
  input_schema: z.toJSONSchema(proposeActionSchema, { io: "input" }),
};
const SERVICE_HEALTH_TOOL = {
  name: "get_service_health" as const,
  description:
    "Check vendor service status for active incidents matching the symptom.",
  input_schema: z.toJSONSchema(serviceHealthSchema, { io: "input" }),
};
const ORG_ENVIRONMENT_TOOL = {
  name: "get_org_environment" as const,
  description:
    "Read the organization's confirmed IT environment profile (VPN, MDM, email/chat, SSO, standard OS, printers, approved software).",
  input_schema: z.toJSONSchema(emptySchema, { io: "input" }),
};
const RECENT_SIGN_IN_FAILURES_TOOL = {
  name: "get_recent_sign_in_failures" as const,
  description:
    "Read recent sign-in failure reasons for the requester's own directory account.",
  input_schema: z.toJSONSchema(emptySchema, { io: "input" }),
};
const SIMILAR_ORG_ISSUES_TOOL = {
  name: "count_similar_org_issues" as const,
  description:
    "Count recent reports of an approved issue by other requesters in the organization.",
  input_schema: z.toJSONSchema(similarIssuesSchema, { io: "input" }),
};

export function getAgentTools(
  actionsEnabled = isRequesterAgentActionsEnabled(),
  serviceHealthEnabled = isServiceHealthEnabled(),
  orgEnvironmentEnabled = isOrgEnvironmentEnabled(),
  diagnosticSourcesEnabled = isAgentDiagnosticSourcesEnabled()
) {
  return [
    ...AGENT_TOOLS,
    ...(actionsEnabled ? [PROPOSE_ACTION_TOOL] : []),
    ...(serviceHealthEnabled ? [SERVICE_HEALTH_TOOL] : []),
    ...(orgEnvironmentEnabled ? [ORG_ENVIRONMENT_TOOL] : []),
    ...(diagnosticSourcesEnabled
      ? [RECENT_SIGN_IN_FAILURES_TOOL, SIMILAR_ORG_ISSUES_TOOL]
      : []),
  ];
}

export type AgentToolName =
  | (typeof AGENT_TOOLS)[number]["name"]
  | "propose_action"
  | "get_service_health"
  | "get_org_environment"
  | "get_recent_sign_in_failures"
  | "count_similar_org_issues";

export type AgentToolResult =
  | {
      ok: true;
      value: unknown;
      modelText: string;
      userSummary: string;
    }
  | {
      ok: false;
      code: string;
      modelText: string;
      userSummary: string;
    };

function hasTargetKey(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  for (const [key, child] of Object.entries(value)) {
    if (
      [
        "user_id",
        "userId",
        "device_id",
        "deviceId",
        "org_id",
        "organizationId",
        "directoryUserId",
        "email",
      ].includes(key)
    )
      return true;
    if (hasTargetKey(child)) return true;
  }
  return false;
}

type RequesterDirectoryLookup =
  | { status: "identity_denied" }
  | { status: "no_connector" }
  | {
      status: "loaded";
      provider: "entra" | "google";
      account: AccountStatus;
    };

async function loadRequesterDirectoryLookup(
  ctx: AgentContext
): Promise<RequesterDirectoryLookup> {
  const requester = await checkRequesterEmailForOrg(
    ctx.admin,
    ctx.organizationId,
    ctx.requesterId
  );
  if (!requester.ok) return { status: "identity_denied" };
  const loaded = await loadDirectoryForOrganization(
    ctx.admin,
    ctx.organizationId
  );
  if (!loaded) return { status: "no_connector" };
  const result = await loaded.directory.lookupUserByEmail(
    requester.email,
    ctx.signal
  );
  if (!result.ok) return { status: "identity_denied" };
  return {
    status: "loaded",
    provider: loaded.directory.provider,
    account: result.value,
  };
}

const SIGN_IN_FAILURE_REASONS = [
  "wrong_password",
  "account_locked",
  "account_disabled",
  "password_expired",
  "mfa_required",
  "mfa_failed",
  "conditional_access",
  "other",
] as const;
type SignInFailureReason = (typeof SIGN_IN_FAILURE_REASONS)[number];

function mapSignInFailureReason(code: string): SignInFailureReason {
  if (code === "50126") return "wrong_password";
  if (code === "50053") return "account_locked";
  if (code === "50057") return "account_disabled";
  if (code === "50055") return "password_expired";
  if (["50074", "50076", "50079"].includes(code)) return "mfa_required";
  if (code === "500121") return "mfa_failed";
  if (["53000", "53001", "53002", "53003"].includes(code))
    return "conditional_access";
  return "other";
}

const SIGN_IN_FAILURE_LABELS: Record<SignInFailureReason, string> = {
  wrong_password: "Wrong password",
  account_locked: "Account locked",
  account_disabled: "Account disabled",
  password_expired: "Password expired",
  mfa_required: "MFA required",
  mfa_failed: "MFA failed",
  conditional_access: "Conditional access",
  other: "Other",
};

export async function runTool(
  ctx: AgentContext,
  name: string,
  input: unknown
): Promise<AgentToolResult> {
  const serviceHealthEnabled = isServiceHealthEnabled();
  const orgEnvironmentEnabled = isOrgEnvironmentEnabled();
  const definition = getAgentTools(
    false,
    serviceHealthEnabled,
    orgEnvironmentEnabled
  ).find((tool) => tool.name === name);
  if (!definition || hasTargetKey(input)) {
    const userSummary = "That read-only tool request was rejected.";
    return {
      ok: false,
      code: "tool_rejected",
      modelText: userSummary,
      userSummary,
    };
  }
  const parsed =
    name === "search_guides"
      ? querySchema.safeParse(input)
      : name === "get_service_health"
        ? serviceHealthSchema.safeParse(input)
        : name === "get_ticket_history"
          ? historySchema.safeParse(input)
          : name === "count_similar_org_issues"
            ? similarIssuesSchema.safeParse(input)
            : emptySchema.safeParse(input);
  if (!parsed.success) {
    const userSummary = "The tool parameters were invalid.";
    return {
      ok: false,
      code: "tool_rejected",
      modelText: userSummary,
      userSummary,
    };
  }
  const switches = await readKillSwitches(ctx.admin, ctx.organizationId);
  if (switches.global || switches.organization || switches.explicit) {
    const userSummary = "Read-only tools are paused for safety.";
    return {
      ok: false,
      code: "kill_switch",
      modelText: userSummary,
      userSummary,
    };
  }
  try {
    let value: unknown;
    if (name === "search_guides") {
      const args = parsed.data as z.infer<typeof querySchema>;
      const approved = new Set(await getApprovedSlugs(ctx.organizationId));
      value = suggestIssues(args.query, args.platform as never, 5)
        .filter((issue) => approved.has(issue.id))
        .map((issue) => ({
          slug: issue.id,
          title: issue.title,
          category: issue.category,
          platforms: issue.devices,
          summary: issue.symptoms.slice(0, 2).join("; "),
        }));
    } else if (name === "get_device_diagnostics") {
      const evidence = await loadDeviceEvidence(ctx.admin, {
        organizationId: ctx.organizationId,
        requesterUserId: ctx.requesterId,
      });
      if (evidence && typeof evidence === "object") {
        const collectedAt =
          "collectedAt" in evidence && typeof evidence.collectedAt === "string"
            ? Date.parse(evidence.collectedAt)
            : NaN;
        value =
          Number.isFinite(collectedAt) &&
          Date.now() - collectedAt > 2 * 300 * 1000
            ? { ...evidence, stale: true }
            : evidence;
      } else {
        value = {
          status: "no_device",
          summary: "No enrolled device is linked to this account.",
        };
      }
    } else if (name === "get_account_status") {
      const lookup = await loadRequesterDirectoryLookup(ctx);
      if (lookup.status === "identity_denied") {
        const userSummary = "Account status is unavailable for this identity.";
        return {
          ok: false,
          code: "identity_denied",
          modelText: userSummary,
          userSummary,
        };
      }
      if (lookup.status === "no_connector") {
        const userSummary = "No directory connector is configured.";
        return {
          ok: true,
          value: { available: false, reason: "no_connector" },
          modelText: wrapUntrusted("tool:get_account_status", {
            available: false,
            reason: "no_connector",
          }).slice(0, 6000),
          userSummary,
        };
      }
      const result = lookup.account;
      value = {
        enabled: result.enabled,
        suspended: result.suspended,
        passwordExpired: result.passwordExpired,
        lastSignInAt: result.lastSignInAt,
        mfaRegistered: result.mfaRegistered,
        recentSignInErrorCount: result.recentSignInErrors.length,
      };
    } else if (name === "get_recent_sign_in_failures") {
      const lookup = await loadRequesterDirectoryLookup(ctx);
      if (lookup.status === "identity_denied") {
        const userSummary =
          "Sign-in failures are unavailable for this identity.";
        return {
          ok: false,
          code: "identity_denied",
          modelText: userSummary,
          userSummary,
        };
      }
      if (lookup.status === "no_connector") {
        const userSummary = "No directory connector is configured.";
        return {
          ok: true,
          value: { available: false, reason: "no_connector" },
          modelText: wrapUntrusted("tool:get_recent_sign_in_failures", {
            available: false,
            reason: "no_connector",
          }).slice(0, 6000),
          userSummary,
        };
      }
      if (lookup.provider !== "entra") {
        value = { available: false, reason: "unsupported_provider" };
      } else {
        const now = Date.now();
        const start = now - 24 * 60 * 60 * 1000;
        const recent = lookup.account.recentSignInErrors
          .filter((failure) => {
            const at = Date.parse(failure.at);
            return (
              failure.code !== "0" &&
              Number.isFinite(at) &&
              at >= start &&
              at <= now
            );
          })
          .sort((left, right) => Date.parse(right.at) - Date.parse(left.at));
        const counts = Object.fromEntries(
          SIGN_IN_FAILURE_REASONS.map((reason) => [reason, 0])
        ) as Record<SignInFailureReason, number>;
        for (const failure of recent)
          counts[mapSignInFailureReason(failure.code)] += 1;
        value = {
          available: true,
          provider: "entra",
          windowHours: 24,
          failures: recent.slice(0, 5).map((failure) => ({
            at: failure.at,
            reason: mapSignInFailureReason(failure.code),
          })),
          counts,
        };
      }
    } else if (name === "count_similar_org_issues") {
      const args = parsed.data as z.infer<typeof similarIssuesSchema>;
      const approved = new Set(await getApprovedSlugs(ctx.organizationId));
      if (!approved.has(args.issueSlug)) {
        const userSummary = "That issue is not an approved support guide.";
        return {
          ok: false,
          code: "tool_rejected",
          modelText: userSummary,
          userSummary,
        };
      }
      const now = Date.now();
      const countSince = async (milliseconds: number) => {
        const result = await ctx.admin
          .from("tickets")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", ctx.organizationId)
          .neq("user_id", ctx.requesterId)
          .or(
            `issue_id.eq.${args.issueSlug},ai_recommended_issue_id.eq.${args.issueSlug}`
          )
          .gte("created_at", new Date(now - milliseconds).toISOString());
        if (result.error) throw result.error;
        return typeof result.count === "number" ? result.count : 0;
      };
      const [hourCount, dayCount] = await Promise.all([
        countSince(60 * 60 * 1000),
        countSince(24 * 60 * 60 * 1000),
      ]);
      value = {
        issueSlug: args.issueSlug,
        threshold: 3,
        lastHour: hourCount >= 3 ? hourCount : null,
        last24h: dayCount >= 3 ? dayCount : null,
      };
    } else if (name === "get_service_health") {
      const args = parsed.data as z.infer<typeof serviceHealthSchema>;
      const snapshot = await getServiceHealth(
        ctx.admin,
        ctx.organizationId,
        ctx.signal
      );
      const matched = matchIncidents(args.symptom, snapshot.incidents);
      value = {
        checked: true,
        matched,
        otherActive: Math.max(0, snapshot.incidents.length - matched.length),
        sources: snapshot.sources.map(({ source, ok }) => ({ source, ok })),
        checkedAt: snapshot.checkedAt,
      };
    } else if (name === "get_org_environment") {
      const profile = await loadConfirmedOrgEnvironment(
        ctx.admin,
        ctx.organizationId
      );
      value = profile
        ? {
            available: true,
            vpnClient: profile.vpnClient,
            mdmProvider: profile.mdmProvider,
            emailStack: profile.emailStack,
            chatStack: profile.chatStack,
            ssoProvider: profile.ssoProvider,
            standardPlatforms: profile.standardPlatforms,
            standardOsVersions: profile.standardOsVersions,
            printerFleet: profile.printerFleet,
            approvedSoftware: profile.approvedSoftware,
          }
        : { available: false, reason: "not_confirmed" };
    } else {
      const args = parsed.data as z.infer<typeof historySchema>;
      const client = await createClient();
      const result = await client
        .from("tickets")
        .select("id,organization_id,issue_title,status,created_at,message")
        .eq("user_id", ctx.requesterId)
        .eq("organization_id", ctx.organizationId)
        .order("created_at", { ascending: false })
        .limit(args.limit);
      if (result.error) throw result.error;
      value = await Promise.all(
        (
          (result.data ?? []) as Array<{
            id: string;
            organization_id: string;
            issue_title: string;
            status: string;
            created_at: string;
            message: string | null;
          }>
        ).map(async (ticket) => {
          const decrypted = await decryptTicketRow(ctx.admin, ticket);
          return {
            id: decrypted.id,
            status: decrypted.status,
            issueTitle: decrypted.issue_title,
            createdAt: decrypted.created_at,
            message: (decrypted.message ?? "").slice(0, 300),
          };
        })
      );
    }
    const wrapped = wrapUntrusted(`tool:${name}`, value);
    const modelText = wrapped.slice(0, 6000);
    const userSummary = toolUserSummary(name, value);
    return {
      ok: true,
      value,
      modelText,
      userSummary,
    };
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "injection_in_tool_output"
    ) {
      const userSummary = "A tool result was blocked for safety.";
      return {
        ok: false,
        code: "injection_in_tool_output",
        modelText: userSummary,
        userSummary,
      };
    }
    const userSummary = "The read-only tool was unavailable.";
    return {
      ok: false,
      code: "tool_failed",
      modelText: userSummary,
      userSummary,
    };
  }
}

function toolUserSummary(name: string, value: unknown): string {
  if (name === "get_recent_sign_in_failures") {
    const result =
      value && typeof value === "object"
        ? (value as {
            available?: unknown;
            counts?: Partial<Record<SignInFailureReason, number>>;
          })
        : {};
    if (result.available !== true)
      return sanitizeForUser(
        "Sign-in failure diagnostics are unavailable for this provider."
      );
    const counts = result.counts ?? {};
    const total = SIGN_IN_FAILURE_REASONS.reduce(
      (sum, reason) => sum + (counts[reason] ?? 0),
      0
    );
    if (total === 0) return sanitizeForUser("No recent sign-in failures.");
    const topReason = [...SIGN_IN_FAILURE_REASONS]
      .filter((reason) => (counts[reason] ?? 0) > 0)
      .sort((left, right) => (counts[right] ?? 0) - (counts[left] ?? 0))[0];
    return sanitizeForUser(
      `${total} recent sign-in failure${total === 1 ? "" : "s"}: ${
        SIGN_IN_FAILURE_LABELS[topReason ?? "other"]
      }.`
    ).slice(0, 300);
  }
  if (name === "count_similar_org_issues") {
    const result =
      value && typeof value === "object"
        ? (value as { lastHour?: unknown; last24h?: unknown })
        : {};
    if (typeof result.lastHour === "number")
      return sanitizeForUser(
        `${result.lastHour} others in your organization reported this in the last hour.`
      ).slice(0, 300);
    if (typeof result.last24h === "number")
      return sanitizeForUser(
        `${result.last24h} others reported this today.`
      ).slice(0, 300);
    return sanitizeForUser("No widespread reports of this issue.");
  }
  if (name === "get_org_environment") {
    return value &&
      typeof value === "object" &&
      "available" in value &&
      value.available === true
      ? "Organization environment profile loaded."
      : "No confirmed organization environment profile.";
  }
  if (name === "get_service_health") {
    const matched =
      value &&
      typeof value === "object" &&
      "matched" in value &&
      Array.isArray(value.matched)
        ? value.matched
        : [];
    if (matched.length === 0)
      return sanitizeForUser("No matching service incidents found.");
    const first = matched[0] as {
      service?: unknown;
      source?: unknown;
    };
    const sourceName =
      first.source === "microsoft365"
        ? "Microsoft 365"
        : first.source === "google_workspace"
          ? "Google Workspace"
          : "Statuspage";
    return sanitizeForUser(
      `${matched.length} active incident${matched.length === 1 ? "" : "s"} may explain this: ${String(first.service ?? "Service")} (${sourceName}).`
    ).slice(0, 300);
  }
  if (name === "search_guides" && Array.isArray(value)) {
    const slugs = value
      .map((item) =>
        item && typeof item === "object" && "slug" in item
          ? String(item.slug)
          : null
      )
      .filter(Boolean)
      .slice(0, 5);
    return sanitizeForUser(
      `${value.length} guides found${slugs.length ? `: ${slugs.join(", ")}` : ""}`
    ).slice(0, 300);
  }
  if (name === "get_device_diagnostics") {
    const record =
      value && typeof value === "object"
        ? (value as Record<string, unknown>)
        : {};
    if (record.status === "no_device")
      return "No enrolled device is linked to this account.";
    const collectedAt =
      typeof record.collectedAt === "string"
        ? Date.parse(record.collectedAt)
        : NaN;
    const ageMinutes = Number.isFinite(collectedAt)
      ? Math.max(0, Math.round((Date.now() - collectedAt) / 60_000))
      : null;
    return `Diagnostics from a device collected ${
      ageMinutes === null ? "recently" : `${ageMinutes} min ago`
    }${record.stale === true ? " (stale)" : ""}.`.slice(0, 300);
  }
  if (name === "get_account_status") {
    const record =
      value && typeof value === "object"
        ? (value as Record<string, unknown>)
        : {};
    const account = record.enabled === true ? "enabled" : "not enabled";
    const mfa =
      record.mfaRegistered === true
        ? "MFA registered"
        : record.mfaRegistered === false
          ? "MFA not registered"
          : "MFA status unavailable";
    return `Account: ${account}, ${mfa}.`.slice(0, 300);
  }
  if (name === "get_ticket_history" && Array.isArray(value))
    return `${value.length} recent tickets.`.slice(0, 300);
  return sanitizeForUser(
    JSON.stringify(value) || "Read-only result unavailable."
  ).slice(0, 300);
}

export function toolParamsHash(name: string, input: unknown): string {
  return parameterHash({
    capabilityId: name,
    version: 1,
    parameters:
      input && typeof input === "object"
        ? (input as Record<string, unknown>)
        : {},
  });
}
