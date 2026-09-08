"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminSession } from "@/lib/admin/auth";
import { replayDead } from "@/lib/notifications/dispatch";

export async function getNotificationOutbox(organizationId: string) {
  const session = await getAdminSession();
  if (!session || session.organizationId !== organizationId) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from("notification_outbox")
    .select(
      "id,event_type,channel,recipient_user_id,subject,body,status,attempts,last_error,created_at,sent_at"
    )
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(200);
  return data ?? [];
}

export async function replayNotifications(ids: string[]) {
  const session = await getAdminSession();
  if (!session || session.role !== "org_admin")
    return { error: "Not authorized." };
  const result = await replayDead(ids);
  return { success: true, replayed: result.replayed };
}
