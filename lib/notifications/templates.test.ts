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
    expect(result.subject).toBe("🎫 We got your ticket: “No internet”");
    expect(result.body).toContain("No internet");
    expect(result.body).not.toMatch(/https?:\/\/|\/tickets\//);
  });

  test("builds a plain-text service restoration notification without links", () => {
    const result = buildNotification("service.restored", {
      ticketTitle: "Exchange Online",
      ticketId: "",
    });
    expect(result.subject).toBe("✅ Exchange Online is back");
    expect(result.body).toBe(
      "Exchange Online is back to normal. The service incident has cleared."
    );
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
    expect(result.subject).toBe("🚨 Response SLA overdue: “No internet”");
    expect(result.body).toContain("No internet");
  });

  test("requester reply copy names the support team", () => {
    const result = buildNotification("reply.public", {
      ...base,
      publicReplyExcerpt: "Try restarting the router",
    });
    expect(result.subject).toBe("💬 New reply on “No internet”");
    expect(result.body).toBe(
      "Your support team replied on “No internet”:\n\n> Try restarting the router"
    );
  });

  test("staff copy says the requester replied", () => {
    const result = buildNotification("reply.public", {
      ...base,
      audience: "staff",
      actorRole: "requester",
      publicReplyExcerpt: "Still broken",
    });
    expect(result.body).toContain("The requester replied on “No internet”");
    expect(result.body).not.toContain("Your support team");
  });

  test("staff copy for a teammate reply names the teammate", () => {
    const result = buildNotification("reply.public", {
      ...base,
      audience: "staff",
      actorRole: "staff",
      actorLabel: "Alex",
      publicReplyExcerpt: "On it",
    });
    expect(result.body).toContain("Alex replied to the requester");
  });

  test("shortens long titles in subjects only", () => {
    const title = "x".repeat(100);
    const result = buildNotification("ticket.resolved", {
      ticketTitle: title,
      ticketId: "t1",
    });
    expect(result.subject.length).toBeLessThan(80);
    expect(result.subject.startsWith("✅ Resolved:")).toBe(true);
    expect(result.body).toContain(title);
  });

  test("keeps the status on its own paragraph", () => {
    const result = buildNotification("ticket.handoff", {
      ...base,
      status: "Needs Human",
    });
    expect(result.body).toMatch(/\n\nCurrent status: Needs Human\.$/);
  });
});
