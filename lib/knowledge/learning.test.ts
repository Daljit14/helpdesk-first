import { afterEach, describe, expect, test, vi } from "vitest";
import {
  buildKnowledgeDraft,
  buildLearnedArticleInput,
  createKnowledgeDraftForTicket,
  processLearningEvent,
  reviewKnowledgeDraft,
  type KnowledgeDraftInputs,
} from "./learning";
import type { LearnedArticleProvider } from "./learning-provider";

const { learningEnabled, createAdminClient, getProvider, generate } =
  vi.hoisted(() => ({
    learningEnabled: vi.fn(),
    createAdminClient: vi.fn(),
    getProvider: vi.fn(),
    generate: vi.fn(),
  }));

vi.mock("@/lib/admin/flags", () => ({
  isKnowledgeLearningEnabled: learningEnabled,
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient }));
vi.mock("@/lib/knowledge/learning-provider", () => ({
  getLearnedArticleProvider: getProvider,
}));

const report = {
  rootCause: "The network adapter was disabled.",
  actionsPerformed:
    "1. Enabled the adapter.\n2. Tested a website; connection restored.\n3. Confirmed the network icon.",
  toolsUsed: "Windows network settings",
  preventiveRecommendation:
    "Check the network icon before restarting the router.",
};

const validArticle = {
  title: "Wi-Fi troubleshooting",
  problemSummary: "The wireless connection drops.",
  symptoms: ["Web pages will not load"],
  platforms: ["Windows"],
  rootCause: "The network adapter was disabled.",
  preconditions: [],
  steps: [{ text: "Enable the adapter.", risk: "safe" as const }],
  verification: ["Ask the user to reconnect."],
  escalationConditions: ["The symptom returns."],
  prevention: ["Keep the device updated."],
  sources: [
    { type: "ticket" as const, reference: "ticket-1" },
    { type: "guide" as const, reference: "no-internet" },
  ],
  confidence: 0.8,
  securityReviewRequired: false,
};

function inputs(overrides: Record<string, unknown> = {}): KnowledgeDraftInputs {
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
  } as KnowledgeDraftInputs;
}

function ticketRow(overrides: Record<string, unknown> = {}) {
  return {
    ...inputs().ticket,
    status: "Resolved",
    reopen_count: 0,
    verified_by_user: true,
    ...overrides,
  };
}

function makeQuery(options: {
  result?: { data?: unknown; error?: unknown };
  maybeSingle?: { data?: unknown; error?: unknown };
  single?: { data?: unknown; error?: unknown };
}) {
  const result = options.result ?? { data: null, error: null };
  type Query = {
    select: (...args: unknown[]) => Query;
    eq: (...args: unknown[]) => Query;
    in: (...args: unknown[]) => Query;
    or: (...args: unknown[]) => Query;
    order: (...args: unknown[]) => Query;
    limit: (...args: unknown[]) => Query;
    upsert: (...args: unknown[]) => Query;
    insert: (...args: unknown[]) => Query;
    update: (...args: unknown[]) => Query;
    delete: (...args: unknown[]) => Query;
    maybeSingle: () => Promise<{ data?: unknown; error?: unknown }>;
    single: () => Promise<{ data?: unknown; error?: unknown }>;
    then: (
      resolve: (value: unknown) => unknown,
      reject?: (reason: unknown) => unknown
    ) => Promise<unknown>;
  };
  const query = {} as Query;
  for (const method of [
    "select",
    "eq",
    "in",
    "or",
    "order",
    "limit",
    "upsert",
    "insert",
    "update",
    "delete",
  ]) {
    (query as unknown as Record<string, unknown>)[method] = vi.fn(() => query);
  }
  query.maybeSingle = vi.fn(async () => options.maybeSingle ?? result);
  query.single = vi.fn(
    async () => options.single ?? options.maybeSingle ?? result
  );
  query.then = (
    resolve: (value: unknown) => unknown,
    reject?: (reason: unknown) => unknown
  ) => Promise.resolve(result).then(resolve, reject);
  return query;
}

