import { afterEach, describe, expect, test, vi } from "vitest";
import { buildTicketAttachmentPath, MAX_ATTACHMENT_BYTES } from "./storage";

vi.mock("@/lib/supabase/client", () => ({
  createClient: vi.fn(),
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("buildTicketAttachmentPath", () => {
  test("rejects unsupported MIME types", () => {
    expect(
      buildTicketAttachmentPath("user-1", {
        type: "text/plain",
        size: 100,
      })
    ).toBeNull();
  });

  test("rejects files over the size limit", () => {
    expect(
      buildTicketAttachmentPath("user-1", {
        type: "image/png",
        size: MAX_ATTACHMENT_BYTES + 1,
      })
    ).toBeNull();
  });

  test("uses a UUID and MIME-derived extension", () => {
    vi.stubGlobal("crypto", {
      randomUUID: vi.fn(() => "generated-uuid"),
    });

    expect(
      buildTicketAttachmentPath("user-1", {
        type: "image/jpeg",
        size: 100,
      })
    ).toBe("user-1/generated-uuid.jpg");
  });
});
