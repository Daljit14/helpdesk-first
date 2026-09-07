import { describe, expect, test } from "vitest";
import {
  describeTicketAssignment,
  describeTicketStatus,
  ticketReference,
} from "./user-status";

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
    ["Reopened", "Reopened", "open", false],
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

test("describes requester assignment and response timing without agent identity", () => {
  expect(
    describeTicketAssignment({
      assignedAgentId: "agent-1",
      humanResponseDueAt: "2025-01-01T12:00:00.000Z",
      status: "Needs Human",
      updatedAt: "2025-01-01T11:00:00.000Z",
    })
  ).toEqual({
    label: "Assigned to a support person",
    expectedResponseBy: expect.stringContaining("Expected next response by"),
    lastUpdated: expect.stringContaining("Last updated"),
  });
});

test("explains that support marked the ticket resolved", () => {
  expect(describeTicketStatus("Resolved").description).toBe(
    "Marked resolved by support — tell us if it isn't fixed"
  );
});
