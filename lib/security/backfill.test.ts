import { beforeEach, describe, expect, test, vi } from "vitest";
import { backfillEncryption } from "./backfill";

vi.mock("./field-crypto", () => ({
  encryptJson: vi.fn(async () => ({ $enc: "enc:json" })),
  encryptText: vi.fn(async (_admin, _organizationId, _ref, value: string) => {
    return `enc:${value}`;
  }),
  isEncryptedField: (value: unknown) =>
    typeof value === "string" && value.startsWith("enc:"),
}));

type Row = {
  id?: string | number;
  ticket_id?: string;
  organization_id: string;
  message?: unknown;
  evidence?: unknown;
  escalation_package?: unknown;
  scan_detail?: unknown;
};

function fakeAdmin(initial: Record<string, Row[]>): {
  admin: Parameters<typeof backfillEncryption>[0];
  rows: Record<string, Row[]>;
  updates: Array<{ table: string; ids: Array<string | number | undefined> }>;
} {
  const rows = structuredClone(initial);
  const updates: Array<{
    table: string;
    ids: Array<string | number | undefined>;
  }> = [];
  const progress = new Map<string, { last_processed_id: string | null }>();
  const admin = {
    from(table: string) {
      const filters: Array<{ column: string; value: unknown }> = [];
      const ranges: Array<{ column: string; value: string }> = [];
      let maxRows: number | null = null;
      let head = false;
      let updateValues: Record<string, unknown> | null = null;
      let upsertValue: Record<string, unknown> | null = null;
      const builder = {
        select(selection: string, options?: { head?: boolean }) {
          void selection;
          head = options?.head === true;
          return builder;
        },
        eq(column: string, value: unknown) {
          filters.push({ column, value });
          return builder;
        },
        not(column: string, operator: string, value: unknown) {
          if (operator === "is")
            filters.push({ column: `not:${column}`, value });
          if (operator === "like")
            filters.push({ column: `not-like:${column}`, value });
          return builder;
        },
        gt(column: string, value: string) {
          ranges.push({ column, value });
          return builder;
        },
        order() {
          return builder;
        },
        limit(value: number) {
          maxRows = value;
          return builder;
        },
        maybeSingle() {
          return builder;
        },
        update(value: Record<string, unknown>) {
          updateValues = value;
          return builder;
        },
        upsert(value: Record<string, unknown>) {
          upsertValue = value;
          return builder;
        },
        then(
          resolve: (result: {
            data: unknown;
            error: null;
            count?: number;
          }) => unknown
        ) {
          if (upsertValue) {
            const key = `${upsertValue.organization_id}/${upsertValue.table_name}/${upsertValue.column_name}`;
            progress.set(key, {
              last_processed_id:
                (upsertValue.last_processed_id as string | null) ?? null,
            });
            return Promise.resolve(resolve({ data: null, error: null }));
          }
          if (table === "data_protection_backfill") {
            const organizationId = filters.find(
              (filter) => filter.column === "organization_id"
            )?.value;
            const tableName = filters.find(
              (filter) => filter.column === "table_name"
            )?.value;
            const columnName = filters.find(
              (filter) => filter.column === "column_name"
            )?.value;
            const key = `${organizationId}/${tableName}/${columnName}`;
            const saved = progress.get(key);
            return Promise.resolve(
              resolve({
                data: saved
                  ? { last_processed_id: saved.last_processed_id }
                  : null,
                error: null,
              })
            );
          }
          const matches = (row: Row) =>
            filters.every((filter) => {
              if (filter.column.startsWith("not:")) {
                return (
                  row[filter.column.slice(4) as keyof Row] !== filter.value
                );
              }
              if (filter.column.startsWith("not-like:")) {
                const actual = row[filter.column.slice(9) as keyof Row];
                return typeof actual === "string" && !actual.startsWith("enc:");
              }
              return row[filter.column as keyof Row] === filter.value;
            }) &&
            ranges.every(
              (range) =>
                Number(row[range.column as keyof Row]) > Number(range.value) ||
                String(row[range.column as keyof Row]) > range.value
            );
          const matching = (rows[table] ?? []).filter(matches);
          if (updateValues) {
            for (const row of matching) Object.assign(row, updateValues);
            updates.push({
              table,
              ids: matching.map((row) => row.id ?? row.ticket_id),
            });
          }
          const result = head
            ? {
                data: null,
                error: null,
                count: matching.length,
              }
            : {
                data: maxRows === null ? matching : matching.slice(0, maxRows),
                error: null,
              };
          return Promise.resolve(resolve(result));
        },
      };
      return builder;
    },
  };
  return {
    admin: admin as unknown as Parameters<typeof backfillEncryption>[0],
    rows,
    updates,
  };
}

