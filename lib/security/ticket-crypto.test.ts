import { afterEach, describe, expect, test, vi } from "vitest";
import { DataProtectionError, decryptJson, decryptText } from "./field-crypto";
import {
  decryptAttachmentRow,
  decryptCommentRows,
  decryptInvestigationRow,
  decryptTicketRow,
  encryptCommentForWrite,
} from "./ticket-crypto";

vi.mock("./field-crypto", async () => {
  const actual =
    await vi.importActual<typeof import("./field-crypto")>("./field-crypto");
  return {
    ...actual,
    decryptJson: vi.fn(),
    decryptText: vi.fn(),
  };
});

const admin = {} as Parameters<typeof decryptTicketRow>[0];

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ticket crypto read fallbacks", () => {
  test("rejects writes without an organization", async () => {
    vi.stubEnv("HELP_DESK_ORG_ENCRYPTION_ENABLED", "true");
    await expect(
      encryptCommentForWrite(admin, null, "comment")
    ).rejects.toMatchObject({ code: "organization_missing" });
  });

  test("substitutes safe values when ciphertext cannot be decrypted", async () => {
    vi.mocked(decryptText).mockRejectedValue(
      new DataProtectionError("decrypt_failed")
    );
    vi.mocked(decryptJson).mockRejectedValue(
      new DataProtectionError("decrypt_failed")
    );
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      decryptTicketRow(admin, {
        organization_id: "org-a",
        message: "enc:1:1:iv:tag:ciphertext",
      })
    ).resolves.toMatchObject({
      message: "[encrypted — key unavailable]",
    });
    await expect(
      decryptCommentRows(admin, [
        {
          organization_id: "org-a",
          message: "enc:1:1:iv:tag:ciphertext",
        },
      ])
    ).resolves.toEqual([
      {
        organization_id: "org-a",
        message: "[encrypted — key unavailable]",
      },
    ]);
    await expect(
      decryptInvestigationRow(admin, {
        organization_id: "org-a",
        evidence: { $enc: "enc:1:1:iv:tag:ciphertext" },
        escalation_package: { $enc: "enc:1:1:iv:tag:ciphertext" },
      })
    ).resolves.toMatchObject({ evidence: null, escalation_package: null });
    await expect(
      decryptAttachmentRow(admin, {
        organization_id: "org-a",
        scan_detail: "enc:1:1:iv:tag:ciphertext",
      })
    ).resolves.toMatchObject({
      scan_detail: "[encrypted — key unavailable]",
    });
    expect(error).toHaveBeenCalledTimes(5);
    expect(error).toHaveBeenCalledWith("data-protection decrypt_failed", {
      table: "tickets",
      column: "message",
    });
  });
});
