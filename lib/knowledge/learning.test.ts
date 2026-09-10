import { afterEach, describe, expect, test, vi } from "vitest";
import {
  buildKnowledgeDraft,
  createKnowledgeDraftForTicket,
  reviewKnowledgeDraft,
} from "./learning";

const { learningEnabled, createAdminClient } = vi.hoisted(() => ({
  learningEnabled: vi.fn(),
  createAdminClient: vi.fn(),
}));

vi.mock("@/lib/admin/flags", () => ({
  isKnowledgeLearningEnabled: learningEnabled,
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient }));

const report = {
  rootCause: "The network adapter was disabled.",
  actionsPerformed:
    "1. Enabled the adapter.\n2. Tested a website; connection restored.\n3. Confirmed the network icon.",
  toolsUsed: "Windows network settings",
  preventiveRecommendation:
    "Check the network icon before restarting the router.",
};

function inputs(overrides: Record<string, unknown> = {}) {
  return {
    ticket: {
      id: "ticket-1",
      message: "Web pages will not load",
      issue_id: "no-internet",
      issue_title: "No internet connection",
      platform: "Windows",
      ai_recommended_issue_id: null,
      diagnostic_answers: [
        { questionId: "where-happens", answer: "Web pages will not load" },
        {
          questionId: "error-message",
          answer: "Contact me at user@example.com",
        },
      ],
      resolution_report: report,
      verification_method: "user_confirmed",
      verification_exception: false,
    },
    stepOutcomes: [
      { guide_slug: "no-internet", step_index: 2, outcome: "failed" },
      {
        guide_slug: "no-internet",
        step_index: 1,
        outcome: "could_not_perform",
      },
      { guide_slug: "no-internet", step_index: 2, outcome: "failed" },
    ],
    approvedSlugs: ["no-internet"],
    ...overrides,
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("buildKnowledgeDraft", () => {
  test("builds a guide update with scrubbed symptoms and failed steps", () => {
    const draft = buildKnowledgeDraft(inputs());
    expect(draft).toMatchObject({
      kind: "guide_update",
      relatedSlug: "no-internet",
      confirmation: "user_confirmed",
      content: {
        symptoms: ["Web pages will not load", "Contact me at [email removed]"],
        resolutionSteps: [
          "Enabled the adapter.",
          "Tested a website",
          "connection restored.",
          "Confirmed the network icon.",
        ],
        attemptedGuide: {
          slug: "no-internet",
          failedSteps: [1, 2],
        },
      },
    });
  });

  test("uses the AI issue when the ticket issue is not approved", () => {
    const draft = buildKnowledgeDraft(
      inputs({
        ticket: {
          ...inputs().ticket,
          issue_id: "unknown",
          ai_recommended_issue_id: "no-internet",
        },
      })
    );
    expect(draft?.relatedSlug).toBe("no-internet");
  });

  test("creates a new guide draft when no catalog slug matches", () => {
    const draft = buildKnowledgeDraft(
      inputs({
        ticket: {
          ...inputs().ticket,
          issue_id: "unknown",
          ai_recommended_issue_id: "also-unknown",
        },
        approvedSlugs: [],
      })
    );
    expect(draft?.kind).toBe("new_guide");
    expect(draft?.relatedSlug).toBeNull();
    expect(draft?.title).toBe("New guide: The network adapter was disabled");
    expect(draft?.content.attemptedGuide).toBeNull();
  });

  test("caps and deduplicates symptoms and steps", () => {
    const draft = buildKnowledgeDraft(
      inputs({
        ticket: {
          ...inputs().ticket,
          message: "same",
          diagnostic_answers: Array.from({ length: 8 }, (_, index) => ({
            questionId: String(index),
            answer: index < 3 ? "same" : `symptom ${index}`,
          })),
          resolution_report: {
            ...report,
            actionsPerformed: Array.from(
              { length: 12 },
              (_, index) => `${index + 1}. Step ${index + 1}`
            ).join("\n"),
          },
        },
      })
    );
    expect(draft?.content.symptoms).toHaveLength(6);
    expect(draft?.content.resolutionSteps).toHaveLength(10);
  });

  test("maps verification exceptions and rejects invalid reports", () => {
    const exception = buildKnowledgeDraft(
      inputs({
        ticket: {
          ...inputs().ticket,
          verification_method: "remote_test",
          verification_exception: true,
        },
      })
    );
    expect(exception?.confirmation).toBe("verification_exception");
    expect(
      buildKnowledgeDraft(
        inputs({ ticket: { ...inputs().ticket, resolution_report: null } })
      )
    ).toBeNull();
  });
});

describe("knowledge draft persistence", () => {
  test("does nothing when the flag is off or the ticket is not resolved", async () => {
    const admin = { from: vi.fn() };
    learningEnabled.mockReturnValue(false);
    await createKnowledgeDraftForTicket(admin as never, "ticket-1", "org-1");
    expect(admin.from).not.toHaveBeenCalled();

    learningEnabled.mockReturnValue(true);
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      maybeSingle: vi.fn(async () => ({
        data: { status: "In Progress" },
        error: null,
      })),
    };
    admin.from.mockReturnValue(query);
    await createKnowledgeDraftForTicket(admin as never, "ticket-1", "org-1");
    expect(admin.from).toHaveBeenCalledWith("tickets");
  });

  test("upserts resolved drafts without overwriting reviewed rows", async () => {
    learningEnabled.mockReturnValue(true);
    const ticketQuery = {
      select: vi.fn(() => ticketQuery),
      eq: vi.fn(() => ticketQuery),
      maybeSingle: vi.fn(async () => ({
        data: { ...inputs().ticket, status: "Resolved" },
        error: null,
      })),
    };
    const outcomesQuery = {
      select: vi.fn(() => outcomesQuery),
      eq: vi.fn(() => outcomesQuery),
      then: (resolve: (value: unknown) => unknown) =>
        resolve({ data: inputs().stepOutcomes, error: null }),
    };
    const upsert = vi.fn(async () => ({ error: null }));
    const admin = {
      from: vi.fn((table: string) =>
        table === "tickets"
          ? ticketQuery
          : table === "ticket_step_outcomes"
            ? outcomesQuery
            : { upsert }
      ),
    };
    await createKnowledgeDraftForTicket(admin as never, "ticket-1", "org-1");
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ ticket_id: "ticket-1" }),
      { onConflict: "ticket_id", ignoreDuplicates: true }
    );
  });

  test("approving a new guide creates a draft guide and links it", async () => {
    learningEnabled.mockReturnValue(true);
    const draftRow = {
      id: "11111111-1111-4111-8111-111111111111",
      organization_id: "org-1",
      ticket_id: "ticket-1",
      kind: "new_guide",
      related_slug: null,
      title: "New guide: Network adapter",
      content: {
        symptoms: [],
        rootCause: "Network issue",
        resolutionSteps: [],
        preventive: null,
        toolsUsed: null,
        platform: "Windows",
        attemptedGuide: null,
      },
      confirmation: "verification_exception",
      status: "draft",
      review_note: null,
      reviewed_by: null,
      reviewed_at: null,
      created_guide_id: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };
    const draftQuery = {
      select: vi.fn(() => draftQuery),
      eq: vi.fn(() => draftQuery),
      maybeSingle: vi.fn(async () => ({ data: draftRow, error: null })),
      update: vi.fn(() => draftQuery),
    };
    const guideQuery = {
      insert: vi.fn(() => guideQuery),
      select: vi.fn(() => guideQuery),
      single: vi.fn(async () => ({ data: { id: "guide-1" }, error: null })),
    };
    const admin = {
      from: vi.fn((table: string) =>
        table === "knowledge_drafts" ? draftQuery : guideQuery
      ),
    };
    createAdminClient.mockReturnValue(admin);
    await expect(
      reviewKnowledgeDraft({
        draftId: draftRow.id,
        organizationId: "org-1",
        actorId: "user-1",
        status: "approved",
      })
    ).resolves.toEqual({ success: true });
    expect(guideQuery.insert).toHaveBeenCalledWith(
      expect.objectContaining({ status: "draft", risk_tier: "low" })
    );
    expect(draftQuery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "approved",
        created_guide_id: "guide-1",
      })
    );
  });

  test("does not create a guide for updates and rejects reviewed drafts", async () => {
    learningEnabled.mockReturnValue(true);
    const updateRow = {
      id: "11111111-1111-4111-8111-111111111111",
      organization_id: "org-1",
      ticket_id: "ticket-1",
      kind: "guide_update",
      related_slug: "no-internet",
      title: "Update: No internet connection",
      content: {
        symptoms: [],
        rootCause: "Network issue",
        resolutionSteps: [],
        preventive: null,
        toolsUsed: null,
        platform: null,
        attemptedGuide: null,
      },
      confirmation: "user_confirmed",
      status: "draft",
      review_note: null,
      reviewed_by: null,
      reviewed_at: null,
      created_guide_id: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      maybeSingle: vi.fn(async () => ({ data: updateRow, error: null })),
      update: vi.fn(() => query),
    };
    const guideQuery = { insert: vi.fn() };
    const admin = {
      from: vi.fn((table: string) =>
        table === "knowledge_drafts" ? query : guideQuery
      ),
    };
    createAdminClient.mockReturnValue(admin);
    await expect(
      reviewKnowledgeDraft({
        draftId: "11111111-1111-4111-8111-111111111111",
        organizationId: "org-1",
        actorId: "user-1",
        status: "approved",
      })
    ).resolves.toEqual({ success: true });
    expect(guideQuery.insert).not.toHaveBeenCalled();

    query.maybeSingle.mockResolvedValue({ data: null, error: null } as never);
    await expect(
      reviewKnowledgeDraft({
        draftId: updateRow.id,
        organizationId: "org-1",
        actorId: "user-1",
        status: "rejected",
      })
    ).resolves.toEqual({ error: "Draft not found or already reviewed." });
  });
});