describe("data protection backfill", () => {
  beforeEach(() => {
    vi.stubEnv("HELP_DESK_ORG_ENCRYPTION_ENABLED", "false");
  });

  test("is a no-op while encryption is disabled", async () => {
    await expect(
      backfillEncryption({} as Parameters<typeof backfillEncryption>[0], {
        organizationId: "org-a",
      })
    ).resolves.toEqual({ skipped: "disabled" });
  });

  test("drains JSON targets across passes in one run", async () => {
    vi.stubEnv("HELP_DESK_ORG_ENCRYPTION_ENABLED", "true");
    const fixture = fakeAdmin({
      tickets: [],
      ticket_comments: [],
      ticket_investigations: [
        {
          ticket_id: "00000000-0000-4000-8000-000000000001",
          organization_id: "org-a",
          evidence: { one: true },
        },
        {
          ticket_id: "00000000-0000-4000-8000-000000000002",
          organization_id: "org-a",
          evidence: { two: true },
        },
        {
          ticket_id: "00000000-0000-4000-8000-000000000003",
          organization_id: "org-a",
          evidence: { three: true },
        },
      ],
      ticket_attachments: [],
    });
    const result = await backfillEncryption(fixture.admin, {
      organizationId: "org-a",
      batchSize: 2,
    });

    expect(result).toMatchObject({
      processed: 3,
      remaining: 0,
      exhaustedBudget: false,
    });
    expect(
      fixture.rows.ticket_investigations.every(
        (row) =>
          typeof row.evidence === "object" &&
          row.evidence !== null &&
          "$enc" in row.evidence
      )
    ).toBe(true);
    expect(
      fixture.updates
        .filter((update) => update.table === "ticket_investigations")
        .every((update) =>
          update.ids.every((id) => typeof id === "string" && id.length > 0)
        )
    ).toBe(true);
  });

  test("stops after one pass when the time budget is zero", async () => {
    vi.stubEnv("HELP_DESK_ORG_ENCRYPTION_ENABLED", "true");
    const fixture = fakeAdmin({
      tickets: [],
      ticket_comments: [],
      ticket_investigations: [
        {
          ticket_id: "00000000-0000-4000-8000-000000000001",
          organization_id: "org-a",
          evidence: { one: true },
        },
        {
          ticket_id: "00000000-0000-4000-8000-000000000002",
          organization_id: "org-a",
          evidence: { two: true },
        },
        {
          ticket_id: "00000000-0000-4000-8000-000000000003",
          organization_id: "org-a",
          evidence: { three: true },
        },
      ],
      ticket_attachments: [],
    });
    const result = await backfillEncryption(fixture.admin, {
      organizationId: "org-a",
      batchSize: 2,
      timeBudgetMs: 0,
    });

    expect(result).toMatchObject({
      processed: 2,
      remaining: 1,
      exhaustedBudget: true,
    });
    expect(
      fixture.rows.ticket_investigations.filter(
        (row) =>
          typeof row.evidence === "object" &&
          row.evidence !== null &&
          "$enc" in row.evidence
      ).length
    ).toBe(2);
  });
});