function makeWorkflowAdmin(options: {
  event?: Record<string, unknown> | null;
  ticket?: Record<string, unknown> | null;
  outcomes?: KnowledgeDraftInputs["stepOutcomes"];
  draftInsert?: { id: string } | null;
  ticketComments?: boolean;
}) {
  const events = makeQuery({
    result: { data: null, error: null },
    maybeSingle: { data: options.event ?? null, error: null },
  });
  const tickets = makeQuery({
    result: { data: null, error: null },
    maybeSingle: { data: options.ticket ?? ticketRow(), error: null },
  });
  const outcomes = makeQuery({
    result: { data: options.outcomes ?? inputs().stepOutcomes, error: null },
  });
  const drafts = makeQuery({
    result: { data: null, error: null },
    maybeSingle: {
      data: options.draftInsert ?? { id: "draft-1" },
      error: null,
    },
  });
  const comments = makeQuery({ result: { data: [], error: null } });
  const admin = {
    events,
    drafts,
    from: vi.fn((table: string) => {
      if (table === "knowledge_learning_events") return events;
      if (table === "tickets") return tickets;
      if (table === "ticket_step_outcomes") return outcomes;
      if (table === "knowledge_drafts") return drafts;
      if (table === "ticket_comments") {
        if (options.ticketComments === false) {
          throw new Error("ticket_comments must not be read");
        }
        return comments;
      }
      throw new Error(`Unexpected table: ${table}`);
    }),
  };
  return admin;
}

function reviewRow(overrides: Record<string, unknown> = {}) {
  return {
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
    article: validArticle,
    confirmation: "user_confirmed",
    status: "draft",
    review_note: null,
    rejection_reason: null,
    reviewer_instructions: null,
    regeneration_count: 0,
    security_review_required: false,
    failure_reason: null,
    redaction_summary: {},
    similar_slugs: [],
    model_provider: "deterministic",
    model_version: "1",
    prompt_version: "learned-article-v1",
    generated_at: "2026-01-01T00:00:00Z",
    reviewed_by: null,
    reviewed_at: null,
    created_guide_id: null,
    published_revision_id: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeReviewAdmin(row: Record<string, unknown> | null) {
  const drafts = makeQuery({
    result: { data: null, error: null },
    maybeSingle: { data: row, error: null },
  });
  const guides = makeQuery({
    result: {
      data: [{ id: "guide-1", status: "approved", version: 2 }],
      error: null,
    },
    single: { data: { id: "guide-1" }, error: null },
  });
  const revisions = makeQuery({
    result: { data: null, error: null },
    single: { data: { id: 42 }, error: null },
  });
  const tickets = makeQuery({
    result: { data: null, error: null },
    maybeSingle: { data: ticketRow(), error: null },
  });
  const outcomes = makeQuery({
    result: { data: inputs().stepOutcomes, error: null },
  });
  const admin = {
    drafts,
    guides,
    revisions,
    from: vi.fn((table: string) => {
      if (table === "knowledge_drafts") return drafts;
      if (table === "knowledge_guides") return guides;
      if (table === "knowledge_guide_revisions") return revisions;
      if (table === "tickets") return tickets;
      if (table === "ticket_step_outcomes") return outcomes;
      throw new Error(`Unexpected table: ${table}`);
    }),
  };
  return admin;
}

const provider: LearnedArticleProvider = {
  name: "deterministic",
  version: "1",
  promptVersion: "learned-article-v1",
  generate,
};

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

describe("learning event workflow", () => {
  test("duplicate events are idempotent", async () => {
    learningEnabled.mockReturnValue(true);
    const admin = makeWorkflowAdmin({ event: null });
    await createKnowledgeDraftForTicket(admin as never, "ticket-1", "org-1");
    expect(admin.from).toHaveBeenCalledWith("knowledge_learning_events");
    expect(admin.from).not.toHaveBeenCalledWith("tickets");
    expect(admin.from).not.toHaveBeenCalledWith("knowledge_drafts");
  });

  test("provider outage does not affect resolution and retries before review", async () => {
    learningEnabled.mockReturnValue(true);
    getProvider.mockImplementation(() => {
      throw new Error("provider unavailable");
    });
    const event = {
      id: "event-1",
      ticket_id: "ticket-1",
      organization_id: "org-1",
      attempts: 0,
    };
    const admin = makeWorkflowAdmin({ event });
    await expect(
      createKnowledgeDraftForTicket(admin as never, "ticket-1", "org-1")
    ).resolves.toBeUndefined();
    expect(admin.events.update).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ status: "processing", attempts: 1 })
    );
    expect(admin.events.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "pending" })
    );

    const exhaustedAdmin = makeWorkflowAdmin({
      event: { ...event, attempts: 2 },
    });
    await expect(
      processLearningEvent(exhaustedAdmin as never, {
        ...event,
        attempts: 2,
      })
    ).resolves.toMatchObject({ kind: "failed" });
    expect(exhaustedAdmin.events.update).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ status: "processing", attempts: 3 })
    );
    expect(exhaustedAdmin.events.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "review" })
    );
  });

  test("invalid provider output creates a failed draft", async () => {
    learningEnabled.mockReturnValue(true);
    getProvider.mockReturnValue(provider);
    generate.mockResolvedValue({ invalid: true });
    const admin = makeWorkflowAdmin({
      event: {
        id: "event-1",
        ticket_id: "ticket-1",
        organization_id: "org-1",
        attempts: 0,
      },
    });
    await processLearningEvent(admin as never, {
      id: "event-1",
      ticket_id: "ticket-1",
      organization_id: "org-1",
      attempts: 0,
    });
    expect(admin.drafts.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        article: null,
        failure_reason: expect.any(String),
      }),
      expect.anything()
    );
  });

  test("internal notes are excluded and provider input contains only structured fields", async () => {
    learningEnabled.mockReturnValue(true);
    getProvider.mockReturnValue(provider);
    generate.mockResolvedValue(validArticle);
    const admin = makeWorkflowAdmin({
      ticketComments: false,
      event: {
        id: "event-1",
        ticket_id: "ticket-1",
        organization_id: "org-1",
        attempts: 0,
      },
    });
    await processLearningEvent(admin as never, {
      id: "event-1",
      ticket_id: "ticket-1",
      organization_id: "org-1",
      attempts: 0,
    });
    expect(admin.from).not.toHaveBeenCalledWith("ticket_comments");
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        ticketId: "ticket-1",
        rootCause: report.rootCause,
        actionsPerformed: expect.any(String),
      })
    );
    expect(generate.mock.calls[0][0]).not.toHaveProperty("internalNotes");
  });

  test("credentials removed from provider input and redaction summary", async () => {
    learningEnabled.mockReturnValue(true);
    getProvider.mockReturnValue(provider);
    generate.mockResolvedValue(validArticle);
    const admin = makeWorkflowAdmin({
      ticket: ticketRow({
        message: "Contact user@example.com",
      }),
      event: {
        id: "event-1",
        ticket_id: "ticket-1",
        organization_id: "org-1",
        attempts: 0,
      },
    });
    await processLearningEvent(admin as never, {
      id: "event-1",
      ticket_id: "ticket-1",
      organization_id: "org-1",
      attempts: 0,
    });
    const prepared = buildLearnedArticleInput(
      inputs({
        ticket: ticketRow({
          message: "Contact user@example.com; password: hunter2",
        }),
      }),
      null
    );
    expect(admin.drafts.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        redaction_summary: expect.objectContaining({
          email: expect.any(Number),
        }),
      }),
      expect.anything()
    );
    expect(prepared?.input.problem).not.toContain("hunter2");
    expect(prepared?.input.problem).not.toContain("user@example.com");
    expect(prepared?.redactions).toEqual(
      expect.objectContaining({
        credential: expect.any(Number),
        email: expect.any(Number),
      })
    );
  });
});

