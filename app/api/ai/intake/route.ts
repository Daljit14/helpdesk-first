import type { NextRequest } from "next/server";
import { processAiIntake } from "@/lib/ai/intake";
import { createAiProvider } from "@/lib/ai/mock-provider";
import { diagnosticQuestions } from "@/lib/ai/types";
import { getAllIssueSlugs } from "@/lib/search";
import { platforms } from "@/lib/helpdesk-data";

export const runtime = "edge";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { status: "error", reason: "Invalid JSON body." },
      { status: 400 }
    );
  }

  if (!body || typeof body !== "object") {
    return Response.json(
      { status: "error", reason: "Request body must be an object." },
      { status: 400 }
    );
  }

  const { message, platform, previousAnswers } = body as {
    message?: unknown;
    platform?: unknown;
    previousAnswers?: unknown;
  };

  if (typeof message !== "string" || message.trim() === "") {
    return Response.json(
      { status: "error", reason: "message must be a non-empty string." },
      { status: 400 }
    );
  }

  const validatedPlatform =
    platform === null || platform === undefined
      ? null
      : typeof platform === "string" &&
          platforms.includes(platform as (typeof platforms)[number])
        ? (platform as (typeof platforms)[number])
        : null;

  const validatedAnswers = Array.isArray(previousAnswers)
    ? previousAnswers.filter(
        (a): a is { questionId: string; answer: string } =>
          a &&
          typeof a === "object" &&
          "questionId" in a &&
          "answer" in a &&
          typeof a.questionId === "string" &&
          typeof a.answer === "string"
      )
    : [];

  const result = await processAiIntake(
    {
      message: message.trim(),
      platform: validatedPlatform,
      previousAnswers: validatedAnswers,
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
