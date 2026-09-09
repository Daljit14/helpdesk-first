import { beforeEach, describe, expect, test, vi } from "vitest";
import { ISSUES } from "@/lib/issues";
import { runInvestigationTurn } from "./engine";

function provider() {
  return {
    classify: vi.fn(async () => ({
      decision: "match" as const,
      matchedIssueSlug: "slow-computer",
      confidence: 0.8,
      detectedPlatform: "Windows" as const,
      explanation: "A guide matches.",
    })),
  };
}

function database() {
  const rows: Record<string, unknown>[] = [];
  const chain = {
    upsert: vi.fn((row: Record<string, unknown>) => {
      rows.push(row);
      return chain;
    }),
    insert: vi.fn((row: Record<string, unknown>) => {
      rows.push(row);
      return chain;
    }),
    select: vi.fn(() => chain),
    single: vi.fn(async () => ({ data: { id: 1 }, error: null })),
  };
  return {
    client: { from: vi.fn(() => chain) },
    rows,
  };
}

describe("runInvestigationTurn", () => {
  beforeEach(() => {
    vi.stubEnv("HELP_DESK_AI_ENABLED", "true");
    vi.stubEnv("HELP_DESK_AI_PROVIDER", "mock");
  });

  test("derives next steps without failed steps", async () => {
    const result = await runInvestigationTurn({
      input: { message: "slow computer", platform: "Windows" },
      provider: provider(),
      allowedSlugs: ["slow-computer"],
      persist: false,
    });
    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(
        result.output.nextSteps?.every((step) => step.stepIndex >= 0)
      ).toBe(true);
    }
  });

  test("does not persist when persistence is disabled", async () => {
    const db = database();
    const result = await runInvestigationTurn({
      input: { message: "slow computer", platform: "Windows" },
      provider: provider(),
      allowedSlugs: ["slow-computer"],
      ticketId: "ticket-id",
      organizationId: "org-id",
      userId: "user-id",
      persist: false,
      admin: db.client as never,
    });
    expect(result.status).toBe("success");
    expect(db.rows).toHaveLength(0);
  });

  test("escalates when every approved step failed", async () => {
    const issue = ISSUES.find((candidate) => candidate.id === "slow-computer")!;
    const { getIssueSteps } = await import("@/lib/steps");
    const result = await runInvestigationTurn({
      input: {
        message: "slow computer",
        platform: "Windows",
        failedSteps: getIssueSteps(issue).map((_, stepIndex) => ({
          guideSlug: issue.id,
          stepIndex,
        })),
      },
      provider: provider(),
      allowedSlugs: ["slow-computer"],
      persist: false,
    });
    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.output.decision).toBe("escalate");
      expect(result.output.escalationReason).toContain("already tried");
    }
  });

  test("persists one investigation and one turn without message text", async () => {
    const db = database();
    const result = await runInvestigationTurn({
      input: { message: "slow computer", platform: "Windows" },
      provider: provider(),
      allowedSlugs: ["slow-computer"],
      ticketId: "ticket-id",
      organizationId: "org-id",
      userId: "user-id",
      persist: true,
      admin: db.client as never,
    });
    expect(result.status).toBe("success");
    expect(db.rows).toHaveLength(2);
    expect(db.rows.every((row) => !("message" in row))).toBe(true);
  });

  test("does not throw when persistence fails", async () => {
    const error = new Error("database unavailable");
    const admin = {
      from: vi.fn(() => ({
        upsert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(async () => ({ data: null, error })),
          })),
        })),
      })),
    };
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(
      runInvestigationTurn({
        input: { message: "slow computer", platform: "Windows" },
        provider: provider(),
        allowedSlugs: ["slow-computer"],
        ticketId: "ticket-id",
        userId: "user-id",
        persist: true,
        admin: admin as never,
      })
    ).resolves.toMatchObject({ status: "success" });
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});
