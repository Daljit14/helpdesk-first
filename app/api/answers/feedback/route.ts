import { z } from "zod";
import { isAnswerEngineEnabled } from "@/lib/admin/flags";
import { checkRateLimit, createRateLimiter } from "@/lib/ai/rate-limit";
import { recordAnswerFeedback } from "@/lib/answers/feedback";
import { resolveOrganizationForUser } from "@/lib/org/membership";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/supabase/user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const limiter = createRateLimiter(
  { windowMs: 3_600_000, maxRequests: 20 },
  "answers-feedback"
);
const inputSchema = z
  .object({
    runId: z.string().uuid(),
    outcome: z.enum(["helpful", "not_helpful", "fixed"]),
  })
  .strict();
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export async function POST(request: Request): Promise<Response> {
  if (!isAnswerEngineEnabled())
    return Response.json({ error: "Not found" }, { status: 404 });

  const rate = await checkRateLimit(request, limiter);
  if (!rate.allowed)
    return Response.json(
      { error: "Rate limited" },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.max(1, rate.retryAfter ?? 60)),
        },
      }
    );

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }
  const parsed = inputSchema.safeParse(body);
  if (!parsed.success)
    return Response.json({ error: "Invalid request" }, { status: 400 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("answer_engine_runs")
    .select("id,organization_id,ticket_id,created_at")
    .eq("id", parsed.data.runId)
    .maybeSingle();
  if (error) return Response.json({ error: "Unavailable" }, { status: 500 });
  if (!data) return Response.json({ error: "Not found" }, { status: 404 });

  const run = data as {
    id: string;
    organization_id: string | null;
    ticket_id: string | null;
    created_at: string;
  };
  const createdAt = Date.parse(run.created_at);
  const age = Date.now() - createdAt;
  if (!Number.isFinite(createdAt) || age < 0 || age > MAX_AGE_MS)
    return Response.json({ error: "Not found" }, { status: 404 });

  if (run.organization_id !== null) {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "Not found" }, { status: 404 });
    const membership = await resolveOrganizationForUser(user.id);
    if (membership.organizationId !== run.organization_id)
      return Response.json({ error: "Not found" }, { status: 404 });
  }

  const result = await recordAnswerFeedback(admin, {
    runId: run.id,
    organizationId: run.organization_id,
    outcome: parsed.data.outcome,
    ticketId: run.ticket_id,
  });
  if (!result.ok)
    return Response.json({ error: "Unavailable" }, { status: 500 });
  return Response.json({ ok: true });
}
