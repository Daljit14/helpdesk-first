import { afterEach, describe, expect, test, vi } from "vitest";
import {
  buildAgentQueue,
  categoryLabel,
  normalizePlatform,
  normalizePriority,
  normalizeStatus,
  pseudonymizeUser,
  slaDue,
  toTicketId,
  type OperationsTicketLike,
} from "./transform";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("operations transforms", () => {
  test("pseudonymizes users and requires a secret", () => {
    expect(pseudonymizeUser("user-1", "secret")).toMatch(/^usr_[0-9a-f]{8}$/);
    expect(pseudonymizeUser("user-1", "secret")).toBe(
      pseudonymizeUser("user-1", "secret")
    );
    vi.stubEnv("OPERATIONS_PSEUDONYM_SALT", "");
    vi.stubEnv("OPERATIONS_EXPORT_KEY", "");
    expect(() => pseudonymizeUser("user-1")).toThrow();
  });

  test("formats ticket ids", () => {
    expect(toTicketId("ab-cd-1234-5678")).toBe("TCK-ABCD1234");
  });

  test("normalizes status, priority, and platform", () => {
    expect(normalizeStatus(" open ")).toBe("New");
    expect(normalizeStatus("CLOSED")).toBe("Closed");
    expect(normalizeStatus("in_progress")).toBe("In Progress");
    expect(normalizeStatus("In-Progress")).toBe("In Progress");
    expect(normalizeStatus("Waiting")).toBe("Waiting");
    expect(normalizeStatus("unknown")).toBe("New");
    expect(normalizePriority(" urgent ")).toBe("Urgent");
    expect(normalizePriority("HIGH")).toBe("High");
    expect(normalizePriority("unknown")).toBe("Normal");
    expect(normalizePlatform(" macos ")).toBe("macOS");
    expect(normalizePlatform("IOS")).toBe("iOS");
    expect(normalizePlatform("unknown")).toBe("Other");
  });

  test("calculates SLA deadlines", () => {
    const created = "2025-01-01T00:00:00.000Z";
    expect(slaDue(created, "Urgent")).toBe("2025-01-01T04:00:00.000Z");
    expect(slaDue(created, "High")).toBe("2025-01-01T08:00:00.000Z");
    expect(slaDue(created, "Normal")).toBe("2025-01-02T00:00:00.000Z");
    expect(slaDue(created, "Low")).toBe("2025-01-04T00:00:00.000Z");
  });

  test("gets issue category labels", () => {
    expect(categoryLabel("no-internet")).toBe("Internet & Wi-Fi");
    expect(categoryLabel("unknown")).toBe("Other");
  });

  test("builds queue counts and workload", () => {
    const now = new Date("2025-01-02T12:00:00.000Z");
    const tickets: OperationsTicketLike[] = [
      {
        createdAt: "2025-01-01T00:00:00.000Z",
        status: "In Progress",
        priority: "Urgent",
        assignedAgent: "Ada",
        slaDue: "2025-01-02T10:00:00.000Z",
        resolvedAt: null,
      },
      {
        createdAt: "2025-01-02T11:00:00.000Z",
        status: "Waiting",
        priority: "Normal",
        assignedAgent: "Ada",
        slaDue: "2025-01-03T11:00:00.000Z",
        resolvedAt: null,
      },
      {
        createdAt: "2025-01-02T01:00:00.000Z",
        status: "Resolved",
        priority: "Low",
        assignedAgent: "Ada",
        slaDue: "2025-01-05T01:00:00.000Z",
        resolvedAt: "2025-01-02T08:00:00.000Z",
      },
      {
        createdAt: "2025-01-02T01:00:00.000Z",
        status: "New",
        priority: "Normal",
        assignedAgent: "",
        slaDue: "2025-01-03T01:00:00.000Z",
        resolvedAt: null,
      },
    ];
    expect(buildAgentQueue(tickets, now)).toEqual([
      {
        agent: "Ada",
        assignedOpen: 2,
        urgentOpen: 1,
        slaBreached: 1,
        waiting: 1,
        resolvedToday: 1,
        averageOpenAgeMinutes: 1110,
        workload: "Attention",
      },
    ]);
  });

  test.each([
    [
      "Clear",
      [
        {
          createdAt: "2025-01-01T11:00:00.000Z",
          status: "Resolved" as const,
          priority: "Normal" as const,
          assignedAgent: "Ada",
          slaDue: "2025-01-02T11:00:00.000Z",
          resolvedAt: "2025-01-01T12:00:00.000Z",
        },
      ],
    ],
    [
      "Normal",
      [
        {
          createdAt: "2025-01-02T11:00:00.000Z",
          status: "New" as const,
          priority: "Normal" as const,
          assignedAgent: "Ada",
          slaDue: "2025-01-03T11:00:00.000Z",
          resolvedAt: null,
        },
      ],
    ],
    [
      "High",
      Array.from({ length: 5 }, () => ({
        createdAt: "2025-01-02T11:00:00.000Z",
        status: "New" as const,
        priority: "Normal" as const,
        assignedAgent: "Ada",
        slaDue: "2025-01-03T11:00:00.000Z",
        resolvedAt: null,
      })),
    ],
  ])("assigns %s workload", (workload, tickets) => {
    expect(
      buildAgentQueue(tickets, new Date("2025-01-02T12:00:00.000Z"))[0]
        ?.workload
    ).toBe(workload);
  });
});
