import { afterEach, describe, expect, test, vi } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";
import { enrollDevice } from "./enroll";

type TokenQuery = {
  eq: (...args: unknown[]) => TokenQuery;
  lt: (...args: unknown[]) => TokenQuery;
  select: (...args: unknown[]) => TokenQuery;
  maybeSingle: () => Promise<{ data: typeof token; error: null }>;
  then: (resolve: (value: unknown) => unknown) => Promise<unknown>;
};

const token = {
  id: "token-1",
  organization_id: "00000000-0000-4000-8000-000000000001",
  device_class: "managed" as const,
  expires_at: "2099-01-01T00:00:00.000Z",
  max_uses: 5,
  used_count: 1,
  revoked_at: null,
  created_by: "user-1",
};

function adminWithDeviceInsert(error: Error | null) {
  const updates: Array<Record<string, unknown>> = [];
  const tokenQuery: TokenQuery = {
    eq: vi.fn(() => tokenQuery),
    lt: vi.fn(() => tokenQuery),
    select: vi.fn(() => tokenQuery),
    maybeSingle: vi.fn(async () => ({ data: token, error: null })),
    then(resolve: (value: unknown) => unknown) {
      return Promise.resolve(resolve({ data: { id: token.id }, error: null }));
    },
  };
  const admin = {
    updates,
    from(table: string) {
      if (table === "device_enrollment_tokens") {
        return {
          select: vi.fn(() => tokenQuery),
          update: vi.fn((value: Record<string, unknown>) => {
            updates.push(value);
            return tokenQuery;
          }),
        };
      }
      if (table === "devices") {
        return {
          insert: vi.fn(async () => ({ data: null, error })),
        };
      }
      return { insert: vi.fn(async () => ({ error: null })) };
    },
  };
  return admin;
}

const input = {
  token: "hd1_" + "a".repeat(32),
  platform: "linux" as const,
  hostname: "host",
  agentVersion: "1.0.0",
  publicKey: "A".repeat(44),
};

afterEach(() => {
  vi.clearAllMocks();
});

describe("enrollDevice", () => {
  test("restores token usage when device insertion fails", async () => {
    const admin = adminWithDeviceInsert(new Error("device insert failed"));

    await expect(
      enrollDevice(
        admin as unknown as ReturnType<typeof createAdminClient>,
        input,
        "127.0.0.1"
      )
    ).rejects.toThrow("device insert failed");

    expect(admin.updates).toEqual([{ used_count: 2 }, { used_count: 1 }]);
  });

  test("returns the validated enrollment response on success", async () => {
    const admin = adminWithDeviceInsert(null);

    await expect(
      enrollDevice(
        admin as unknown as ReturnType<typeof createAdminClient>,
        input,
        "127.0.0.2"
      )
    ).resolves.toMatchObject({
      organizationId: token.organization_id,
      pollIntervalSec: 300,
      catalogVersion: "2026-09-21.3",
    });
  });
});
