"use server";

import { z } from "zod";
import { isServiceHealthEnabled } from "@/lib/admin/flags";
import { createRateLimiter, getRateLimitConfig } from "@/lib/ai/rate-limit";
import { getServiceHealth } from "@/lib/service-health";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/supabase/user";

const subscriptionSchema = z
  .object({
    sessionId: z.string().uuid(),
    source: z.enum(["microsoft365", "google_workspace", "statuspage"]),
    incidentId: z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/),
  })
  .strict();

const limiter = createRateLimiter(
  { ...getRateLimitConfig(), maxRequests: 10 },
  "outage-subscriptions"
);

export type SubscribeToOutageResult =
  | { ok: true }
  | {
      ok: false;
      error:
        | "disabled"
        | "unauthenticated"
        | "invalid"
        | "rate_limited"
        | "not_found"
        | "failed";
    };

export async function subscribeToOutage(input: {
  sessionId: string;
  source: string;
  incidentId: string;
}): Promise<SubscribeToOutageResult> {
  if (!isServiceHealthEnabled()) return { ok: false, error: "disabled" };

  let user;
  try {
    user = await getCurrentUser();
  } catch {
    return { ok: false, error: "unauthenticated" };
  }
  if (!user) return { ok: false, error: "unauthenticated" };

  const parsed = subscriptionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  let rate;
  try {
    rate = await limiter.check(`outage:user:${user.id}`);
  } catch {
    return { ok: false, error: "failed" };
  }
  if (!rate.allowed) return { ok: false, error: "rate_limited" };

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return { ok: false, error: "failed" };
  }

  let sessionResult;
  try {
    sessionResult = await admin
      .from("agent_sessions")
      .select("id,organization_id,requester_id")
      .eq("id", parsed.data.sessionId)
      .eq("requester_id", user.id)
      .maybeSingle();
  } catch {
    return { ok: false, error: "failed" };
  }
  if (sessionResult.error) return { ok: false, error: "failed" };
  const session = sessionResult.data;
  if (!session) return { ok: false, error: "not_found" };

  let snapshot;
  try {
    snapshot = await getServiceHealth(
      admin,
      session.organization_id,
      new AbortController().signal
    );
  } catch {
    return { ok: false, error: "failed" };
  }
  const incident = snapshot.incidents.find(
    (item) =>
      item.source === parsed.data.source &&
      item.incidentId === parsed.data.incidentId
  );
  if (!incident) return { ok: false, error: "not_found" };

  try {
    const result = await admin.from("outage_subscriptions").insert({
      organization_id: session.organization_id,
      user_id: user.id,
      session_id: session.id,
      source: incident.source,
      incident_id: incident.incidentId,
      service: incident.service,
      title: incident.title,
      incident_url: incident.url,
      status: "active",
    });
    if (result.error?.code === "23505") return { ok: true };
    if (result.error) return { ok: false, error: "failed" };
    return { ok: true };
  } catch {
    return { ok: false, error: "failed" };
  }
}
