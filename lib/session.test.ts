import { describe, expect, test, beforeEach } from "vitest";
import {
  clearAllSessions,
  clearSession,
  getActiveSessions,
  getAllSessions,
  getSession,
  saveSession,
  type TroubleshootingSession,
} from "./session";

describe("session management", () => {
  beforeEach(() => {
    clearAllSessions();
  });

  const sample: TroubleshootingSession = {
    issueSlug: "slow-computer",
    issueTitle: "Slow computer",
    platform: "Windows",
    currentStepIndex: 1,
    attemptedSteps: [{ step: "Restart the computer", outcome: "completed" }],
    status: "in-progress",
    updatedAt: Date.now(),
  };

  test("saves and retrieves a session", () => {
    saveSession(sample);
    expect(getSession("slow-computer", "Windows")).toEqual(sample);
  });

  test("clears a single session", () => {
    saveSession(sample);
    clearSession("slow-computer", "Windows");
    expect(getSession("slow-computer", "Windows")).toBeUndefined();
  });

  test("clears all sessions", () => {
    saveSession(sample);
    clearAllSessions();
    expect(getAllSessions()).toHaveLength(0);
  });

  test("lists only active sessions", () => {
    saveSession(sample);
    saveSession({ ...sample, issueSlug: "no-sound", status: "resolved" });
    expect(getActiveSessions()).toHaveLength(1);
    expect(getActiveSessions()[0].issueSlug).toBe("slow-computer");
  });

  test("orders all sessions by updatedAt descending", () => {
    const older: TroubleshootingSession = {
      ...sample,
      issueSlug: "older",
      updatedAt: 1000,
    };
    const newer: TroubleshootingSession = {
      ...sample,
      issueSlug: "newer",
      updatedAt: 2000,
    };
    saveSession(older);
    saveSession(newer);
    const sessions = getAllSessions();
    expect(sessions[0].issueSlug).toBe("newer");
    expect(sessions[1].issueSlug).toBe("older");
  });
});
