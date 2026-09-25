import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/supabase/user";
import { resolveOrganizationForUser } from "@/lib/org/membership";
import {
  isRequesterAgentEnabled,
  isRequesterAgentActionsEnabled,
  isRequesterAgentEnabledForOrg,
} from "@/lib/admin/flags";
import { createRateLimiter, checkRateLimit } from "@/lib/ai/rate-limit";
import { createSession, loadActiveSession } from "@/lib/agent/session";
import { handleAgentRequest } from "@/lib/agent/turn";
import type { AgentEvent } from "@/lib/agent/types";

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
      })
      .optional(),
    confirm: z.enum(["yes", "no"]).optional(),
  })
  .strict();

function sse(event: AgentEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export async function POST(request: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
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
    parsed.data.consent === undefined &&
    parsed.data.confirm === undefined
  )
    return Response.json({ error: "Invalid request" }, { status: 400 });
  if (
    (parsed.data.consent !== undefined || parsed.data.confirm !== undefined) &&
    !isRequesterAgentActionsEnabled()
  )
    return Response.json({ error: "Not found" }, { status: 404 });
  const admin = createAdminClient();
  const session = parsed.data.sessionId
    ? await loadActiveSession(admin, parsed.data.sessionId, user.id)
    : await createSession(admin, organizationId, user.id);
  if (!session)
    return Response.json({ error: "Session unavailable" }, { status: 409 });

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
          humanRequested: parsed.data.humanRequested,
          platform: parsed.data.platform ?? undefined,
          emit,
          signal: request.signal,
        });
      } catch {
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
