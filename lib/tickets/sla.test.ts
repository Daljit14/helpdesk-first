import { describe, expect, it } from "vitest";
import {
  DEFAULT_SLA_TARGETS,
  formatSlaCountdown,
  humanResponseDue,
  resolutionDue,
  slaState,
} from "./sla";

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

  it("uses the default first-response target for low priority", () => {
    expect(
      humanResponseDue("Low", new Date("2025-01-10T08:00:00Z")).toISOString()
    ).toBe("2025-01-10T16:00:00.000Z");
    expect(
      humanResponseDue("Low", new Date("2025-01-10T12:00:00Z")).toISOString()
    ).toBe("2025-01-10T20:00:00.000Z");
  });

  it("calculates resolution due times from the same anchor", () => {
    const from = new Date("2025-01-06T10:00:00Z");
    expect(resolutionDue("Urgent", from).toISOString()).toBe(
      "2025-01-06T14:00:00.000Z"
    );
    expect(resolutionDue("High", from).toISOString()).toBe(
      "2025-01-06T18:00:00.000Z"
    );
    expect(resolutionDue("Normal", from).toISOString()).toBe(
      "2025-01-07T10:00:00.000Z"
    );
  });

  it("reads custom SLA targets", () => {
    const targets = {
      first_response: { Urgent: 1, High: 2, Normal: 3, Low: 4 },
      resolution: { Urgent: 10, High: 20, Normal: 30, Low: 40 },
    };
    const from = new Date("2025-01-06T10:00:00Z");
    expect(humanResponseDue("Normal", from, targets).toISOString()).toBe(
      "2025-01-06T10:03:00.000Z"
    );
    expect(resolutionDue("Normal", from, targets).toISOString()).toBe(
      "2025-01-06T10:30:00.000Z"
    );
  });

  it("exposes default target constants", () => {
    expect(DEFAULT_SLA_TARGETS.first_response.Urgent).toBe(5);
    expect(DEFAULT_SLA_TARGETS.resolution.Low).toBe(4320);
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
