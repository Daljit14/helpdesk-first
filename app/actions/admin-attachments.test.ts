import { afterEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAdminSession: vi.fn(),
  recordAudit: vi.fn(),
  createAdminClient: vi.fn(),
}));

vi.mock("@/lib/admin/flags", () => ({
  isSecureAttachmentsEnabled: vi.fn(() => true),
}));
vi.mock("@/lib/admin/auth", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/admin/auth")>(
      "@/lib/admin/auth"
    );
  return {
    ...actual,
    getAdminSession: mocks.getAdminSession,
    recordAudit: mocks.recordAudit,
  };
});
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));

import {
  adminMarkAttachmentSafe,
  adminRejectAttachment,
  adminUpdateAttachmentPolicy,
} from "./admin-attachments";

const session = {
  userId: "00000000-0000-4000-8000-000000000001",
  email: "admin@example.com",
  role: "org_admin" as const,
  isPlatformAdmin: false,
  organizationId: "org-1",
  displayName: "Admin",
};

function setup(row: Record<string, unknown>) {
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "eq", "update", "upsert"]) {
    chain[method] = vi.fn(() => chain);
  }
  chain.maybeSingle = vi.fn(async () => ({ data: row, error: null }));
  chain.then = (resolve: (value: unknown) => unknown) =>
    Promise.resolve({ data: row, error: null }).then(resolve);
  const storage = {
    from: vi.fn(() => ({
      remove: vi.fn(async () => ({ error: null })),
    })),
  };
  mocks.createAdminClient.mockReturnValue({
    from: vi.fn((table: string) =>
      table === "ticket_attachments"
        ? chain
        : { insert: vi.fn(async () => ({ error: null })) }
    ),
    storage,
  });
  return chain;
}

afterEach(() => vi.clearAllMocks());

describe("admin attachment actions", () => {
  test("denies non-admin policy updates", async () => {
    mocks.getAdminSession.mockResolvedValue({
      ...session,
      role: "support_agent",
    });
    await expect(
      adminUpdateAttachmentPolicy("org-1", {
        maxFilesPerTicket: 2,
        maxFileBytes: 100,
        maxTotalBytes: 1000,
        retentionDays: 30,
        allowedMimeTypes: ["image/png"],
      })
    ).resolves.toEqual({ error: "Not authorized." });
  });

  test("only marks scanning or unscanned attachments safe and audits", async () => {
    mocks.getAdminSession.mockResolvedValue(session);
    setup({
      id: "attachment-1",
      organization_id: "org-1",
      status: "ready",
      storage_path: "u/a.png",
      quarantine_path: null,
      legal_hold: false,
    });
    await expect(
      adminMarkAttachmentSafe("attachment-1", "reviewed")
    ).resolves.toEqual({
      error: "Only scanning or unscanned attachments can be marked safe.",
    });

    setup({
      id: "attachment-1",
      organization_id: "org-1",
      status: "scanning",
      storage_path: "u/a.png",
      quarantine_path: null,
      legal_hold: false,
    });
    await expect(
      adminMarkAttachmentSafe("attachment-1", "reviewed")
    ).resolves.toEqual({ success: true });
    expect(mocks.recordAudit).toHaveBeenCalledWith(
      session,
      "attachment.mark_safe",
      "attachment-1"
    );
  });

  test("rejects an attachment and removes both storage copies", async () => {
    mocks.getAdminSession.mockResolvedValue(session);
    setup({
      id: "attachment-1",
      organization_id: "org-1",
      status: "scanning",
      storage_path: "u/a.png",
      quarantine_path: "u/a.png",
      legal_hold: false,
    });
    await expect(
      adminRejectAttachment("attachment-1", "unsafe")
    ).resolves.toEqual({ success: true });
    expect(mocks.recordAudit).toHaveBeenCalledWith(
      session,
      "attachment.reject",
      "attachment-1"
    );
  });
});
