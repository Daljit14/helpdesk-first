import { beforeEach, describe, expect, test, vi } from "vitest";
import { ISSUES } from "@/lib/issues";
import { fallbackHypothesis, runInvestigationTurn } from "./engine";

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

function providerFor(issueSlug: string) {
  return {
    classify: vi.fn(async () => ({
      decision: "match" as const,
      matchedIssueSlug: issueSlug,
      confidence: 0.8,
      detectedPlatform: "Windows" as const,
      explanation: "A guide matches.",
    })),
  };
}

function providerWithHypothesis(issueSlug: string) {
  return {
    classify: vi.fn(async () => ({
      decision: "match" as const,
      matchedIssueSlug: issueSlug,
      confidence: 0.8,
      detectedPlatform: "Windows" as const,
      explanation: "A guide matches.",
      hypotheses: [
        {
          cause: "Provider cause",
          confidence: 0.7,
          evidence: ["The user's wording"],
          guideSlug: issueSlug,
        },
      ],
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

  test("persists a catalog-grounded fallback hypothesis when the provider returns none", async () => {
    const db = database();
    const issue = ISSUES.find((candidate) => candidate.id === "no-internet")!;
    const result = await runInvestigationTurn({
      input: {
        message: "Web pages will not load",
        platform: "Windows",
      },
      provider: providerFor(issue.id),
      allowedSlugs: [issue.id],
      ticketId: "ticket-id",
      organizationId: "org-id",
      userId: "user-id",
      persist: true,
      admin: db.client as never,
    });

    expect(result.status).toBe("success");
    expect(db.rows[0]?.hypotheses).toEqual([
      {
        cause: issue.title,
        confidence: 0.8,
        evidence: ["Web pages will not load"],
        guideSlug: issue.id,
      },
    ]);
    expect(db.rows[1]?.hypotheses).toEqual(db.rows[0]?.hypotheses);
  });

  test("uses a truthful fallback evidence string when no symptom matches", async () => {
    const issue = ISSUES.find((candidate) => candidate.id === "no-internet")!;
    const result = await runInvestigationTurn({
      input: { message: "The connection is unavailable", platform: "Windows" },
      provider: providerFor(issue.id),
      allowedSlugs: [issue.id],
      persist: false,
    });

    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.output.hypotheses).toEqual([
        {
          cause: issue.title,
          confidence: 0.8,
          evidence: [`Assistant matched approved guide "${issue.title}"`],
          guideSlug: issue.id,
        },
      ]);
    }
  });

  test("preserves provider hypotheses without appending a fallback", async () => {
    const result = await runInvestigationTurn({
      input: { message: "slow computer", platform: "Windows" },
      provider: providerWithHypothesis("slow-computer"),
      allowedSlugs: ["slow-computer"],
      persist: false,
    });

    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.output.hypotheses).toHaveLength(1);
      expect(result.output.hypotheses?.[0]?.cause).toBe("Provider cause");
    }
  });

  test("clamps fallback hypothesis confidence", () => {
    const issue = ISSUES.find((candidate) => candidate.id === "no-internet")!;
    const input = { message: "No internet" };
    expect(fallbackHypothesis(issue, input, 0.1).confidence).toBe(0.35);
    expect(fallbackHypothesis(issue, input, 1).confidence).toBe(0.95);
    expect(fallbackHypothesis(issue, input, undefined).confidence).toBe(0.5);
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
      expect(result.output.hypotheses).toHaveLength(1);
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
    expect(db.rows[1]).toHaveProperty("withheld_steps");
  });

  test("withholds approval steps for requesters and includes them for staff", async () => {
    const requester = await runInvestigationTurn({
      input: { message: "low storage", platform: "Windows" },
      provider: providerFor("low-storage"),
      allowedSlugs: ["low-storage"],
      persist: false,
    });
    const staff = await runInvestigationTurn({
      input: { message: "low storage", platform: "Windows" },
      provider: providerFor("low-storage"),
      allowedSlugs: ["low-storage"],
      audience: "staff",
      persist: false,
    });
    expect(requester.status).toBe("success");
    expect(staff.status).toBe("success");
    if (requester.status === "success" && staff.status === "success") {
      expect(
        requester.output.nextSteps?.some((step) => step.risk === "approval")
      ).toBe(false);
      expect(
        requester.output.withheldSteps?.some((step) => step.risk === "approval")
      ).toBe(true);
      expect(
        staff.output.nextSteps?.some((step) => step.risk === "approval")
      ).toBe(true);
    }
  });

  test("escalates with the approval-only reason when only withheld steps remain", async () => {
    const result = await runInvestigationTurn({
      input: {
        message: "low storage",
        platform: "Windows",
        failedSteps: [0, 1, 2, 4].map((stepIndex) => ({
          guideSlug: "low-storage",
          stepIndex,
        })),
      },
      provider: providerFor("low-storage"),
      allowedSlugs: ["low-storage"],
      persist: false,
    });
    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.output.decision).toBe("escalate");
      expect(result.output.escalationReason).toBe(
        "Remaining steps for this guide require IT approval."
      );
    }
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
