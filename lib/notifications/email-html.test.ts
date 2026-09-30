import { describe, expect, test } from "vitest";
import {
  escapeHtml,
  parseNotificationBody,
  renderNotificationEmail,
  safeHttpUrl,
  shortTicketRef,
} from "./email-html";
import { buildNotification } from "./templates";

const site = "https://help.example.com";

describe("renderNotificationEmail", () => {
  test("escapes user-provided text everywhere", () => {
    const evil = `<script>alert("x")</script>`;
    const { subject, body } = buildNotification("reply.public", {
      ticketTitle: evil,
      ticketId: "t1",
      publicReplyExcerpt: `<img src=x onerror=alert(1)> & "hi"`,
    });
    const { html } = renderNotificationEmail({
      eventType: "reply.public",
      audience: "requester",
      subject,
      body,
      url: `${site}/tickets/t1`,
      siteUrl: site,
      recipientFirstName: "<b>Eve</b>",
      ticket: { id: "t1", title: evil, status: `<i>Open</i>` },
    });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<b>Eve</b>");
    expect(html).not.toContain("<i>Open</i>");
    expect(html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
    expect(html).toContain("&amp; &quot;hi&quot;");
  });

  test("requester reply links to the portal ticket with requester copy", () => {
    const { subject, body } = buildNotification("reply.public", {
      ticketTitle: "Wi-Fi keeps dropping",
      ticketId: "abc-123",
      actorLabel: "Jordan",
      publicReplyExcerpt: "Please restart your router.",
    });
    const { html, text } = renderNotificationEmail({
      eventType: "reply.public",
      audience: "requester",
      subject,
      body,
      url: `${site}/tickets/abc-123`,
      siteUrl: site,
      recipientFirstName: "Dana",
      ticket: {
        id: "abc-123",
        title: "Wi-Fi keeps dropping",
        status: "In Progress",
      },
    });
    expect(html).toContain(`href="${site}/tickets/abc-123"`);
    expect(html).toContain("View your ticket");
    expect(html).not.toContain("Open in admin");
    expect(html).toContain("Hi Dana,");
    expect(html).toContain("Jordan");
    expect(html).toContain("Please restart your router.");
    expect(html).toContain("In Progress");
    expect(html).toContain("#ABC123");
    expect(html).toContain("Reply on the ticket page");
    expect(html).toContain(`href="${site}/tickets"`);
    expect(text).toContain("Hi Dana,");
    expect(text).toContain(`View your ticket: ${site}/tickets/abc-123`);
    expect(text).toContain("> Please restart your router.");
    expect(text).not.toContain("<");
  });

  test("staff reply says the requester replied and opens admin", () => {
    const { subject, body } = buildNotification("reply.public", {
      ticketTitle: "Printer jam",
      ticketId: "t9",
      audience: "staff",
      actorRole: "requester",
      publicReplyExcerpt: "Still jammed",
    });
    const { html, text } = renderNotificationEmail({
      eventType: "reply.public",
      audience: "staff",
      subject,
      body,
      url: `${site}/admin/tickets/t9`,
      siteUrl: site,
      ticket: { id: "t9", title: "Printer jam" },
    });
    expect(html).toContain("The requester replied on");
    expect(html).toContain("Requester");
    expect(html).not.toContain("Your support team replied");
    expect(html).toContain("Open in admin");
    expect(html).toContain(`href="${site}/admin/tickets/t9"`);
    expect(html).toContain("Hi there,");
    expect(text).toContain(`Open in admin: ${site}/admin/tickets/t9`);
  });

  test("falls back to audience-specific ticket links and ignores unsafe urls", () => {
    const base = {
      eventType: "sla.resolution_overdue",
      subject: "s",
      body: "b",
      url: "javascript:alert(1)",
      siteUrl: site,
      ticket: { id: "t2" },
    };
    expect(
      renderNotificationEmail({ ...base, audience: "staff" }).html
    ).toContain(`href="${site}/admin/tickets/t2"`);
    const requester = renderNotificationEmail({
      ...base,
      eventType: "ticket.resolved",
      audience: "requester",
    });
    expect(requester.html).toContain(`href="${site}/tickets/t2"`);
    expect(requester.html).not.toContain("javascript:");
    expect(requester.html).toContain("Reopen the ticket within 14 days");
  });

  test("uses the status paragraph when the ticket status is unknown", () => {
    const { html } = renderNotificationEmail({
      eventType: "ticket.handoff",
      audience: "requester",
      subject: "s",
      body: "Lead line.\n\nCurrent status: Needs Human.",
      siteUrl: site,
      ticket: { id: "t3" },
    });
    expect(html).toContain("Needs Human");
    expect(html).not.toContain("Current status:");
  });

  test("includes a preheader, tailored tips and a verification CTA", () => {
    const { html } = renderNotificationEmail({
      eventType: "verification.requested",
      audience: "requester",
      subject: "s",
      body: "We think “VPN” is fixed. Please confirm it works for you.",
      siteUrl: site,
      ticket: { id: "t4", title: "VPN" },
    });
    expect(html).toContain("display:none");
    expect(html).toContain("Confirm the fix");
    expect(html).toContain("Confirm it works, or tell us it doesn");
    expect(html).toContain("max-width:600px");
  });
});

describe("helpers", () => {
  test("escapeHtml", () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;"
    );
  });

  test("safeHttpUrl", () => {
    expect(safeHttpUrl("https://a.example/x")).toBe("https://a.example/x");
    expect(safeHttpUrl("javascript:alert(1)")).toBeNull();
    expect(safeHttpUrl("not a url")).toBeNull();
  });

  test("shortTicketRef", () => {
    expect(shortTicketRef("3f2a9c10-aaaa-bbbb")).toBe("#3F2A9C10");
  });

  test("parseNotificationBody splits lead, quote and status", () => {
    const parsed = parseNotificationBody(
      "Sam replied on “X”:\n\n> line one\n> line two\n\nCurrent status: Open."
    );
    expect(parsed.lead).toBe("Sam replied on “X”.");
    expect(parsed.quote).toBe("line one\nline two");
    expect(parsed.quoteAuthor).toBe("Sam");
    expect(parsed.status).toBe("Open");
  });
});
