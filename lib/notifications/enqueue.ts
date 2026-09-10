import { after } from "next/server";
import { isNotificationsEnabled } from "@/lib/admin/flags";
import { createAdminClient } from "@/lib/supabase/admin";
import { dispatchPending } from "./dispatch";
import type { NotificationEventType } from "./types";

type Input = {
  organizationId: string | null;
  ticketId: string | null;
  eventType: NotificationEventType;
  recipientUserIds: string[];
  subject: string;
  body: string;
  url?: string;
  dedupeKey: string;
};

export async function enqueueNotification(input: Input): Promise<void> {
  if (!isNotificationsEnabled() || input.recipientUserIds.length === 0) return;
  try {
    const admin = createAdminClient();
    const { data: preferences } = await admin
      .from("notification_preferences")
      .select("user_id,email_enabled,push_enabled")
      .in("user_id", input.recipientUserIds);
    const preferenceMap = new Map(
      (preferences ?? []).map((row) => [
        row.user_id,
        {
          email: row.email_enabled !== false,
          push: row.push_enabled !== false,
        },
      ])
    );
    const rows = input.recipientUserIds.flatMap((userId) => {
      const preference = preferenceMap.get(userId) ?? {
        email: true,
        push: true,
      };
      return (["email", "push"] as const)
        .filter((channel) => preference[channel])
        .map((channel) => ({
          organization_id: input.organizationId,
          ticket_id: input.ticketId,
          event_type: input.eventType,
          channel,
          recipient_user_id: userId,
          dedupe_key: `${input.dedupeKey}:${userId}:${channel}`,
          subject: input.subject,
          body: input.body,
          url: input.url ?? null,
        }));
    });
    if (rows.length > 0) {
      await admin
        .from("notification_outbox")
        .upsert(rows, { onConflict: "dedupe_key", ignoreDuplicates: true });
    }
    try {
      after(() => dispatchPending({ ticketId: input.ticketId ?? undefined }));
    } catch {
      void dispatchPending({ ticketId: input.ticketId ?? undefined });
    }
  } catch (error) {
    console.error("notification enqueue failed", error);
  }
}
