import { describe, expect, test } from "vitest";
import { buildHandoff } from "./handoff";
import { fleschKincaidGrade } from "./reply-quality";

describe("buildHandoff", () => {
  test("keeps three to five readable staff lines and redacts sensitive values", () => {
    const result = buildHandoff(
      {
        reason: "low_confidence",
        problem: "Printer is offline for support@example.com",
        checked: ["DNS at 192.168.1.22 is responding."],
        tried: ["Restart the printer."],
        answers: ["It failed after the restart."],
      },
      {
        requesterIdentifiers: ["alice@example.com"],
        redactions: [],
      }
    );

    expect(result.staffLines.length).toBeGreaterThanOrEqual(3);
    expect(result.staffLines.length).toBeLessThanOrEqual(5);
    expect(result.staffLines.every((line) => line.length <= 200)).toBe(true);
    expect(result.staffLines.join("\n")).not.toContain("support@example.com");
    expect(result.staffLines.join("\n")).not.toContain("192.168.1.22");
    expect(result.staffLines[0]).toContain("[removed:");
  });

  test("uses the requester-facing handoff template and check count", () => {
    const result = buildHandoff(
      {
        reason: "user_requested_human",
        problem: "The printer is offline.",
        checked: ["The service is available.", "The queue is reachable."],
        tried: [],
        answers: [],
      },
      { requesterIdentifiers: [], redactions: [] }
    );

    expect(result.userLine).toBe(
      "Here's what I passed on: \"The printer is offline.\", and the 2 checks I ran. A support person will pick this up, and you won't need to repeat yourself."
    );
    expect(fleschKincaidGrade(result.userLine)).toBeLessThanOrEqual(8);
  });
});
