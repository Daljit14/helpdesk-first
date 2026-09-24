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

export type AgentToolName = (typeof AGENT_TOOLS)[number]["name"];

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
): Promise<
  | { ok: true; value: unknown; summary: string }
  | { ok: false; code: string; summary: string }
> {
  const definition = AGENT_TOOLS.find((tool) => tool.name === name);
  if (!definition || hasTargetKey(input)) {
    return {
      ok: false,
      code: "tool_rejected",
      summary: "That read-only tool request was rejected.",
    };
  }
  const parsed =
    name === "search_guides"
      ? querySchema.safeParse(input)
      : name === "get_ticket_history"
        ? historySchema.safeParse(input)
        : emptySchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      code: "tool_rejected",
      summary: "The tool parameters were invalid.",
    };
  }
  const switches = await readKillSwitches(ctx.admin, ctx.organizationId);
  if (switches.global || switches.organization || switches.explicit) {
    return {
      ok: false,
      code: "kill_switch",
      summary: "Read-only tools are paused for safety.",
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
        value = evidence;
      }
    } else if (name === "get_account_status") {
      const requester = await checkRequesterEmailForOrg(
        ctx.admin,
        ctx.organizationId,
        ctx.requesterId
      );
      if (!requester.ok) {
        return {
          ok: false,
          code: "identity_denied",
          summary: "Account status is unavailable for this identity.",
        };
      }
      const loaded = await loadDirectoryForOrganization(
        ctx.admin,
        ctx.organizationId
      );
      if (!loaded)
        return {
          ok: true,
          value: { available: false, reason: "no_connector" },
          summary: "No directory connector is configured.",
        };
      const result = await loaded.directory.lookupUserByEmail(
        requester.email,
        ctx.signal
      );
      if (!result.ok)
        return {
          ok: false,
          code: "identity_denied",
          summary: "The directory did not authorize this lookup.",
        };
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
    return {
      ok: true,
      value,
      summary: sanitizeForUser(wrapped).slice(0, 500),
    };
  } catch (error) {
    if (error instanceof Error && error.message === "injection_in_tool_output")
      return {
        ok: false,
        code: "injection_in_tool_output",
        summary: "A tool result was blocked for safety.",
      };
    return {
      ok: false,
      code: "tool_failed",
      summary: "The read-only tool was unavailable.",
    };
  }
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
