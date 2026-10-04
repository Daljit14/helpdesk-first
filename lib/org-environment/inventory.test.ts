import { describe, expect, test } from "vitest";
import { loadInventorySuggestions, suggestFromInventory } from "./inventory";

describe("organization environment inventory suggestions", () => {
  test("maps device platforms and frequency-sorts normalized printer names", () => {
    expect(
      suggestFromInventory(
        [
          { platform: "windows" },
          { platform: "windows" },
          { platform: "macos" },
          { platform: "linux" },
          { platform: "unknown" },
        ],
        [
          { data: { names: [" HP LaserJet ", "Office printer"] } },
          { data: { names: ["HP LaserJet", "Color printer"] } },
          { data: { names: [" Office printer "] } },
        ]
      )
    ).toEqual({
      deviceCount: 5,
      platforms: [
        { platform: "Windows", count: 2 },
        { platform: "Mac", count: 1 },
        { platform: "Other", count: 1 },
      ],
      printers: ["HP LaserJet", "Office printer", "Color printer"],
    });
  });

  test("trims and caps printer names, returning only the top 20", () => {
    const names = Array.from({ length: 25 }, (_, index) => `Printer ${index}`);
    const result = suggestFromInventory(
      [],
      [{ data: { names: [...names, ` ${names[0]} `, `x${"y".repeat(90)}`] } }]
    );
    expect(result.printers).toHaveLength(20);
    expect(result.printers[0]).toBe(names[0]);
    expect(result.printers).toEqual([
      names[0],
      ...names
        .slice(1)
        .sort((left, right) => left.localeCompare(right))
        .slice(0, 19),
    ]);
    expect(result.printers.every((name) => name.length <= 80)).toBe(true);
  });

  test("loads active devices and only the latest printer diagnostic per device", async () => {
    const results = {
      devices_public: {
        data: [{ platform: "windows" }, { platform: "macos" }],
        error: null,
      },
      device_diagnostics: {
        data: [
          {
            device_id: "device-1",
            ok: true,
            data: { names: ["Latest printer"] },
            collected_at: "2026-10-05T12:00:00.000Z",
          },
          {
            device_id: "device-1",
            ok: true,
            data: { names: ["Old printer"] },
            collected_at: "2026-10-04T12:00:00.000Z",
          },
          {
            device_id: "device-2",
            ok: false,
            data: { names: ["Failed printer"] },
            collected_at: "2026-10-05T12:00:00.000Z",
          },
        ],
        error: null,
      },
    };
    const calls: Array<{ table: string; method: string; args: unknown[] }> = [];
    const admin = {
      from: (table: keyof typeof results) => {
        const query = {
          select: (...args: unknown[]) => {
            calls.push({ table, method: "select", args });
            return query;
          },
          eq: (...args: unknown[]) => {
            calls.push({ table, method: "eq", args });
            return query;
          },
          order: (...args: unknown[]) => {
            calls.push({ table, method: "order", args });
            return query;
          },
          limit: (...args: unknown[]) => {
            calls.push({ table, method: "limit", args });
            return query;
          },
          then: (resolve: (value: (typeof results)[typeof table]) => unknown) =>
            Promise.resolve(results[table]).then(resolve),
        };
        return query;
      },
    };
    await expect(
      loadInventorySuggestions(admin as never, "org-1")
    ).resolves.toEqual({
      deviceCount: 2,
      platforms: [
        { platform: "Mac", count: 1 },
        { platform: "Windows", count: 1 },
      ],
      printers: ["Latest printer"],
    });
    expect(calls).toContainEqual({
      table: "device_diagnostics",
      method: "limit",
      args: [500],
    });
    expect(calls).toContainEqual({
      table: "devices_public",
      method: "eq",
      args: ["status", "active"],
    });
  });

  test("returns empty suggestions when a query fails or throws", async () => {
    const failedClient = {
      from: (table: "devices_public" | "device_diagnostics") => {
        const query = {
          select: () => query,
          eq: () => query,
          order: () => query,
          limit: () => query,
          then: (
            resolve: (value: {
              data: unknown[];
              error: { message: string } | null;
            }) => unknown
          ) =>
            Promise.resolve({
              data: [],
              error: table === "devices_public" ? { message: "failed" } : null,
            }).then(resolve),
        };
        return query;
      },
    };
    await expect(
      loadInventorySuggestions(failedClient as never, "org-1")
    ).resolves.toEqual({ deviceCount: 0, platforms: [], printers: [] });

    await expect(
      loadInventorySuggestions(
        {
          from: () => {
            throw new Error("offline");
          },
        } as never,
        "org-1"
      )
    ).resolves.toEqual({ deviceCount: 0, platforms: [], printers: [] });
  });
});
