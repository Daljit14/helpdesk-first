import { z } from "zod";
import {
  isAnswerEngineEnabled,
  isAnswerEnginePublicEnabled,
  isCommunityTipsEnabled,
} from "@/lib/admin/flags";
import { checkUserMessageSafety } from "@/lib/ai/safety-policy";
import { checkRateLimit, createRateLimiter } from "@/lib/ai/rate-limit";
import { matchGuides } from "@/lib/assistant/guide-match";
import { runAnswerEngine } from "@/lib/answers";
import { presentAnswer } from "@/lib/answers/present";
import { loadConfirmedOrgEnvironment } from "@/lib/org-environment/profile";
import { resolveOrganizationForUser } from "@/lib/org/membership";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/supabase/user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const userLimiter = createRateLimiter(
  { windowMs: 3_600_000, maxRequests: 10 },
  "answers-user"
);
const publicLimiter = createRateLimiter(
  { windowMs: 3_600_000, maxRequests: 2 },
  "answers-public"
);
const inputSchema = z
  .object({
    problem: z.string().trim().min(3).max(500),
    platform: z.string().trim().max(40).nullable(),
  })
  .strict();

function rateLimited(retryAfter?: number): Response {
  return Response.json(
    { status: "rate_limited" },
    {
      status: 429,
      headers: {
        "Retry-After": String(Math.max(1, retryAfter ?? 60)),
      },
    }
  );
}

export async function POST(request: Request): Promise<Response> {
  if (!isAnswerEngineEnabled())
    return Response.json({ status: "disabled" }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ status: "invalid_request" }, { status: 400 });
  }
  const parsed = inputSchema.safeParse(body);
  if (!parsed.success)
    return Response.json({ status: "invalid_request" }, { status: 400 });

  const user = await getCurrentUser();
  let organizationId: string | null = null;
  if (user) {
    organizationId =
      (await resolveOrganizationForUser(user.id)).organizationId ?? null;
  }

  if (user && organizationId) {
    const rate = await userLimiter.check(`user:${user.id}`);
    if (!rate.allowed) return rateLimited(rate.retryAfter);
  } else {
    if (!isAnswerEnginePublicEnabled())
      return Response.json({ status: "disabled" }, { status: 404 });
    const rate = await checkRateLimit(request, publicLimiter);
    if (!rate.allowed) return rateLimited(rate.retryAfter);
    organizationId = null;
  }

  if (!checkUserMessageSafety({ message: parsed.data.problem }).allowed)
    return Response.json({ status: "escalate" });
  if (matchGuides(parsed.data.problem).status !== "none")
    return Response.json({ status: "guide_match" });

  const admin = createAdminClient();
  let approvedSoftware: readonly string[] = [];
  if (user && organizationId) {
    try {
      approvedSoftware =
        (await loadConfirmedOrgEnvironment(admin, organizationId))
          ?.approvedSoftware ?? [];
    } catch {
      approvedSoftware = [];
    }
  }

  try {
    const result = await runAnswerEngine(admin, {
      organizationId,
      agentSessionId: null,
      ticketId: null,
      problem: parsed.data.problem,
      platform: parsed.data.platform,
      denyTerms: [],
      signal: request.signal,
    });
    return Response.json({
      status: "ok",
      card: presentAnswer(result, {
        approvedSoftware,
        communityTipsEnabled: isCommunityTipsEnabled(),
      }),
    });
  } catch {
    return Response.json({
      status: "ok",
      card: presentAnswer(
        {
          status: "unavailable",
          runId: null,
          answer: null,
          sources: [],
          cached: false,
          droppedClaims: 0,
        },
        {
          approvedSoftware,
          communityTipsEnabled: isCommunityTipsEnabled(),
        }
      ),
    });
  }
}
