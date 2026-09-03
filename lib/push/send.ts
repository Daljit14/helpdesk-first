import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";

function configureWebPush() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? "mailto:support@example.com";

  if (!publicKey || !privateKey) {
    throw new Error("VAPID keys are not configured.");
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
};

export async function sendPushToUser(
  userId: string,
  payload: PushPayload
): Promise<{ sent: number; failed: number }> {
  configureWebPush();
  const admin = createAdminClient();

  const { data: subscriptions } = await admin
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("user_id", userId);

  let sent = 0;
  let failed = 0;

  for (const sub of subscriptions ?? []) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        JSON.stringify(payload)
      );
      sent++;
    } catch (error: unknown) {
      failed++;
      const statusCode = (error as { statusCode?: number })?.statusCode;
      if (statusCode === 404 || statusCode === 410) {
        await admin
          .from("push_subscriptions")
          .delete()
          .eq("endpoint", sub.endpoint);
      }
    }
  }

  return { sent, failed };
}
