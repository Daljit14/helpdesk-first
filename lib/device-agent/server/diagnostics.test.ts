import { describe, expect, test, vi } from "vitest";
import { storeDiagnostics } from "./diagnostics";

describe("storeDiagnostics", () => {
  test("inserts sanitized recent error event records", async () => {
    const inserted: Record<string, unknown>[] = [];
    const admin = {
      from: (table: string) => {
        if (table !== "device_diagnostics") throw new Error("unexpected table");
        return {
          insert: async (rows: Record<string, unknown>[]) => {
            inserted.push(...rows);
            return { error: null };
          },
        };
      },
    };
    const record = {
      kind: "recent_error_events" as const,
      collectedAt: "2026-09-15T11:45:00.000Z",
      ok: true,
      summary: "Remove-Item -Recurse C:\\Windows was reported.",
      data: {
        appCrash: 4,
        total: 4,
        message: "Remove-Item -Recurse C:\\Windows",
        category: "Remove-Item -Recurse C:\\Windows",
        crashedApps: ["Outlook", "Remove-Item -Recurse C:\\Windows"],
      },
    };

    await storeDiagnostics(
      admin as never,
      {
        id: "device-1",
        organization_id: "org-1",
        user_id: null,
      } as never,
      { records: [record] } as never
    );

    expect(inserted).toHaveLength(1);
    expect(JSON.stringify(inserted[0])).not.toContain("Remove-Item");
    expect(inserted[0]).toMatchObject({
      summary: "4 recent error events in the last 24 hours.",
      data: {
        appCrash: 4,
        total: 4,
        crashedApps: ["Outlook"],
      },
    });
  });

  test("does not use the lookup path when no ticket reference is supplied", async () => {
    const from = vi.fn((table: string) => ({
      insert: async () => ({
        error: table === "device_diagnostics" ? null : {},
      }),
    }));
    await expect(
      storeDiagnostics(
        { from } as never,
        { id: "device-1", organization_id: "org-1", user_id: null } as never,
        {
          records: [
            {
              kind: "dns_resolution",
              collectedAt: "2026-09-15T11:45:00.000Z",
              ok: true,
              summary: "Resolved.",
              data: {},
            },
          ],
        } as never
      )
    ).resolves.toBeUndefined();
    expect(from).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledWith("device_diagnostics");
  });
});