describe("reviewKnowledgeDraft", () => {
  test("publishing creates a governed revision", async () => {
    learningEnabled.mockReturnValue(true);
    const admin = makeReviewAdmin(reviewRow());
    createAdminClient.mockReturnValue(admin);
    await expect(
      reviewKnowledgeDraft({
        draftId: "11111111-1111-4111-8111-111111111111",
        organizationId: "org-1",
        actorId: "user-1",
        decision: "approve_new",
      })
    ).resolves.toEqual({ success: true });
    expect(admin.guides.insert).toHaveBeenCalledWith(
      expect.objectContaining({ status: "draft" })
    );
    expect(admin.revisions.insert).toHaveBeenCalled();
    expect(admin.drafts.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "approved",
        created_guide_id: "guide-1",
        published_revision_id: 42,
      })
    );
  });

  test("approve_revision inserts a revision row and updates status approved", async () => {
    learningEnabled.mockReturnValue(true);
    const admin = makeReviewAdmin(
      reviewRow({ kind: "guide_update", related_slug: "no-internet" })
    );
    createAdminClient.mockReturnValue(admin);
    await expect(
      reviewKnowledgeDraft({
        draftId: "11111111-1111-4111-8111-111111111111",
        organizationId: "org-1",
        actorId: "user-1",
        decision: "approve_revision",
        targetSlug: "no-internet",
      })
    ).resolves.toEqual({ success: true });
    expect(admin.revisions.insert).toHaveBeenCalled();
    expect(admin.drafts.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "approved",
        related_slug: "no-internet",
        published_revision_id: 42,
      })
    );
  });

  test("rejecting records reviewer and reason", async () => {
    learningEnabled.mockReturnValue(true);
    const admin = makeReviewAdmin(reviewRow());
    createAdminClient.mockReturnValue(admin);
    await expect(
      reviewKnowledgeDraft({
        draftId: "11111111-1111-4111-8111-111111111111",
        organizationId: "org-1",
        actorId: "actor-1",
        decision: "reject",
        reason: "Contains unsupported guidance.",
      })
    ).resolves.toEqual({ success: true });
    expect(admin.drafts.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "rejected",
        rejection_reason: "Contains unsupported guidance.",
        reviewed_by: "actor-1",
        reviewed_at: expect.any(String),
      })
    );
  });

  test("empty rejection reason returns an error", async () => {
    learningEnabled.mockReturnValue(true);
    const admin = makeReviewAdmin(reviewRow());
    createAdminClient.mockReturnValue(admin);
    await expect(
      reviewKnowledgeDraft({
        draftId: "11111111-1111-4111-8111-111111111111",
        organizationId: "org-1",
        actorId: "actor-1",
        decision: "reject",
        reason: " ",
      })
    ).resolves.toEqual({ error: "A rejection reason is required." });
    expect(admin.drafts.update).not.toHaveBeenCalled();
  });

  test("regenerate is allowed once", async () => {
    learningEnabled.mockReturnValue(true);
    getProvider.mockReturnValue(provider);
    generate.mockResolvedValue(validArticle);
    const first = makeReviewAdmin(reviewRow());
    createAdminClient.mockReturnValue(first);
    await expect(
      reviewKnowledgeDraft({
        draftId: "11111111-1111-4111-8111-111111111111",
        organizationId: "org-1",
        actorId: "actor-1",
        decision: "regenerate",
        instructions: "Make the steps clearer.",
      })
    ).resolves.toEqual({ success: true });

    const second = makeReviewAdmin(reviewRow({ regeneration_count: 1 }));
    createAdminClient.mockReturnValue(second);
    await expect(
      reviewKnowledgeDraft({
        draftId: "11111111-1111-4111-8111-111111111111",
        organizationId: "org-1",
        actorId: "actor-1",
        decision: "regenerate",
        instructions: "Try again.",
      })
    ).resolves.toEqual({
      error: "This draft has already been regenerated once.",
    });
  });

  test("discard refuses drafts newer than 30 days or non-rejected", async () => {
    learningEnabled.mockReturnValue(true);
    const recent = makeReviewAdmin(
      reviewRow({ status: "rejected", updated_at: new Date().toISOString() })
    );
    createAdminClient.mockReturnValue(recent);
    await expect(
      reviewKnowledgeDraft({
        draftId: "11111111-1111-4111-8111-111111111111",
        organizationId: "org-1",
        actorId: "actor-1",
        decision: "discard",
      })
    ).resolves.toMatchObject({ error: expect.stringContaining("older than") });

    const oldDraft = reviewRow({
      status: "draft",
      updated_at: "2020-01-01T00:00:00Z",
    });
    const nonRejected = makeReviewAdmin(oldDraft);
    createAdminClient.mockReturnValue(nonRejected);
    await expect(
      reviewKnowledgeDraft({
        draftId: oldDraft.id as string,
        organizationId: "org-1",
        actorId: "actor-1",
        decision: "discard",
      })
    ).resolves.toMatchObject({ error: expect.stringContaining("rejected") });
  });
});

describe("learning privacy boundaries", () => {
  test("drafts are absent from public search and approved-guide retrieval sources", async () => {
    const fs = await import("node:fs/promises");
    const sourcePaths = [
      "lib/search.ts",
      "lib/knowledge/governance.ts",
      ...(await fs.readdir("lib/ai"))
        .filter((file) => file.endsWith(".ts"))
        .map((file) => `lib/ai/${file}`),
    ];
    for (const path of sourcePaths) {
      const source = await fs.readFile(path, "utf8");
      expect(source).not.toContain("knowledge_drafts");
    }
  });
});
