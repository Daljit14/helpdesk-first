import { describe, expect, test, vi } from "vitest";
import { getRollbackHandler } from "./handlers";

function admin() {
  const inserts: unknown[] = [];
  const query = {
    insert: vi.fn((value: unknown) => {
      inserts.push(value);
      return query;
    }),
    then: (resolve: (value: unknown) => unknown) =>
      Promise.resolve({ data: null, error: null }).then(resolve),
  };
  return { from: vi.fn(() => query), inserts };
}

describe("rollback handlers", () => {
  test("registers route_to_department compensating rollback", async () => {
    const handler = getRollbackHandler("route_to_department", 1);
    expect(handler?.method).toBe("compensating");
    const client = admin();
    const result = await handler?.run({
      admin: client as never,
      organizationId: "org-1",
      ticketId: "ticket-1",
      runId: "run-1",
      executionId: "execution-1",
      parameters: { department: "network" },
      signal: new AbortController().signal,
    });
    expect(result?.ok).toBe(true);
    expect(client.inserts).toHaveLength(2);
    expect(client.inserts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "ticket.department_routing_reverted" }),
        expect.objectContaining({
          kind: "resolution.event",
          detail: expect.objectContaining({
            action: "route_to_department.rollback",
          }),
        }),
      ])
    );
  });

  test("does not register unsupported capabilities", () => {
    expect(getRollbackHandler("search_approved_knowledge", 1)).toBeNull();
  });
});
