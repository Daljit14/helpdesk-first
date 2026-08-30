import type { NextRequest } from "next/server";
import { processAiIntake } from "@/lib/ai/intake";
import { createAiProvider } from "@/lib/ai/mock-provider";
import { checkRateLimit, getRateLimiter } from "@/lib/ai/rate-limit";
import { SAFE_ERROR_MESSAGES, validateApiRequest } from "@/lib/ai/validation";
import { diagnosticQuestions } from "@/lib/ai/types";
import { getAllIssueSlugs } from "@/lib/search";
import { platforms } from "@/lib/helpdesk-data";

export async function POST(request: NextRequest) {
  const aiState = processAiIntakeState();
  if (!aiState.enabled) {
    return Response.json(
      { status: "unavailable", reason: aiState.reason },
      { status: 503 }
    );
  }

  const limiter = getRateLimiter();
  const rateLimit = await checkRateLimit(request, limiter);
  if (!rateLimit.allowed) {
    const headers: Record<string, string> = {};
    if (rateLimit.retryAfter && rateLimit.retryAfter > 0) {
      headers["Retry-After"] = String(rateLimit.retryAfter);
    }
    return Response.json(
      {
        status: "error",
        reason:
          rateLimit.reason ?? "Too many requests. Please try again later.",
      },
      { status: 429, headers }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { status: "error", reason: "Invalid JSON body." },
      { status: 400 }
    );
  }

  const requestValidation = validateApiRequest(body);
  if (!requestValidation.success) {
    return Response.json(
      {
        status: "error",
        reason: "Invalid request.",
        details: requestValidation.errors.map(
          (error) => SAFE_ERROR_MESSAGES[error.code]
        ),
      },
      { status: 400 }
    );
  }

  const { message, platform, previousAnswers } = requestValidation.data;

  const result = await processAiIntake(
    {
      message,
      platform,
      previousAnswers,
    },
    {
      provider: createAiProvider(),
      allowedSlugs: getAllIssueSlugs(),
      allowedQuestions: diagnosticQuestions,
      allowedPlatforms: platforms,
    }
  );

  switch (result.status) {
    case "success":
      return Response.json({ status: "ok", output: result.output });
    case "unavailable":
      return Response.json(
        { status: "unavailable", reason: result.reason },
        { status: 503 }
      );
    case "unsafe":
      return Response.json(
        {
          status: "escalate",
          reason: result.reason,
          category: result.category,
        },
        { status: 200 }
      );
  }
}

function processAiIntakeState(): {
  enabled: boolean;
  reason?: string;
} {
  const value = process.env.HELP_DESK_AI_ENABLED;
  if (value === "true") {
    return { enabled: true };
  }
  return {
    enabled: false,
    reason: "AI intake is currently disabled.",
  };
}
