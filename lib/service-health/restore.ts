import { buildNotification } from "@/lib/notifications/templates";
import { enqueueNotification } from "@/lib/notifications/enqueue";
import { createAdminClient } from "@/lib/supabase/admin";
import { getServiceHealth } from "./index";
import type { ServiceHealthSource } from "./types";

type Admin = ReturnType<typeof createAdminClient>;
type Subscription = {
  id: string;
  organization_id: string;
  user_id: string;
  source: ServiceHealthSource;
  incident_id: string;
  service: string;
};

export async function notifyRestoredOutages(
  admin: Admin
): Promise<{ checked: number; notified: number; failed: number }> {
  const result = await admin
    .from("outage_subscriptions")
    .select("id,organization_id,user_id,source,incident_id,service")
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(500);
  if (result.error) throw result.error;

  const subscriptions = (result.data ?? []) as Subscription[];
  const byOrganization = new Map<string, Subscription[]>();
  for (const subscription of subscriptions) {
    const existing = byOrganization.get(subscription.organization_id) ?? [];
    existing.push(subscription);
    byOrganization.set(subscription.organization_id, existing);
  }

  let notified = 0;
  let failed = 0;
  for (const [organizationId, organizationSubscriptions] of byOrganization) {
    const snapshot = await getServiceHealth(
      admin,
      organizationId,
      new AbortController().signal,
      { fresh: true }
    );
    for (const subscription of organizationSubscriptions) {
      const sourceSucceeded =
        subscription.source === "statuspage"
          ? (() => {
              const separator = subscription.incident_id.indexOf(":");
              const sourceId =
                separator > 0
                  ? subscription.incident_id.slice(0, separator)
                  : null;
              return Boolean(
                sourceId &&
                snapshot.sources.some(
                  (source) =>
                    source.source === "statuspage" &&
                    source.sourceId === sourceId &&
                    source.ok
                )
              );
            })()
          : snapshot.sources.some(
              (source) =>
                source.source === subscription.source && source.ok === true
            );
      if (!sourceSucceeded) continue;
      const incidentStillActive = snapshot.incidents.some(
        (incident) =>
          incident.source === subscription.source &&
          incident.incidentId === subscription.incident_id
      );
      if (incidentStillActive) continue;

      try {
        const notification = buildNotification("service.restored", {
          ticketTitle: subscription.service,
          ticketId: "",
        });
        await enqueueNotification({
          organizationId,
          ticketId: null,
          eventType: "service.restored",
          recipientUserIds: [subscription.user_id],
          subject: notification.subject,
          body: notification.body,
          url: "/assistant",
          dedupeKey: `outage:${subscription.id}`,
        });
        const updated = await admin
          .from("outage_subscriptions")
          .update({ status: "notified", notified_at: new Date().toISOString() })
          .eq("id", subscription.id)
          .eq("status", "active");
        if (updated.error) throw updated.error;
        notified += 1;
      } catch {
        failed += 1;
      }
    }
  }

  return { checked: subscriptions.length, notified, failed };
}
