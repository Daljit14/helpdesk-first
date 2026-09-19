import { describe, expect, test, vi } from "vitest";
import { createEnvKeyProvider } from "./key-provider";
import {
  clearOrgKeyCacheForTests,
  getActiveOrgKey,
  rotateOrgKey,
} from "./org-keys";

describe("organization keys", () => {
  test("environment provider wraps and unwraps a DEK", () => {
    vi.stubEnv("HELP_DESK_MASTER_KEY", Buffer.alloc(32, 4).toString("base64"));
    const provider = createEnvKeyProvider();
    const dek = Buffer.alloc(32, 7);
    expect(provider.unwrap(provider.wrap(dek))).toEqual(dek);
  });

  test("caches an active organization key", async () => {
    vi.stubEnv("HELP_DESK_MASTER_KEY", Buffer.alloc(32, 4).toString("base64"));
    clearOrgKeyCacheForTests();
    const wrapped = createEnvKeyProvider().wrap(Buffer.alloc(32, 7));
    const from = vi.fn(() => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { key_version: 1, wrapped_dek: wrapped },
              error: null,
            }),
          }),
        }),
      }),
    }));
    const admin = { from } as unknown as Parameters<typeof getActiveOrgKey>[0];
    const first = await getActiveOrgKey(admin, "org-a");
    const second = await getActiveOrgKey(admin, "org-a");
    expect(first.dek).toBe(second.dek);
    expect(from).toHaveBeenCalledTimes(2);
  });

  test("retires the current key before inserting the next active key", async () => {
    vi.stubEnv("HELP_DESK_MASTER_KEY", Buffer.alloc(32, 4).toString("base64"));
    clearOrgKeyCacheForTests();
    const provider = createEnvKeyProvider();
    const wrapped = provider.wrap(Buffer.alloc(32, 7));
    const nextWrapped = provider.wrap(Buffer.alloc(32, 8));
    const calls: string[] = [];
    const admin = {
      from: vi.fn((table: string) => {
        if (table !== "organization_keys") throw new Error("unexpected table");
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { key_version: 1, wrapped_dek: wrapped },
                  error: null,
                }),
              }),
            }),
          }),
          update: (values: Record<string, unknown>) => {
            calls.push(values.status === "retired" ? "retire" : "restore");
            return {
              eq: () => ({
                eq: () => ({
                  eq: async () => ({ error: null }),
                }),
              }),
            };
          },
          insert: () => {
            calls.push("insert");
            return {
              select: () => ({
                single: async () => ({
                  data: { key_version: 2, wrapped_dek: nextWrapped },
                  error: null,
                }),
              }),
            };
          },
        };
      }),
    } as unknown as Parameters<typeof rotateOrgKey>[0];

    const rotated = await rotateOrgKey(admin, "org-a");

    expect(rotated.keyVersion).toBe(2);
    expect(calls).toEqual(["retire", "insert"]);
  });
});
