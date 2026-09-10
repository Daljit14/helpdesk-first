import { describe, expect, it } from "vitest";
import { resolveTicketRedirect } from "./access-redirect";

describe("resolveTicketRedirect", () => {
  const ticketId = "ticket-123";

  it("keeps an owned ticket on the requester page", () => {
    expect(
      resolveTicketRedirect({
        ownsTicket: true,
        adminSession: {
          organizationId: "org-1",
        },
        ticketOrgId: "org-1",
        ticketId,
      })
    ).toEqual({ kind: "owned" });
  });

  it("routes a same-organization admin to the admin ticket page", () => {
    expect(
      resolveTicketRedirect({
        ownsTicket: false,
        adminSession: {
          organizationId: "org-1",
        },
        ticketOrgId: "org-1",
        ticketId,
      })
    ).toEqual({
      kind: "admin",
      href: "/admin/tickets/ticket-123",
    });
  });

  it("denies tickets outside the admin organization", () => {
    expect(
      resolveTicketRedirect({
        ownsTicket: false,
        adminSession: {
          organizationId: "org-1",
        },
        ticketOrgId: "org-2",
        ticketId,
      })
    ).toEqual({ kind: "denied" });
  });

  it("denies missing tickets without an admin session", () => {
    expect(
      resolveTicketRedirect({
        ownsTicket: false,
        adminSession: null,
        ticketOrgId: null,
        ticketId,
      })
    ).toEqual({ kind: "denied" });
  });
});
