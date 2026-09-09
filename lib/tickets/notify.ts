import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToUser } from "@/lib/push/send";
import { isNotificationsEnabled } from "@/lib/admin/flags";
import { enqueueNotification } from "@/lib/notifications/enqueue";
import { buildNotification } from "@/lib/notifications/templates";
import { getSiteUrl } from "@/lib/site-url";
import type { NotificationEventType } from "@/lib/notifications/types";
import type { NotificationContext } from "@/lib/notifications/templates";

export async function notifyEmployeesOfHandoff(
  organizationId: string,
  ticket: {
    id: string;
    issue_title: string;
    priority: string;
    human_response_due_at?: string | null;
    diagnosis?: string;
  }
): Promise<void> {
  const admin = createAdminClient();
  const { data: members } = await admin
    .from("organization_members")
    .select("user_id, role")
    .eq("organization_id", organizationId)
    .in("role", ["admin", "org_admin", "support_agent"]);
  if (isNotificationsEnabled()) {
    const recipients = (members ?? []).map((member) => member.user_id);
    const eventType = "ticket.handoff" as const;
    const notification = buildNotification(eventType, {
      ticketTitle: ticket.issue_title,
      ticketId: ticket.id,
      status: "Needs Human",
    });
    const message = ticket.diagnosis
      ? {
          ...notification,
          body: `${notification.body}\n\nDiagnosis: ${ticket.diagnosis}`,
        }
      : notification;
    await enqueueNotification({
      organizationId,
      ticketId: ticket.id,
      eventType,
      recipientUserIds: recipients,
      ...message,
      url: `${getSiteUrl()}/admin/tickets/${ticket.id}`,
      dedupeKey: `${eventType}:${ticket.id}:${ticket.human_response_due_at ?? Date.now()}`,
    });
    return;
  }
  const due = ticket.human_response_due_at
    ? new Date(ticket.human_response_due_at).toLocaleString()
    : "soon";
  for (const member of members ?? []) {
    try {
      await sendPushToUser(member.user_id, {
        title: "Ticket needs a human",
        body: `${ticket.issue_title} · ${ticket.priority} · respond by ${due}`,
        url: `${getSiteUrl()}/admin/tickets/${ticket.id}`,
      });
    } catch (error) {
      console.warn("Unable to notify employee of ticket handoff.", error);
    }
  }
}

export async function notifyOverdueTickets(
  organizationId: string
): Promise<void> {
  if (isNotificationsEnabled()) return;
  const admin = createAdminClient();
  const { data: tickets } = await admin
    .from("tickets")
    .select("id,user_id,issue_title,overdue_notified_at")
    .eq("organization_id", organizationId)
    .is("overdue_notified_at", null)
    .not("human_response_due_at", "is", null)
    .is("first_human_response_at", null)
    .lt("human_response_due_at", new Date().toISOString());
  const { data: admins } = await admin
    .from("organization_members")
    .select("user_id")
    .eq("organization_id", organizationId)
    .in("role", ["admin", "org_admin"]);
  for (const ticket of tickets ?? []) {
    for (const member of admins ?? []) {
      try {
        await sendPushToUser(member.user_id, {
          title: "Ticket SLA overdue",
          body: `${ticket.issue_title} needs attention.`,
          url: `${getSiteUrl()}/admin/tickets/${ticket.id}`,
        });
      } catch (error) {
        console.warn("Unable to notify admin of overdue ticket.", error);
      }
    }
    await admin
      .from("tickets")
      .update({ overdue_notified_at: new Date().toISOString() })
      .eq("id", ticket.id)
      .eq("organization_id", organizationId);
  }
}

export async function notifyRequester(
  eventType: NotificationEventType,
  ticket: {
    id: string;
    user_id?: string | null;
    issue_title: string;
    status?: string | null;
  },
  context?: Omit<NotificationContext, "ticketTitle" | "ticketId">
): Promise<void> {
  if (!ticket.user_id) return;
  const url = `${getSiteUrl()}/tickets/${ticket.id}`;
  if (isNotificationsEnabled()) {
    const message = buildNotification(eventType, {
      ticketTitle: ticket.issue_title,
      ticketId: ticket.id,
      status: ticket.status ?? undefined,
      ...context,
    });
    await enqueueNotification({
      organizationId: null,
      ticketId: ticket.id,
      eventType,
      recipientUserIds: [ticket.user_id],
      ...message,
      url,
      dedupeKey: `${eventType}:${ticket.id}:${context?.publicReplyExcerpt ?? Date.now()}`,
    });
    return;
  }
  if (eventType === "reply.public") {
    try {
      await sendPushToUser(ticket.user_id, {
        title: "Your ticket has a new reply",
        body: context?.publicReplyExcerpt
          ? `${context.publicReplyExcerpt.slice(0, 120)}`
          : "Your IT support team replied.",
        url,
      });
    } catch (error) {
      console.warn("Unable to notify ticket owner.", error);
    }
  }
}

export async function notifyStatusChange(
  ticket: {
    id: string;
    user_id?: string | null;
    issue_title: string;
  },
  change: { from: string; to: string; actorType: string }
): Promise<void> {
  await notifyRequester("ticket.status_changed", ticket, {
    status: change.to,
  });
}

export async function notifyAssignedStaff(
  eventType:
    "reply.public" | "ticket.created" | "ticket.assigned" | "ticket.resolved",
  ticket: {
    id: string;
    organization_id: string;
    issue_title: string;
    assigned_agent_id?: string | null;
  },
  context?: Omit<NotificationContext, "ticketTitle" | "ticketId">
): Promise<void> {
  const admin = createAdminClient();
  const recipients = ticket.assigned_agent_id
    ? [ticket.assigned_agent_id]
    : ((
        await admin
          .from("organization_members")
          .select("user_id")
          .eq("organization_id", ticket.organization_id)
          .in("role", ["admin", "org_admin", "support_agent"])
      ).data?.map((row) => row.user_id) ?? []);
  if (recipients.length === 0) return;
  if (isNotificationsEnabled()) {
    const message = buildNotification(eventType, {
      ticketTitle: ticket.issue_title,
      ticketId: ticket.id,
      ...context,
    });
    await enqueueNotification({
      organizationId: ticket.organization_id,
      ticketId: ticket.id,
      eventType,
      recipientUserIds: recipients,
      ...message,
      url: `${getSiteUrl()}/admin/tickets/${ticket.id}`,
      dedupeKey: `${eventType}:${ticket.id}:${context?.publicReplyExcerpt ?? Date.now()}`,
    });
    return;
  }
  if (eventType === "reply.public") {
    for (const userId of recipients) {
      try {
        await sendPushToUser(userId, {
          title: "Ticket has a new reply",
          body: context?.publicReplyExcerpt
            ? `${context.publicReplyExcerpt.slice(0, 120)}`
            : "A requester added a reply.",
          url: `${getSiteUrl()}/admin/tickets/${ticket.id}`,
        });
      } catch (error) {
        console.warn("Unable to notify staff of reply.", error);
      }
    }
  }
}
