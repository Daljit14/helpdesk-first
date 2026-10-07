import { afterEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  writeStep: vi.fn(),
}));

vi.mock("@/lib/security/ticket-crypto", () => ({
  encryptAgentTextForWrite: vi.fn(
    async (_admin, _org, _table, _column, value) => `encrypted:${value}`
  ),
}));
vi.mock("./session", () => ({
  writeStep: mocks.writeStep,
}));

import { encryptAgentTextForWrite } from "@/lib/security/ticket-crypto";
import { sweepAbandonedSessions } from "./abandon";

const now = new Date("2026-10-07T12:00:00.000Z");
const staleSession = {
  id: "session-1",
  organization_id: "org-1",
  started_at: "2026-10-06T09:00:00.000Z",
  updated_at: "2026-10-07T09:00:00.000Z",
};

function makeAdmin(
  options: {
    sessions?: Array<Record<string, unknown>>;
    steps?: Array<Record<string, unknown>>;
    updateRows?: Array<{ id: string }>;
  } = {}
) {
  const queries: Array<{
    table: string;
    operation: string;
    args: unknown[];
  }> = [];
  const order: string[] = [];
  const updates: Array<Record<string, unknown>> = [];
  const from = (table: string) => {
    let mode = "select";
    let sessionId: string | undefined;
    let updateValue: Record<string, unknown> | undefined;
    const query = {
      select: (...args: unknown[]) => {
        queries.push({ table, operation: "select", args });
        return query;
      },
      eq: (...args: unknown[]) => {
        queries.push({ table, operation: "eq", args });
        if (args[0] === "session_id") sessionId = String(args[1]);
        return query;
      },
      is: (...args: unknown[]) => {
        queries.push({ table, operation: "is", args });
        return query;
      },
      lt: (...args: unknown[]) => {
        queries.push({ table, operation: "lt", args });
        return query;
      },
      order: (...args: unknown[]) => {
        queries.push({ table, operation: "order", args });
        return query;
      },
      limit: (...args: unknown[]) => {
        queries.push({ table, operation: "limit", args });
        return query;
      },
      update: (value: Record<string, unknown>) => {
        mode = "update";
        updateValue = value;
        updates.push(value);
        return query;
      },
      then: (
        resolve: (value: { data: unknown; error: null }) => unknown,
        reject?: (reason: unknown) => unknown
      ) => {
        let data: unknown = [];
        if (table === "agent_sessions" && mode === "select")
          data = options.sessions ?? [staleSession];
        else if (table === "agent_sessions" && mode === "update") {
          order.push("update");
          data = options.updateRows ?? [{ id: staleSession.id }];
        } else if (table === "agent_steps") {
          data =
            options.steps?.filter(
              (step) => !sessionId || step.session_id === sessionId
            ) ?? [];
        }
        void updateValue;
        return Promise.resolve({ data, error: null }).then(resolve, reject);
      },
    };
    return query;
  };
  return {
    admin: { from },
    queries,
    order,
    updates,
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("sweepAbandonedSessions", () => {
  test("abandons stale sessions and writes the audit step after the update", async () => {
    const { admin, order, updates } = makeAdmin();
    mocks.writeStep.mockImplementation(async () => {
      order.push("write-step");
    });

    const result = await sweepAbandonedSessions(admin as never, {
      now,
      minutes: 60,
    });

    expect(result).toEqual({ scanned: 1, abandoned: 1, skipped: 0 });
    expect(encryptAgentTextForWrite).toHaveBeenCalledWith(
      admin,
      "org-1",
      "agent_sessions",
      "resolution_summary",
      "abandoned_no_user_turn"
    );
    expect(updates[0]).toEqual({
      status: "abandoned",
      ended_at: now.toISOString(),
      updated_at: now.toISOString(),
      resolution_summary: "encrypted:abandoned_no_user_turn",
    });
    expect(order).toEqual(["update", "write-step"]);
    expect(mocks.writeStep).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({ id: "session-1" }),
      {
        kind: "abandoned",
        resultSummary: "No user turn for 60 minutes.",
      }
    );
  });

  test("skips a session with a fresh user turn", async () => {
    const { admin, updates } = makeAdmin({
      steps: [
        {
          session_id: "session-1",
          kind: "user_message",
          created_at: new Date(now.getTime() - 30 * 60_000).toISOString(),
          seq: 1,
        },
      ],
    });

    await expect(
      sweepAbandonedSessions(admin as never, { now, minutes: 60 })
    ).resolves.toEqual({ scanned: 1, abandoned: 0, skipped: 1 });
    expect(updates).toHaveLength(0);
    expect(mocks.writeStep).not.toHaveBeenCalled();
  });

  test("filters out sessions with a pending approval", async () => {
    const { admin, queries } = makeAdmin({ sessions: [] });

    await expect(
      sweepAbandonedSessions(admin as never, { now, minutes: 60 })
    ).resolves.toEqual({ scanned: 0, abandoned: 0, skipped: 0 });
    expect(queries).toContainEqual({
      table: "agent_sessions",
      operation: "is",
      args: ["pending_approval_id", null],
    });
  });

  test("skips the latest unresolved consent request", async () => {
    const { admin, updates } = makeAdmin({
      steps: [
        {
          session_id: "session-1",
          kind: "consent_required",
          created_at: "2026-10-07T08:00:00.000Z",
          seq: 1,
        },
      ],
    });

    await expect(
      sweepAbandonedSessions(admin as never, { now, minutes: 60 })
    ).resolves.toEqual({ scanned: 1, abandoned: 0, skipped: 1 });
    expect(updates).toHaveLength(0);
    expect(mocks.writeStep).not.toHaveBeenCalled();
  });

  test("skips an unfinished action", async () => {
    const { admin, updates } = makeAdmin({
      steps: [
        {
          session_id: "session-1",
          kind: "action_executing",
          created_at: "2026-10-07T08:00:00.000Z",
          seq: 1,
        },
        {
          session_id: "session-1",
          kind: "tool_result",
          created_at: "2026-10-07T08:01:00.000Z",
          seq: 2,
        },
      ],
    });

    await expect(
      sweepAbandonedSessions(admin as never, { now, minutes: 60 })
    ).resolves.toEqual({ scanned: 1, abandoned: 0, skipped: 1 });
    expect(updates).toHaveLength(0);
    expect(mocks.writeStep).not.toHaveBeenCalled();
  });

  test("counts a raced conditional update as skipped without writing a step", async () => {
    const { admin, updates } = makeAdmin({ updateRows: [] });

    await expect(
      sweepAbandonedSessions(admin as never, { now, minutes: 60 })
    ).resolves.toEqual({ scanned: 1, abandoned: 0, skipped: 1 });
    expect(updates[0]).toMatchObject({ status: "abandoned" });
    expect(mocks.writeStep).not.toHaveBeenCalled();
  });

  test("respects the requested selection limit", async () => {
    const { admin, queries } = makeAdmin();

    await sweepAbandonedSessions(admin as never, {
      now,
      minutes: 60,
      limit: 1,
    });

    expect(queries).toContainEqual({
      table: "agent_sessions",
      operation: "limit",
      args: [1],
    });
  });
});
