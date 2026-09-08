import { describe, expect, test } from "vitest";
import { buildNotification } from "./templates";
import type { NotificationEventType } from "./types";

describe("buildNotification", () => {
  const base = { ticketTitle: "No internet", ticketId: "t1" };

  test.each([
    "ticket.created",
    "ticket.handoff",
    "ticket.assigned",
    "reply.public",
    "info.requested",
    "verification.requested",
    "ticket.resolved",
    "ticket.reopened",
    "sla.first_response_at_risk",
    "sla.first_response_overdue",
    "sla.resolution_overdue",
  ] as NotificationEventType[])(
    "builds %s without internal content",
    (eventType) => {
      const result = buildNotification(eventType, {
        ...base,
        actorLabel: "Support",
        publicReplyExcerpt: "Public reply",
        status: "Needs Human",
      });
      expect(result.subject).toBeTruthy();
      expect(result.body).not.toMatch(/https?:\/\/|\/tickets\//);
      expect(result.body).not.toContain("internal note");
    }
  );

  test("builds ticket.created notification", () => {
    const result = buildNotification("ticket.created", {
      ...base,
      status: "New",
    });
    expect(result.subject).toBe("Ticket received");
    expect(result.body).toContain("No internet");
    expect(result.body).not.toMatch(/https?:\/\/|\/tickets\//);
  });

  test("truncates reply excerpt at 240 characters", () => {
    const excerpt = "a".repeat(300);
    const result = buildNotification("reply.public", {
      ...base,
      publicReplyExcerpt: excerpt,
    });
    expect(result.body).toContain("a".repeat(240));
    expect(result.body).not.toContain("a".repeat(241));
  });

  test("builds SLA risk notifications", () => {
    const result = buildNotification("sla.first_response_overdue", base);
    expect(result.subject).toBe("Ticket response SLA overdue");
    expect(result.body).toContain("No internet");
  });
});
