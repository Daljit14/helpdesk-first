import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getAdminSession: vi.fn(),
  createAdminClient: vi.fn(),
  getAttachmentPolicy: vi.fn(),
  createScanner: vi.fn(),
}));

vi.mock("@/lib/admin/flags", () => ({
  isSecureAttachmentsEnabled: vi.fn(() => true),
}));
vi.mock("@/lib/supabase/user", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));
vi.mock("@/lib/admin/auth", () => ({
  getAdminSession: mocks.getAdminSession,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));
vi.mock("@/lib/attachments/policy", () => ({
  getAttachmentPolicy: mocks.getAttachmentPolicy,
}));
vi.mock("@/lib/attachments/scanner", () => ({
  createScanner: mocks.createScanner,
}));

import {
  beginAttachmentUpload,
  finalizeAttachmentUpload,
  getAttachmentAccessUrl,
} from "./attachments";
import { isSecureAttachmentsEnabled } from "@/lib/admin/flags";

const user = { id: "00000000-0000-4000-8000-000000000001" };
const attachmentId = "00000000-0000-4000-8000-000000000002";
const policy = {
  maxFilesPerTicket: 10,
  maxFileBytes: 20 * 1024 * 1024,
  maxTotalBytes: 100 * 1024 * 1024,
  allowedMimeTypes: [
    "image/png",
    "image/jpeg",
    "image/webp",
    "application/pdf",
  ],
  retentionDays: 365,
};

function builder(data: unknown = null, error: unknown = null) {
  const chain: Record<string, unknown> = {};
  for (const method of [
    "select",
    "eq",
    "in",
    "is",
    "limit",
    "order",
    "update",
  ]) {
    chain[method] = vi.fn(() => chain);
  }
  chain.maybeSingle = vi.fn(async () => ({ data, error }));
  chain.single = vi.fn(async () => ({ data, error }));
  chain.insert = vi.fn(async () => ({ data, error }));
  chain.then = (resolve: (value: unknown) => unknown) =>
    Promise.resolve({ data, error }).then(resolve);
  return chain;
}

function setupAdmin({
  existing = [],
  attachment = null,
  storageDownload,
  signedUrl,
}: {
  existing?: unknown[];
  attachment?: unknown;
  storageDownload?: { arrayBuffer: () => Promise<ArrayBuffer> };
  signedUrl?: string;
} = {}) {
  const attachmentBuilder = builder(attachment);
  attachmentBuilder.insert = vi.fn(async () => ({ data: null, error: null }));
  const existingBuilder = builder(existing);
  attachmentBuilder.select = vi.fn((fields: string) =>
    fields.includes("ticket_id,status") ? existingBuilder : attachmentBuilder
  );
  const ticketBuilder = builder({
    id: "00000000-0000-4000-8000-000000000003",
    organization_id: "org-1",
    user_id: user.id,
  });
  const storage = {
    from: vi.fn(() => ({
      upload: vi.fn(async () => ({ error: null })),
      download: vi.fn(async () => ({
        data: storageDownload,
        error: storageDownload ? null : new Error("missing"),
      })),
      remove: vi.fn(async () => ({ error: null })),
      createSignedUrl: vi.fn(async () => ({
        data: signedUrl ? { signedUrl } : null,
        error: signedUrl ? null : new Error("missing"),
      })),
    })),
  };
  mocks.createAdminClient.mockReturnValue({
    from: vi.fn((table: string) => {
      if (table === "ticket_attachments") return attachmentBuilder;
      if (table === "organization_members")
        return builder({ organization_id: "org-1" });
      if (table === "tickets") return ticketBuilder;
      return table === "attachment_events" ? builder() : existingBuilder;
    }),
    storage,
  });
  return { attachmentBuilder, storage };
}

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("attachment actions", () => {
  beforeEach(() => {
    mocks.getCurrentUser.mockResolvedValue(user);
    mocks.getAttachmentPolicy.mockResolvedValue(policy);
    mocks.getAdminSession.mockResolvedValue(null);
    vi.mocked(isSecureAttachmentsEnabled).mockReturnValue(true);
  });

  test("flag off rejects attachment actions", async () => {
    vi.mocked(isSecureAttachmentsEnabled).mockReturnValue(false);
    await expect(
      beginAttachmentUpload({
        fileName: "x.png",
        declaredMime: "image/png",
        byteSize: 10,
      })
    ).resolves.toEqual({ error: "Secure attachments are not available." });
  });

  test("rejects a ticket upload over count and byte limits", async () => {
    mocks.getAttachmentPolicy.mockResolvedValue({
      ...policy,
      maxFilesPerTicket: 1,
      maxTotalBytes: 10,
    });
    setupAdmin({
      existing: [
        {
          ticket_id: "00000000-0000-4000-8000-000000000003",
          status: "ready",
          byte_size: 9,
          created_at: new Date().toISOString(),
        },
      ],
    });
    await expect(
      beginAttachmentUpload({
        fileName: "x.png",
        declaredMime: "image/png",
        byteSize: 2,
        ticketId: "00000000-0000-4000-8000-000000000003",
      })
    ).resolves.toEqual({
      error: "The attachment limit for this ticket has been reached.",
    });
  });

  test("mime mismatch rejects and removes quarantine object", async () => {
    const row = {
      id: attachmentId,
      organization_id: "org-1",
      ticket_id: null,
      uploader_id: user.id,
      status: "uploading",
      original_name: "x.png",
      detected_mime: null,
      declared_mime: "image/png",
      byte_size: 7,
      sha256: null,
      width: null,
      height: null,
      page_count: null,
      quarantine_path: `${user.id}/${attachmentId}.png`,
      storage_path: null,
      scan_engine: null,
      scan_verdict: null,
      scan_detail: null,
      scanned_at: null,
      rejection_reason: null,
      legal_hold: false,
      expires_at: null,
      deleted_at: null,
      created_at: new Date().toISOString(),
    };
    const { storage } = setupAdmin({
      attachment: row,
      storageDownload: {
        arrayBuffer: async () => new TextEncoder().encode("not png").buffer,
      },
    });
    await expect(finalizeAttachmentUpload(attachmentId)).resolves.toEqual({
      error: "File content does not match its declared type.",
    });
    expect(storage.from).toHaveBeenCalledWith("ticket-attachments-quarantine");
  });

  test("infected files are rejected", async () => {
    const row = {
      id: attachmentId,
      organization_id: "org-1",
      uploader_id: user.id,
      status: "uploading",
      original_name: "x.pdf",
      declared_mime: "application/pdf",
      byte_size: 20,
      quarantine_path: `${user.id}/${attachmentId}.pdf`,
      storage_path: null,
      scan_engine: null,
      scan_verdict: null,
      scan_detail: null,
      legal_hold: false,
      created_at: new Date().toISOString(),
    };
    setupAdmin({
      attachment: row,
      storageDownload: {
        arrayBuffer: async () =>
          new TextEncoder().encode("%PDF-1.7\n/Type /Page").buffer,
      },
    });
    mocks.createScanner.mockReturnValue({
      scan: vi.fn(async () => ({
        verdict: "infected",
        engine: "mock",
      })),
    });
    await expect(finalizeAttachmentUpload(attachmentId)).resolves.toEqual({
      status: "rejected",
    });
  });

  test("none scanner produces a ready unscanned attachment", async () => {
    const row = {
      id: attachmentId,
      organization_id: "org-1",
      uploader_id: user.id,
      status: "uploading",
      original_name: "x.pdf",
      declared_mime: "application/pdf",
      byte_size: 20,
      quarantine_path: `${user.id}/${attachmentId}.pdf`,
      storage_path: null,
      scan_engine: null,
      scan_verdict: null,
      scan_detail: null,
      legal_hold: false,
      created_at: new Date().toISOString(),
    };
    setupAdmin({
      attachment: row,
      storageDownload: {
        arrayBuffer: async () =>
          new TextEncoder().encode("%PDF-1.7\n/Type /Page").buffer,
      },
    });
    mocks.createScanner.mockReturnValue({
      scan: vi.fn(async () => ({
        verdict: "unscanned",
        engine: "none",
      })),
    });
    await expect(finalizeAttachmentUpload(attachmentId)).resolves.toEqual({
      status: "ready",
    });
  });

  test("denies access to non-owner and does not serve deleted rows", async () => {
    setupAdmin({
      attachment: {
        id: attachmentId,
        organization_id: "org-1",
        uploader_id: "another-user",
        status: "deleted",
        storage_path: "another/path",
      },
      signedUrl: "https://private",
    });
    await expect(getAttachmentAccessUrl(attachmentId)).resolves.toEqual({
      error: "Attachment is not available.",
    });
  });
});
