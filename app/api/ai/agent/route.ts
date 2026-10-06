import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/supabase/user";
import { resolveOrganizationForUser } from "@/lib/org/membership";
import {
  isRequesterAgentEnabled,
  isRequesterAgentActionsEnabled,
  isRequesterAgentEnabledForOrg,
  isRequesterAgentAutorunEnabledForOrg,
  isRequesterAgentVisionEnabledForOrg,
  isAgentUserStepsEnabled,
  getIdentityAssuranceFreshMinutes,
  isIdentityAssuranceEnabled,
} from "@/lib/admin/flags";
import { createRateLimiter, checkRateLimit } from "@/lib/ai/rate-limit";
import {
  createSession,
  loadActiveSession,
  updateSession,
  writeStep,
} from "@/lib/agent/session";
import { handleAgentRequest } from "@/lib/agent/turn";
import type { AgentEvent } from "@/lib/agent/types";
import { USER_STEP_OUTCOMES } from "@/lib/agent/user-steps";
import { createClient } from "@/lib/supabase/server";
import { computeWebAssurance } from "@/lib/identity/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const limiter = createRateLimiter(
  { windowMs: 60_000, maxRequests: 20 },
  "requester-agent"
);
const inputSchema = z
  .object({
    sessionId: z.string().uuid().optional(),
    message: z.string().trim().max(2000).optional(),
    platform: z.string().trim().max(40).nullable().optional(),
    humanRequested: z.boolean().optional(),
    consent: z
      .object({
        approvalRequestId: z.string().uuid(),
        decision: z.enum(["approve", "decline"]),
        reconfirmTainted: z.boolean().optional(),
      })
      .optional(),
    confirm: z.enum(["yes", "no"]).optional(),
    sessionConsent: z.enum(["grant", "revoke"]).optional(),
    attachmentIds: z.array(z.string().uuid()).max(2).optional(),
    userStep: z
      .object({
        stepId: z.string().uuid(),
        outcome: z.enum(USER_STEP_OUTCOMES),
      })
      .optional(),
  })
  .strict();

function sse(event: AgentEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export async function POST(request: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = await createClient();
  let claims: Record<string, unknown> | null = null;
  try {
    const result = await supabase.auth.getClaims();
    claims =
      result.data?.claims && typeof result.data.claims === "object"
        ? (result.data.claims as Record<string, unknown>)
        : null;
  } catch {
    claims = null;
  }
  const { organizationId } = await resolveOrganizationForUser(user.id);
  if (
    !isRequesterAgentEnabled() ||
    !isRequesterAgentEnabledForOrg(organizationId)
  )
    return Response.json({ error: "Not found" }, { status: 404 });
  const rate = await checkRateLimit(request, limiter);
  if (!rate.allowed)
    return Response.json({ error: "Rate limited" }, { status: 429 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = inputSchema.safeParse(body);
  if (!parsed.success)
    return Response.json({ error: "Invalid request" }, { status: 400 });
  if (
    !parsed.data.message &&
    !parsed.data.attachmentIds?.length &&
    parsed.data.consent === undefined &&
    parsed.data.confirm === undefined &&
    parsed.data.sessionConsent === undefined &&
    parsed.data.userStep === undefined
  )
    return Response.json({ error: "Invalid request" }, { status: 400 });
  if (
    (parsed.data.consent !== undefined || parsed.data.confirm !== undefined) &&
    !isRequesterAgentActionsEnabled()
  )
    return Response.json({ error: "Not found" }, { status: 404 });
  if (
    parsed.data.sessionConsent !== undefined &&
    !isRequesterAgentAutorunEnabledForOrg(organizationId)
  )
    return Response.json({ error: "Not found" }, { status: 404 });
  if (
    parsed.data.attachmentIds?.length &&
    !isRequesterAgentVisionEnabledForOrg(organizationId)
  )
    return Response.json({ error: "Not found" }, { status: 404 });
  if (parsed.data.userStep && !isAgentUserStepsEnabled())
    return Response.json({ error: "Not found" }, { status: 404 });
  const admin = createAdminClient();
  const assurance = await computeWebAssurance({
    admin,
    organizationId,
    user,
    claims,
    freshMinutes: getIdentityAssuranceFreshMinutes(),
  });
  const session = parsed.data.sessionId
    ? await loadActiveSession(admin, parsed.data.sessionId, user.id)
    : await createSession(admin, organizationId, user.id);
  if (!session)
    return Response.json({ error: "Session unavailable" }, { status: 409 });
  const previousLevel = session.assurance_level ?? null;
  const previousMethod = session.assurance_method ?? null;
  session.assurance_level = assurance.level;
  session.assurance_method = assurance.method;
  session.assurance_auth_at = assurance.authAt;
  session.assurance_expires_at = assurance.expiresAt;
  await updateSession(admin, session, {
    assurance_level: assurance.level,
    assurance_method: assurance.method,
    assurance_auth_at: assurance.authAt,
    assurance_expires_at: assurance.expiresAt,
  });
  if (
    previousLevel !== assurance.level ||
    previousMethod !== assurance.method
  ) {
    await writeStep(admin, session, {
      kind: "identity_assurance",
      resultSummary: JSON.stringify({
        level: assurance.level,
        method: assurance.method,
        authAt: assurance.authAt,
      }),
    });
  }

  const encoder = new TextEncoder();
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let closed = false;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: AgentEvent) => {
        if (!closed) controller.enqueue(encoder.encode(sse(event)));
      };
      const close = () => {
        if (closed) return;
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
        controller.close();
      };
      emit({ type: "session", sessionId: session.id });
      heartbeat = setInterval(
        () => controller.enqueue(encoder.encode(": ping\n\n")),
        10_000
      );
      request.signal.addEventListener("abort", close, { once: true });
      try {
        await handleAgentRequest({
          admin,
          session,
          message: parsed.data.message ?? "",
          consent: parsed.data.consent,
          confirm: parsed.data.confirm,
          sessionConsent: parsed.data.sessionConsent,
          attachmentIds: parsed.data.attachmentIds,
          userStep: parsed.data.userStep,
          humanRequested: parsed.data.humanRequested,
          platform: parsed.data.platform ?? undefined,
          emit,
          signal: request.signal,
          assurance: isIdentityAssuranceEnabled() ? assurance : undefined,
        });
      } catch {
        try {
          await writeStep(admin, session, {
            kind: "error",
            resultSummary: "The assistant could not continue safely.",
          });
        } catch {
          // Preserve the generic client error even if audit persistence fails.
        }
        emit({
          type: "error",
          message: "The assistant could not continue safely.",
        });
      } finally {
        close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
