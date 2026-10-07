import { z } from "zod";
import { isAssistantChatEnabled } from "@/lib/admin/flags";
import { checkAndConsumeDailyBudget } from "@/lib/ai/budget";
import { getAiModel, getAiProviderKind } from "@/lib/ai/config";
import { checkRateLimit, createRateLimiter } from "@/lib/ai/rate-limit";
import { checkUserMessageSafety, isAiEnabled } from "@/lib/ai/safety-policy";
import { recordProviderCall } from "@/lib/ai/telemetry";
import { detectSensitive } from "@/lib/assistant/input-quality";
import {
  generateChatReply,
  screenChatReply,
  type ChatTurnInput,
} from "@/lib/assistant/chat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const limiter = createRateLimiter(
  { windowMs: 3_600_000, maxRequests: 30 },
  "assistant-chat"
);
const inputSchema = z
  .object({
    turns: z
      .array(
        z
          .object({
            role: z.enum(["user", "assistant"]),
            text: z.string().trim().min(1).max(1000),
          })
          .strict()
      )
      .min(1)
      .max(20),
    platform: z.string().trim().max(40).nullable(),
  })
  .strict();

function unavailable(): Response {
  return Response.json({ status: "unavailable" }, { status: 200 });
}

function rateLimited(retryAfter?: number): Response {
  return Response.json(
    { status: "rate_limited" },
    {
      status: 429,
      headers: { "Retry-After": String(Math.max(1, retryAfter ?? 60)) },
    }
  );
}

export async function POST(request: Request): Promise<Response> {
  if (!isAssistantChatEnabled())
    return Response.json({ status: "disabled" }, { status: 404 });

  const provider = getAiProviderKind();
  if (
    !isAiEnabled().enabled ||
    provider !== "anthropic" ||
    !process.env.ANTHROPIC_API_KEY
  ) {
    return unavailableWithStatus();
  }

  const rate = await checkRateLimit(request, limiter);
  if (!rate.allowed) return rateLimited(rate.retryAfter);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ status: "invalid_request" }, { status: 400 });
  }
  const parsed = inputSchema.safeParse(body);
  if (!parsed.success || parsed.data.turns.at(-1)?.role !== "user")
    return Response.json({ status: "invalid_request" }, { status: 400 });

  const userTurns = parsed.data.turns.filter(
    (turn): turn is ChatTurnInput => turn.role === "user"
  );
  if (userTurns.some((turn) => detectSensitive(turn.text)))
    return unavailable();

  const lastUserTurn = userTurns[userTurns.length - 1];
  if (!lastUserTurn)
    return Response.json({ status: "invalid_request" }, { status: 400 });
  const previousAnswers = userTurns
    .slice(0, -1)
    .map((turn) => ({ questionId: "chat", answer: turn.text }));
  if (
    !checkUserMessageSafety({
      message: lastUserTurn.text,
      previousAnswers,
    }).allowed
  ) {
    return unavailable();
  }

  if (!(await checkAndConsumeDailyBudget())) return unavailable();

  const model = getAiModel();
  const signal = AbortSignal.timeout(8_000);
  const startedAt = Date.now();
  let generated: Awaited<ReturnType<typeof generateChatReply>>;
  try {
    generated = await generateChatReply({
      turns: parsed.data.turns,
      platform: parsed.data.platform,
      apiKey: process.env.ANTHROPIC_API_KEY,
      model,
      signal,
    });
  } catch {
    generated = { status: "unavailable" };
  }
  const reply =
    generated.status === "ok" ? screenChatReply(generated.text) : null;
  recordProviderCall({
    provider: "anthropic",
    model,
    outcome: signal.aborted
      ? "timeout"
      : reply
        ? "ok"
        : generated.status === "ok"
          ? "unsafe"
          : "error",
    latencyMs: Date.now() - startedAt,
    ...(generated.status === "ok"
      ? {
          ...(generated.inputTokens !== undefined
            ? { inputTokens: generated.inputTokens }
            : {}),
          ...(generated.outputTokens !== undefined
            ? { outputTokens: generated.outputTokens }
            : {}),
        }
      : {}),
  });
  if (!reply) return unavailable();
  return Response.json({ status: "ok", reply });
}

function unavailableWithStatus(): Response {
  return Response.json({ status: "unavailable" }, { status: 503 });
}
