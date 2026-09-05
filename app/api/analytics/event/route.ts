import { NextResponse } from "next/server";
import { z } from "zod";
import { ISSUES } from "@/lib/issues";
import { recordAnalyticsEvent } from "@/lib/analytics/events";
import { randomUUID } from "node:crypto";

const eventSchema = z.object({
  type: z.enum(["page_view", "assistant_start"]),
  path: z.string().max(200).startsWith("/"),
  platform: z.string().max(20).optional(),
});

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

  const visitorKey = readCookie(request, "hd_vid") ?? randomUUID();
  const issueSlug = path.split("/")[2] ?? "";
  const issue = path.startsWith("/issues/")
    ? ISSUES.find((candidate) => candidate.id === issueSlug)
    : undefined;
  const eventType = path.startsWith("/issues/")
    ? "guide_view"
    : parsed.data.type;

  await recordAnalyticsEvent({
    eventType,
    path,
    issueId: issue?.id ?? null,
    visitorKey,
    platform: parsed.data.platform ?? null,
  });

  const response = NextResponse.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store" } }
  );
  if (!readCookie(request, "hd_vid")) {
    response.cookies.set("hd_vid", visitorKey, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
    });
  }
  return response;
}
