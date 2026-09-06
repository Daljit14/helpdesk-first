import { describe, expect, it } from "vitest";
import { getIssueBySlug } from "@/lib/search";
import {
  AI_CONFIDENCE_THRESHOLD,
  detectSafetyFlags,
  routeTicket,
} from "./routing";

const issue = getIssueBySlug("wifi-disconnecting") ?? null;

describe("ticket routing", () => {
  it("routes a confident approved low-risk match to AI", () => {
    expect(
      routeTicket({
        ai: { decision: "match", confidence: 0.9, matchedIssueSlug: issue?.id },
        issue,
        userRequestedHuman: false,
        failedAttempts: 0,
        questionCount: 0,
        safetyFlags: [],
      })
    ).toMatchObject({ resolver: "ai", confidence: 0.9 });
  });

  it("routes high risk, low confidence, and repeated failures to humans", () => {
    expect(
      routeTicket({
        ai: { decision: "match", confidence: 0.9 },
        issue: { ...issue!, risk: "High" },
        userRequestedHuman: false,
        failedAttempts: 0,
        questionCount: 0,
        safetyFlags: [],
      })
    ).toMatchObject({ resolver: "human", reason: "high_risk" });
    expect(
      routeTicket({
        ai: { decision: "match", confidence: AI_CONFIDENCE_THRESHOLD - 0.01 },
        issue,
        userRequestedHuman: false,
        failedAttempts: 0,
        questionCount: 0,
        safetyFlags: [],
      })
    ).toMatchObject({ resolver: "human", reason: "low_confidence" });
    expect(
      routeTicket({
        ai: { decision: "match", confidence: 0.9 },
        issue,
        userRequestedHuman: false,
        failedAttempts: 2,
        questionCount: 0,
        safetyFlags: [],
      })
    ).toMatchObject({ resolver: "human", reason: "repeated_failure" });
  });

  it("detects safety routing keywords", () => {
    expect(
      detectSafetyFlags("Please remote into my laptop and take control")
    ).toEqual(expect.arrayContaining(["remote-assistance-required"]));
    expect(
      detectSafetyFlags("I have a broken screen and liquid damage")
    ).toEqual(expect.arrayContaining(["hardware-repair"]));
  });
});
