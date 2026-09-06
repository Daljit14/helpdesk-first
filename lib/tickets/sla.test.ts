import { describe, expect, it } from "vitest";
import { formatSlaCountdown, humanResponseDue, slaState } from "./sla";

describe("ticket SLA", () => {
  it("calculates urgent, high, and normal due times", () => {
    const from = new Date("2025-01-06T10:00:00Z");
    expect(humanResponseDue("Urgent", from).toISOString()).toBe(
      "2025-01-06T10:05:00.000Z"
    );
    expect(humanResponseDue("High", from).toISOString()).toBe(
      "2025-01-06T10:10:00.000Z"
    );
    expect(humanResponseDue("Normal", from).toISOString()).toBe(
      "2025-01-06T11:00:00.000Z"
    );
  });

  it("uses the next business day at 09:00 for low priority", () => {
    expect(
      humanResponseDue("Low", new Date("2025-01-10T08:00:00Z")).toISOString()
    ).toBe("2025-01-13T09:00:00.000Z");
    expect(
      humanResponseDue("Low", new Date("2025-01-10T12:00:00Z")).toISOString()
    ).toBe("2025-01-13T09:00:00.000Z");
  });

  it("classifies at-risk, breached, and met tickets", () => {
    const due = "2025-01-06T10:00:00Z";
    expect(
      slaState({ human_response_due_at: due }, new Date("2025-01-06T09:51:00Z"))
    ).toBe("at_risk");
    expect(
      slaState({ human_response_due_at: due }, new Date("2025-01-06T10:01:00Z"))
    ).toBe("breached");
    expect(
      slaState(
        {
          human_response_due_at: due,
          first_human_response_at: "2025-01-06T09:59:00Z",
        },
        new Date("2025-01-06T10:01:00Z")
      )
    ).toBe("met");
  });

  it("formats SLA countdowns", () => {
    const now = new Date("2025-01-06T09:00:00Z");
    expect(formatSlaCountdown("2025-01-06T09:12:00Z", now)).toBe("12m left");
    expect(formatSlaCountdown("2025-01-06T10:05:00Z", now)).toBe("1h 5m left");
    expect(formatSlaCountdown("2025-01-08T12:00:00Z", now)).toBe("2d 3h left");
    expect(formatSlaCountdown("2025-01-05T23:59:00Z", now)).toBe(
      "overdue by 9h 1m"
    );
    expect(formatSlaCountdown(null, now)).toBeNull();
  });
});
