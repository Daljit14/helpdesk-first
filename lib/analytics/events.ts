import { createAdminClient } from "@/lib/supabase/admin";

export type AnalyticsEvent = {
  eventType:
    | "page_view"
    | "guide_view"
    | "assistant_start"
    | "ai_recommendation_accepted"
    | "ai_recommendation_rejected"
    | "troubleshooting_completed"
    | "ticket_created"
    | "ticket_status_changed";
  path: string;
  issueId?: string | null;
  visitorKey: string;
  platform?: string | null;
};

export async function recordAnalyticsEvent(
  event: AnalyticsEvent
): Promise<void> {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    return;
  }
  try {
    const supabase = createAdminClient();
    const { error } = await supabase.from("analytics_events").insert({
      event_type: event.eventType,
      path: event.path,
      issue_id: event.issueId ?? null,
      visitor_key: event.visitorKey,
      platform: event.platform ?? null,
      organization_id:
        process.env.OPERATIONS_ORGANIZATION_ID ??
        "00000000-0000-0000-0000-000000000001",
    });
    if (error) console.error("analytics event insert failed", error);
    await runRetentionIfDue(supabase);
  } catch (error) {
    console.error("analytics event insert failed", error);
  }
}

export async function touchActiveSession(sessionKey: string): Promise<void> {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    return;
  }
  try {
    const supabase = createAdminClient();
    await supabase.from("active_sessions").upsert(
      {
        session_key: sessionKey,
        organization_id:
          process.env.OPERATIONS_ORGANIZATION_ID ??
          "00000000-0000-0000-0000-000000000001",
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "session_key" }
    );
    await runRetentionIfDue(supabase);
  } catch (error) {
    console.error("active session update failed", error);
  }
}

let lastRetentionRun = 0;
async function runRetentionIfDue(
  supabase: ReturnType<typeof createAdminClient>
) {
  if (Date.now() - lastRetentionRun < 60 * 60 * 1000) return;
  lastRetentionRun = Date.now();
  const { error } = await supabase.rpc("analytics_retention_rollup");
  if (error) console.error("analytics retention failed", error);
}
