import { timingSafeEqual } from "node:crypto";
import { sendPushToUser } from "@/lib/push/send";

type SupabaseWebhookPayload = {
  type: "UPDATE" | "INSERT" | "DELETE";
  table: string;
  record: {
    id: string;
    user_id: string;
    issue_title: string;
    status: string;
  };
  old_record?: { status?: string };
};

/**
 * Receives Supabase's Database Webhook fired on `tickets` UPDATE
 * (Dashboard → Database → Webhooks). Sends a push notification when the
 * ticket's status actually changed. See SETUP-NOTES.md for wiring this up.
 */
export async function POST(request: Request) {
  const secret = request.headers.get("x-webhook-secret");
  const expectedSecret = process.env.SUPABASE_WEBHOOK_SECRET;
  const secretsMatch =
    secret &&
    expectedSecret &&
    Buffer.byteLength(secret) === Buffer.byteLength(expectedSecret) &&
    timingSafeEqual(Buffer.from(secret), Buffer.from(expectedSecret));
  if (!secretsMatch) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  let payload: SupabaseWebhookPayload;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (
    payload.table !== "tickets" ||
    payload.type !== "UPDATE" ||
    !payload.record?.user_id
  ) {
    return Response.json({ ok: true, skipped: true });
  }

  const statusChanged = payload.old_record?.status !== payload.record.status;
  if (!statusChanged) {
    return Response.json({ ok: true, skipped: true });
  }

  try {
    const result = await sendPushToUser(payload.record.user_id, {
      title: "Ticket update",
      body: `"${payload.record.issue_title}" is now ${payload.record.status}.`,
      url: "/tickets",
    });
    return Response.json({ ok: true, ...result });
  } catch (error) {
    console.error("push send failed", error);
    return Response.json({ ok: false }, { status: 500 });
  }
}
