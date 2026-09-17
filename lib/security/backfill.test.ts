import { beforeEach, describe, expect, test, vi } from "vitest";
import { backfillEncryption } from "./backfill";

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
});
