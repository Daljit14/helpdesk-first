import { describe, expect, test } from "vitest";
import { describeTicketStatus, ticketReference } from "./user-status";

describe("describeTicketStatus", () => {
  test.each([
    ["New", "Reviewing", "open", false],
    ["Open", "Reviewing", "open", false],
    ["AI Reviewing", "Reviewing", "open", false],
    ["AI Resolving", "Suggested fix ready", "open", true],
    ["Needs Human", "Waiting for a support person", "open", false],
    ["In Progress", "A person is working on it", "open", false],
    ["Waiting", "Your reply is needed", "open", true],
    ["Waiting for User", "Your reply is needed", "open", true],
    ["Pending Verification", "Please confirm", "open", true],
    ["Resolved", "Resolved", "previous", false],
    ["Closed", "Closed", "previous", false],
  ])(
    "%s maps to the requester presentation",
    (status, label, group, attention) => {
      const result = describeTicketStatus(status);
      expect(result.label).toBe(label);
      expect(result.group).toBe(group);
      expect(result.attention).toBe(attention);
    }
  );

  test("preserves unknown statuses", () => {
    expect(describeTicketStatus("Custom").label).toBe("Custom");
  });

  test("matches statuses case-insensitively", () => {
    expect(describeTicketStatus("aI rEsoLvInG").attention).toBe(true);
    expect(describeTicketStatus("CLOSED").group).toBe("previous");
  });
});

test("ticketReference uses the operations ticket format", () => {
  expect(ticketReference("ab-cd-1234-5678")).toBe("TCK-ABCD1234");
});
