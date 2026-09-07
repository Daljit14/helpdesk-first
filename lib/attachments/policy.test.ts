import { afterEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));

import { DEFAULT_POLICY, getAttachmentPolicy } from "./policy";

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("attachment policy", () => {
  test("uses defaults and configured retention without an organization row", async () => {
    vi.stubEnv("HELP_DESK_ATTACHMENT_RETENTION_DAYS", "42");
    await expect(getAttachmentPolicy(null)).resolves.toMatchObject({
      ...DEFAULT_POLICY,
      retentionDays: 42,
    });
  });

  test("loads an organization policy row", async () => {
    const builder = {
      from: vi.fn(),
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn(async () => ({
        data: {
          max_files_per_ticket: 2,
          max_file_bytes: 3,
          max_total_bytes: 4,
          allowed_mime_types: ["application/pdf"],
          retention_days: 5,
        },
      })),
    };
    builder.from.mockReturnValue(builder);
    builder.select.mockReturnValue(builder);
    builder.eq.mockReturnValue(builder);
    mocks.createAdminClient.mockReturnValue(builder);
    await expect(getAttachmentPolicy("org-1")).resolves.toEqual({
      maxFilesPerTicket: 2,
      maxFileBytes: 3,
      maxTotalBytes: 4,
      allowedMimeTypes: ["application/pdf"],
      retentionDays: 5,
    });
  });
});
