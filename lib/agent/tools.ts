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
import { isRequesterAgentActionsEnabled } from "@/lib/admin/flags";

const querySchema = z
  .object({
    query: z.string().trim().min(1).max(200),
    platform: z.string().trim().max(40).optional(),
  })
  .strict();
const emptySchema = z.object({}).strict();
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

export function getAgentTools(
  actionsEnabled = isRequesterAgentActionsEnabled()
) {
  return actionsEnabled
    ? [
        ...AGENT_TOOLS,
        {
          name: "propose_action" as const,
          description: "Propose one consent-gated state-changing action.",
          input_schema: z.toJSONSchema(proposeActionSchema, { io: "input" }),
        },
      ]
    : AGENT_TOOLS;
}

export type AgentToolName =
  (typeof AGENT_TOOLS)[number]["name"] | "propose_action";

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

export async function runTool(
  ctx: AgentContext,
  name: string,
  input: unknown
): Promise<AgentToolResult> {
  const definition = AGENT_TOOLS.find((tool) => tool.name === name);
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
      : name === "get_ticket_history"
        ? historySchema.safeParse(input)
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
      const requester = await checkRequesterEmailForOrg(
        ctx.admin,
        ctx.organizationId,
        ctx.requesterId
      );
      if (!requester.ok) {
        const userSummary = "Account status is unavailable for this identity.";
        return {
          ok: false,
          code: "identity_denied",
          modelText: userSummary,
          userSummary,
        };
      }
      const loaded = await loadDirectoryForOrganization(
        ctx.admin,
        ctx.organizationId
      );
      if (!loaded) {
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
      const result = await loaded.directory.lookupUserByEmail(
        requester.email,
        ctx.signal
      );
      if (!result.ok) {
        const userSummary = "The directory did not authorize this lookup.";
        return {
          ok: false,
          code: "identity_denied",
          modelText: userSummary,
          userSummary,
        };
      }
      value = {
        enabled: result.value.enabled,
        suspended: result.value.suspended,
        passwordExpired: result.value.passwordExpired,
        lastSignInAt: result.value.lastSignInAt,
        mfaRegistered: result.value.mfaRegistered,
        recentSignInErrorCount: result.value.recentSignInErrors.length,
      };
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
