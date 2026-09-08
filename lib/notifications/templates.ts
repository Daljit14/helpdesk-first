import type { NotificationEventType } from "./types";

export type NotificationContext = {
  ticketTitle: string;
  ticketId: string;
  status?: string;
  actorLabel?: string;
  publicReplyExcerpt?: string;
};

function excerpt(value: string | undefined): string {
  return (value ?? "").trim().slice(0, 240);
}

export function buildNotification(
  eventType: NotificationEventType,
  context: NotificationContext
): { subject: string; body: string } {
  const title = context.ticketTitle;
  const actor = context.actorLabel ?? "Your support team";
  const reply = excerpt(context.publicReplyExcerpt);
  let subject = "Ticket update";
  let message = `${title} has an update.`;

  switch (eventType) {
    case "ticket.created":
      subject = "Ticket received";
      message = `${title} was submitted successfully.`;
      break;
    case "ticket.handoff":
      subject = "Human support requested";
      message = `${title} has been handed to ${actor}.`;
      break;
    case "ticket.assigned":
      subject = "Ticket assigned";
      message = `${title} was assigned to ${actor}.`;
      break;
    case "reply.public":
      subject = "New reply on your ticket";
      message = reply
        ? `${actor} replied: ${reply}`
        : `${actor} replied to ${title}.`;
      break;
    case "info.requested":
      subject = "More information requested";
      message = `${actor} requested more information for ${title}.`;
      break;
    case "verification.requested":
      subject = "Please verify your ticket";
      message = `${title} is ready for you to confirm whether the issue is fixed.`;
      break;
    case "ticket.resolved":
      subject = "Ticket resolved";
      message = `${title} was marked resolved.`;
      break;
    case "ticket.reopened":
      subject = "Ticket reopened";
      message = `${title} was reopened and needs attention.`;
      break;
    case "sla.first_response_at_risk":
      subject = "Ticket response SLA at risk";
      message = `${title} is approaching its first-response deadline.`;
      break;
    case "sla.first_response_overdue":
      subject = "Ticket response SLA overdue";
      message = `${title} is overdue for a first response.`;
      break;
    case "sla.resolution_overdue":
      subject = "Ticket resolution SLA overdue";
      message = `${title} is overdue for resolution.`;
      break;
  }

  if (context.status) message += ` Current status: ${context.status}.`;
  return { subject, body: message };
}
