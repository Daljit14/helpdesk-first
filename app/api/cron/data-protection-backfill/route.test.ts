import { afterEach, describe, expect, test, vi } from "vitest";
import { DataProtectionError } from "@/lib/security/field-crypto";

const mocks = vi.hoisted(() => ({
  backfillEncryption: vi.fn(),
  expireStaleJobs: vi.fn(),
  cleanup: {
    error: null,
    lt: vi.fn(() => ({ error: null })),
  },
  createAdminClient: vi.fn(() => ({
    from: vi.fn(() => ({
      delete: vi.fn(() => mocks.cleanup),
    })),
  })),
}));

vi.mock("@/lib/security/backfill", () => ({
  backfillEncryption: mocks.backfillEncryption,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));
vi.mock("@/lib/device-agent/server/jobs", () => ({
  expireStaleJobs: mocks.expireStaleJobs,
}));

import { GET } from "./route";

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("data-protection backfill cron", () => {
  test("rejects unauthorized requests", async () => {
    vi.stubEnv("CRON_SECRET", "cron-secret");

    const response = await GET(
      new Request("http://localhost/api/cron/data-protection-backfill")
    );

    expect(response.status).toBe(401);
  });

  test("returns the disabled result", async () => {
    vi.stubEnv("CRON_SECRET", "cron-secret");
    mocks.backfillEncryption.mockResolvedValueOnce({ skipped: "disabled" });
    mocks.expireStaleJobs.mockResolvedValueOnce({ expired: 2 });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await GET(
      new Request("http://localhost/api/cron/data-protection-backfill", {
        headers: { Authorization: "Bearer cron-secret" },
      })
    );

    expect(response.status).toBe(200);
    expect(error).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({ skipped: "disabled" });
    expect(mocks.cleanup.lt).toHaveBeenCalledWith(
      "expires_at",
      expect.any(String)
    );
    expect(mocks.expireStaleJobs).toHaveBeenCalledTimes(1);
  });

  test("returns 503 for data-protection failures without exposing details", async () => {
    vi.stubEnv("CRON_SECRET", "cron-secret");
    mocks.backfillEncryption.mockRejectedValueOnce(
      new DataProtectionError("org_key_unavailable")
    );
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await GET(
      new Request("http://localhost/api/cron/data-protection-backfill", {
        headers: { Authorization: "Bearer cron-secret" },
      })
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "org_key_unavailable",
    });
    expect(error).toHaveBeenCalledWith("data-protection backfill failed", {
      code: "org_key_unavailable",
    });
  });
});
