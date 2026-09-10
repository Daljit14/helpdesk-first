export type TicketAccessRedirectInput = {
  ownsTicket: boolean;
  adminSession: { organizationId: string } | null;
  ticketOrgId: string | null | undefined;
  ticketId: string;
};

export type TicketAccessRedirect =
  { kind: "owned" } | { kind: "admin"; href: string } | { kind: "denied" };

export function resolveTicketRedirect({
  ownsTicket,
  adminSession,
  ticketOrgId,
  ticketId,
}: TicketAccessRedirectInput): TicketAccessRedirect {
  if (ownsTicket) return { kind: "owned" };
  if (
    adminSession &&
    ticketOrgId &&
    adminSession.organizationId === ticketOrgId
  ) {
    return { kind: "admin", href: `/admin/tickets/${ticketId}` };
  }
  return { kind: "denied" };
}
