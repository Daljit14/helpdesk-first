import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminSession, recordAudit } from "@/lib/admin/auth";
import { sendPushToUser } from "@/lib/push/send";
import { sendEmail } from "./email";

type OutboxRow = {
  id: string;
  organization_id: string | null;
  ticket_id: string | null;
  channel: "email" | "push";
  recipient_user_id: string;
  subject: string;
  body: string;
  url: string | null;
  attempts: number;
};

function retryable(error: string): boolean {
  return error.startsWith("retryable:");
}

export async function dispatchPending({
  ticketId,
  limit = 50,
}: {
  ticketId?: string;
  limit?: number;
} = {}): Promise<{ sent: number; failed: number; dead: number }> {
  const admin = createAdminClient();
  let query = admin
    .from("notification_outbox")
    .select(
      "id,organization_id,ticket_id,channel,recipient_user_id,subject,body,url,attempts"
    )
    .eq("status", "pending")
    .lte("next_attempt_at", new Date().toISOString())
    .order("created_at", { ascending: true })
    .limit(limit);
  if (ticketId) query = query.eq("ticket_id", ticketId);
  const { data } = await query;
  let sent = 0;
  let failed = 0;
  let dead = 0;
  for (const row of (data ?? []) as OutboxRow[]) {
    const claimed = await admin
      .from("notification_outbox")
      .update({ status: "sending" })
      .eq("id", row.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (claimed.error || !claimed.data) continue;
    let error: string | undefined;
    if (row.channel === "email") {
      const user = await admin.auth.admin.getUserById(row.recipient_user_id);
      const email = user.data.user?.email;
      if (!email) error = "permanent:recipient has no email";
      else {
        const result = await sendEmail({
          to: email,
          subject: row.subject,
          text: `${row.body}${row.url ? `\n\nOpen ticket: ${row.url}` : ""}`,
        });
        if (!result.ok) error = result.error ?? "retryable:email failed";
      }
    } else {
      try {
        const result = await sendPushToUser(row.recipient_user_id, {
          title: row.subject,
          body: row.body,
          url: row.url ?? undefined,
        });
        if (result.failed > 0) error = "retryable:push delivery failed";
      } catch (caught) {
        error = `retryable:${caught instanceof Error ? caught.message : "push failed"}`;
      }
    }
    if (!error) {
      await admin
        .from("notification_outbox")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("id", row.id);
      sent++;
      continue;
    }
    const attempts = row.attempts + 1;
    const isDead = !retryable(error) || attempts >= 5;
    const update = isDead
      ? { status: "dead", attempts, last_error: error.slice(0, 500) }
      : {
          status: "failed",
          attempts,
          next_attempt_at: new Date(
            Date.now() + Math.min(2 ** attempts * 60_000, 60 * 60_000)
          ).toISOString(),
          last_error: error.slice(0, 500),
        };
    await admin.from("notification_outbox").update(update).eq("id", row.id);
    if (isDead) dead++;
    else failed++;
  }
  return { sent, failed, dead };
}

export async function replayDead(ids: string[]): Promise<{ replayed: number }> {
  const session = await getAdminSession();
  if (!session || session.role !== "org_admin") return { replayed: 0 };
  const admin = createAdminClient();
  const result = await admin
    .from("notification_outbox")
    .update({
      status: "pending",
      attempts: 0,
      next_attempt_at: new Date().toISOString(),
      last_error: null,
    })
    .in("id", ids)
    .eq("organization_id", session.organizationId)
    .eq("status", "dead")
    .select("id");
  await recordAudit(session, "notification.replay", `${ids.length}`);
  return { replayed: result.data?.length ?? 0 };
}
