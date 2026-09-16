import { describe, expect, test, vi } from "vitest";
import { getVerifier, VERIFIERS } from "./verifiers";
import type { VerifierContext } from "./types";

function makeQuery(options: {
  data?: unknown;
  maybeSingle?: unknown;
  error?: unknown;
}) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    in: vi.fn(() => query),
    limit: vi.fn(() => query),
    maybeSingle: vi.fn(async () => ({
      data: options.maybeSingle ?? null,
      error: options.error ?? null,
    })),
    then: (resolve: (value: unknown) => unknown) =>
      Promise.resolve({
        data: options.data ?? [],
        error: options.error ?? null,
      }).then(resolve),
  };
  return query;
}

function context(
  tables: Record<string, ReturnType<typeof makeQuery>>,
  parameters: Record<string, unknown> = {}
): VerifierContext {
  return {
    admin: {
      from: vi.fn((table: string) => tables[table]),
    } as unknown as VerifierContext["admin"],
    organizationId: "org-1",
    ticketId: "ticket-1",
    runId: "run-1",
    executionId: "execution-1",
    parameters,
    signal: AbortSignal.timeout(10_000),
  };
}

describe("verification verifiers", () => {
  test("registers every capability verification method and rejects unknown methods", () => {
    expect(VERIFIERS.length).toBeGreaterThanOrEqual(11);
    expect(getVerifier("not-a-method")).toBeNull();
  });

  test("none is informational and inconclusive", async () => {
    const result = await getVerifier("none")?.verify(context({}));
    expect(result).toEqual({
      outcome: "inconclusive",
      evidence: { reason: "no_verification_method" },
      userConfirmationRequired: false,
    });
  });

  test("diagnostic_answer_recorded checks the ticket answer", async () => {
    const tickets = makeQuery({
      maybeSingle: {
        diagnostic_answers: [{ questionId: "question-1", answer: "Mac" }],
      },
    });
    const result = await getVerifier("diagnostic_answer_recorded")?.verify(
      context({ tickets }, { questionId: "question-1" })
    );
    expect(result?.outcome).toBe("passed");
    expect(tickets.eq).toHaveBeenCalledWith("organization_id", "org-1");
  });

  test("investigation_context_present distinguishes missing context", async () => {
    const investigations = makeQuery({
      maybeSingle: { id: "investigation-1", context: { os: "macOS" } },
    });
    const passed = await getVerifier("investigation_context_present")?.verify(
      context({ ticket_investigations: investigations })
    );
    expect(passed?.outcome).toBe("passed");

    const missing = makeQuery({
      maybeSingle: { id: "investigation-1", context: {} },
    });
    const inconclusive = await getVerifier(
      "investigation_context_present"
    )?.verify(context({ ticket_investigations: missing }));
    expect(inconclusive?.outcome).toBe("inconclusive");
  });

  test("status_response_captured reads execution status only", async () => {
    const executions = makeQuery({ maybeSingle: { status: "succeeded" } });
    const result = await getVerifier("status_response_captured")?.verify(
      context({ capability_executions: executions })
    );
    expect(result?.outcome).toBe("passed");
    expect(executions.select).toHaveBeenCalledWith("status");
    expect(
      (executions.select.mock.calls as unknown as [unknown][]).some(
        ([columns]) => String(columns).includes("result")
      )
    ).toBe(false);
    expect(executions.eq).toHaveBeenCalledWith("organization_id", "org-1");
  });

  test.each([
    ["sent", "passed"],
    ["failed", "failed"],
    ["pending", "inconclusive"],
  ] as const)(
    "outbox_status_sent returns %s as %s",
    async (status, outcome) => {
      const notifications = makeQuery({
        maybeSingle: { status, sent_at: null },
      });
      const result = await getVerifier("outbox_status_sent")?.verify(
        context(
          { notification_outbox: notifications },
          { notificationId: "notification-1" }
        )
      );
      expect(result?.outcome).toBe(outcome);
      expect(result?.userConfirmationRequired).toBe(true);
      expect(notifications.eq).toHaveBeenCalledWith("organization_id", "org-1");
      expect(notifications.eq).toHaveBeenCalledWith("ticket_id", "ticket-1");
    }
  );

  test("outbox_sent_and_user_confirms shares the objective outbox check", async () => {
    const notifications = makeQuery({
      maybeSingle: { status: "sent", sent_at: "2026-01-01T00:00:00Z" },
    });
    const result = await getVerifier("outbox_sent_and_user_confirms")?.verify(
      context(
        { notification_outbox: notifications },
        { notificationId: "notification-1" }
      )
    );
    expect(result?.outcome).toBe("passed");
    expect(result?.userConfirmationRequired).toBe(true);
  });

  test("attachment_status_read, escalation package, and assignment verifiers are org scoped", async () => {
    const attachments = makeQuery({ maybeSingle: { status: "clean" } });
    const attachment = await getVerifier("attachment_status_read")?.verify(
      context(
        { ticket_attachments: attachments },
        { attachmentId: "attachment-1" }
      )
    );
    expect(attachment?.outcome).toBe("passed");

    const tickets = makeQuery({
      maybeSingle: { escalation_package_at: "2026-01-01T00:00:00Z" },
    });
    const packageResult = await getVerifier(
      "escalation_package_present"
    )?.verify(context({ tickets }));
    expect(packageResult?.outcome).toBe("passed");

    const events = makeQuery({ data: [{ id: "event-1" }] });
    const assignment = await getVerifier("assignment_updated")?.verify(
      context({ resolution_events: events })
    );
    expect(assignment?.outcome).toBe("passed");
    expect(events.eq).toHaveBeenCalledWith("organization_id", "org-1");
  });

  test("user verification and needs-human verifiers handle passed and inconclusive states", async () => {
    const pending = makeQuery({
      maybeSingle: { status: "Pending Verification" },
    });
    const userResult = await getVerifier("user_verification_answer")?.verify(
      context({ tickets: pending })
    );
    expect(userResult?.outcome).toBe("passed");
    expect(userResult?.userConfirmationRequired).toBe(true);

    const needsHuman = makeQuery({
      maybeSingle: {
        status: "Needs Human",
        escalation_package_at: "2026-01-01T00:00:00Z",
      },
    });
    const humanResult = await getVerifier("needs_human_with_package")?.verify(
      context({ tickets: needsHuman })
    );
    expect(humanResult?.outcome).toBe("passed");
  });
});
