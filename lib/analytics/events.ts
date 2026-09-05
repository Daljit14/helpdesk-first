import { createAdminClient } from "@/lib/supabase/admin";

export type AnalyticsEvent = {
  eventType: "page_view" | "guide_view" | "assistant_start" | "ticket_created";
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
    });
    if (error) console.error("analytics event insert failed", error);
  } catch (error) {
    console.error("analytics event insert failed", error);
  }
}
