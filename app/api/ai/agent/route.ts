import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/supabase/user";
import { resolveOrganizationForUser } from "@/lib/org/membership";
import {
  isRequesterAgentEnabled,
  isRequesterAgentEnabledForOrg,
} from "@/lib/admin/flags";
import { createRateLimiter, checkRateLimit } from "@/lib/ai/rate-limit";
import {
  createSession,
  escalate,
  loadActiveSession,
} from "@/lib/agent/session";
import { runAgentTurn } from "@/lib/agent/loop";
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
    message: z.string().trim().min(1).max(2000),
    platform: z.string().trim().max(40).optional(),
    humanRequested: z.boolean().optional(),
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
        if (parsed.data.humanRequested) {
          const ticketId = await escalate(
            admin,
            session,
            "user_requested_human",
            parsed.data.message
          );
          emit({ type: "escalated", ticketId, reason: "user_requested_human" });
        } else {
          await runAgentTurn({
            admin,
            session,
            userMessage: parsed.data.message,
            platform: parsed.data.platform,
            emit,
            signal: request.signal,
          });
        }
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
