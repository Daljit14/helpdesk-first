import type { createAdminClient } from "@/lib/supabase/admin";
import { afterEach, describe, expect, test, vi } from "vitest";
import { recordAnswerFeedback } from "./feedback";

const mocked = vi.hoisted(() => ({
  enqueueLearningEvent: vi.fn(),
}));

vi.mock("@/lib/knowledge/learning", () => ({
  enqueueLearningEvent: mocked.enqueueLearningEvent,
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

function feedbackAdmin(error: { code?: string } | null = null) {
  const insert = vi.fn(async () => ({ error }));
  const admin = {
    from: vi.fn(() => ({ insert })),
  };
  return {
    admin: admin as unknown as ReturnType<typeof createAdminClient>,
    insert,
    from: admin.from,
  };
}

describe("answer feedback", () => {
  test("treats duplicate run feedback as success without learning enqueue", async () => {
    const { admin, insert } = feedbackAdmin({ code: "23505" });
    const result = await recordAnswerFeedback(admin, {
      runId: "run-1",
      organizationId: "org-1",
      outcome: "fixed",
      ticketId: "ticket-1",
    });
    expect(result).toEqual({ ok: true, duplicate: true });
    expect(insert).toHaveBeenCalledWith({
      run_id: "run-1",
      organization_id: "org-1",
      outcome: "fixed",
    });
    expect(mocked.enqueueLearningEvent).not.toHaveBeenCalled();
  });

  test("enqueues only fixed feedback when learning is enabled and ticket/org exist", async () => {
    vi.stubEnv("HELP_DESK_KNOWLEDGE_LEARNING_ENABLED", "true");
    const { admin } = feedbackAdmin();
    expect(
      await recordAnswerFeedback(admin, {
        runId: "run-1",
        organizationId: "org-1",
        outcome: "fixed",
        ticketId: "ticket-1",
      })
    ).toEqual({ ok: true });
    expect(mocked.enqueueLearningEvent).toHaveBeenCalledWith(
      admin,
      "ticket-1",
      "org-1"
    );
  });

  test("does not enqueue when disabled or when feedback is not fixed", async () => {
    vi.stubEnv("HELP_DESK_KNOWLEDGE_LEARNING_ENABLED", "false");
    const { admin } = feedbackAdmin();
    await recordAnswerFeedback(admin, {
      runId: "run-0",
      organizationId: "org-1",
      outcome: "fixed",
      ticketId: "ticket-0",
    });
    await recordAnswerFeedback(admin, {
      runId: "run-1",
      organizationId: "org-1",
      outcome: "helpful",
      ticketId: "ticket-1",
    });
    vi.stubEnv("HELP_DESK_KNOWLEDGE_LEARNING_ENABLED", "true");
    await recordAnswerFeedback(admin, {
      runId: "run-2",
      organizationId: null,
      outcome: "fixed",
      ticketId: "ticket-1",
    });
    await recordAnswerFeedback(admin, {
      runId: "run-3",
      organizationId: "org-1",
      outcome: "fixed",
      ticketId: null,
    });
    expect(mocked.enqueueLearningEvent).not.toHaveBeenCalled();
  });

  test("reports non-duplicate insert failures without throwing", async () => {
    const { admin } = feedbackAdmin({ code: "XX000" });
    await expect(
      recordAnswerFeedback(admin, {
        runId: "run-1",
        organizationId: "org-1",
        outcome: "not_helpful",
        ticketId: null,
      })
    ).resolves.toEqual({ ok: false });
  });
});
