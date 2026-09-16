import { beforeEach, describe, expect, test, vi } from "vitest";
import { CAPABILITIES, capabilityChecksum } from "./registry";
import { syncCapabilityRegistry } from "./sync";

type Row = {
  capability_id: string;
  version: number;
  checksum: string;
  status: "active" | "deprecated" | "revoked";
};

function makeAdmin(rows: Row[]) {
  const calls = {
    upserts: [] as unknown[],
    inserts: [] as unknown[],
    updates: [] as unknown[],
    deletes: [] as unknown[],
  };
  const versionQuery = {
    select: vi.fn(() => versionQuery),
    insert: vi.fn((row: unknown) => {
      calls.inserts.push(row);
      return Promise.resolve({ error: null });
    }),
    update: vi.fn((row: unknown) => {
      calls.updates.push(row);
      return versionQuery;
    }),
    eq: vi.fn(() => versionQuery),
    then: (resolve: (value: unknown) => unknown) =>
      Promise.resolve({ data: rows, error: null }).then(resolve),
  };
  const baseQuery = {
    upsert: vi.fn((value: unknown) => {
      calls.upserts.push(value);
      return Promise.resolve({ error: null });
    }),
    delete: vi.fn(() => {
      calls.deletes.push(true);
      return baseQuery;
    }),
  };
  const admin = {
    from: vi.fn((table: string) =>
      table === "capability_versions" ? versionQuery : baseQuery
    ),
  };
  return { admin, calls, versionQuery, baseQuery };
}

describe("capability registry sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("inserts every code definition into an empty database", async () => {
    const { admin, calls } = makeAdmin([]);
    await expect(syncCapabilityRegistry(admin as never)).resolves.toEqual({
      inserted: CAPABILITIES.length,
      updated: 0,
      deprecated: 0,
      conflicts: [],
    });
    expect(calls.inserts).toHaveLength(CAPABILITIES.length);
    expect(calls.deletes).toHaveLength(0);
  });

  test("does not write an active row with a matching checksum", async () => {
    const definition = CAPABILITIES[0];
    const { admin, calls } = makeAdmin([
      {
        capability_id: definition.id,
        version: definition.version,
        checksum: capabilityChecksum(definition),
        status: "active",
      },
    ]);
    const result = await syncCapabilityRegistry(admin as never);
    expect(result.inserted).toBe(CAPABILITIES.length - 1);
    expect(result.updated).toBe(0);
    expect(calls.updates).toHaveLength(0);
    expect(calls.inserts).toHaveLength(CAPABILITIES.length - 1);
  });

  test("reports checksum conflicts without overwriting the row", async () => {
    const definition = CAPABILITIES[0];
    const { admin, calls } = makeAdmin([
      {
        capability_id: definition.id,
        version: definition.version,
        checksum: "different",
        status: "active",
      },
    ]);
    const result = await syncCapabilityRegistry(admin as never);
    expect(result.conflicts).toContain(
      `${definition.id}@${definition.version}`
    );
    expect(calls.updates).toHaveLength(0);
    expect(calls.inserts).toHaveLength(CAPABILITIES.length - 1);
  });

  test("deprecates active rows missing from code", async () => {
    const { admin, calls } = makeAdmin([
      {
        capability_id: "old_cap",
        version: 1,
        checksum: "old",
        status: "active",
      },
    ]);
    const result = await syncCapabilityRegistry(admin as never);
    expect(result.deprecated).toBe(1);
    expect(calls.updates).toContainEqual(
      expect.objectContaining({ status: "deprecated" })
    );
  });

  test("reactivates deprecated rows with a matching checksum", async () => {
    const definition = CAPABILITIES[0];
    const { admin, calls } = makeAdmin([
      {
        capability_id: definition.id,
        version: definition.version,
        checksum: capabilityChecksum(definition),
        status: "deprecated",
      },
    ]);
    const result = await syncCapabilityRegistry(admin as never);
    expect(result.updated).toBe(1);
    expect(calls.updates).toContainEqual(
      expect.objectContaining({ status: "active" })
    );
  });

  test("never deletes database rows", async () => {
    const { admin, calls } = makeAdmin([]);
    await syncCapabilityRegistry(admin as never);
    expect(calls.deletes).toHaveLength(0);
  });
});
