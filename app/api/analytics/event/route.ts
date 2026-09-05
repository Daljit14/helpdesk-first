import { NextResponse } from "next/server";
import { z } from "zod";
import { ISSUES } from "@/lib/issues";
import {
  recordAnalyticsEvent,
  touchActiveSession,
} from "@/lib/analytics/events";
import { randomUUID } from "node:crypto";

const eventSchema = z
  .object({
    type: z.enum([
      "page_view",
      "guide_opened",
      "assistant_started",
      "ai_recommendation_accepted",
      "ai_recommendation_rejected",
      "troubleshooting_completed",
      "heartbeat",
    ]),
    path: z.string().max(200).startsWith("/"),
    platform: z.string().max(20).nullish(),
    issueId: z
      .string()
      .max(80)
      .refine((value) => ISSUES.some((issue) => issue.id === value))
      .optional(),
  })
  .strict();

const PRIVATE_PREFIXES = [
  "/admin",
  "/api",
  "/tickets",
  "/bookmarks",
  "/login",
  "/signup",
  "/reset-password",
  "/forgot-password",
  "/check-email",
  "/auth",
];

function readCookie(request: Request, name: string): string | null {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const pair = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  return pair ? decodeURIComponent(pair.slice(name.length + 1)) : null;
}

export async function POST(request: Request) {
  let input: unknown;
  try {
    input = JSON.parse(await request.text());
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 }
    );
  }

  const parsed = eventSchema.safeParse(input);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 }
    );
  }

  const path = parsed.data.path.split(/[?#]/, 1)[0];
  if (PRIVATE_PREFIXES.some((prefix) => path.startsWith(prefix))) {
    return NextResponse.json(
      { ok: true, skipped: true },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  const visitorKey = readCookie(request, "hd_sid") ?? randomUUID();
  if (parsed.data.type === "heartbeat") {
    await touchActiveSession(visitorKey);
    const response = NextResponse.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } }
    );
    if (!readCookie(request, "hd_sid")) {
      response.cookies.set("hd_sid", visitorKey, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 60 * 60 * 24,
        path: "/",
      });
    }
    return response;
  }
  const issueSlug = path.split("/")[2] ?? "";
  const issue = path.startsWith("/issues/")
    ? ISSUES.find((candidate) => candidate.id === issueSlug)
    : undefined;
  const eventType =
    (parsed.data.type === "page_view" || parsed.data.type === "guide_opened") &&
    path.startsWith("/issues/")
      ? "guide_view"
      : parsed.data.type === "guide_opened"
        ? "guide_view"
        : parsed.data.type === "assistant_started"
          ? "assistant_start"
          : parsed.data.type;
  await touchActiveSession(visitorKey);
  await recordAnalyticsEvent({
    eventType,
    path,
    issueId: parsed.data.issueId ?? issue?.id ?? null,
    visitorKey,
    platform: parsed.data.platform ?? null,
  });

  const response = NextResponse.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store" } }
  );
  if (!readCookie(request, "hd_sid")) {
    response.cookies.set("hd_sid", visitorKey, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24,
      path: "/",
    });
  }
  return response;
}
