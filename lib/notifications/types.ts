export type NotificationEventType =
  | "ticket.created"
  | "ticket.handoff"
  | "ticket.assigned"
  | "reply.public"
  | "info.requested"
  | "verification.requested"
  | "ticket.resolved"
  | "ticket.reopened"
  | "ticket.status_changed"
  | "org.role_changed"
  | "sla.first_response_at_risk"
  | "sla.first_response_overdue"
  | "sla.resolution_overdue";

export type NotificationChannel = "email" | "push";
