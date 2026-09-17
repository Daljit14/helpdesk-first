import { beforeEach, describe, expect, test, vi } from "vitest";

const dek = Buffer.alloc(32, 9);
const { getActiveOrgKey } = vi.hoisted(() => ({
  getActiveOrgKey: vi.fn(),
}));

vi.mock("./org-keys", () => ({
  getActiveOrgKey,
  getOrgKeyVersion: vi.fn(async () => ({
    organizationId: "org-a",
    keyVersion: 1,
    dek,
  })),
}));

import {
  DataProtectionError,
  decryptJson,
  decryptText,
  encryptJson,
  encryptText,
  isEncryptedField,
} from "./field-crypto";

describe("field crypto", () => {
  beforeEach(() => {
    vi.stubEnv("HELP_DESK_ORG_ENCRYPTION_ENABLED", "true");
    vi.stubEnv("HELP_DESK_MASTER_KEY", Buffer.alloc(32, 1).toString("base64"));
    getActiveOrgKey.mockResolvedValue({
      organizationId: "org-a",
      keyVersion: 1,
      dek,
    });
  });

  test("round trips text and JSON with authenticated field context", async () => {
    const admin = {} as Parameters<typeof encryptText>[0];
    const text = await encryptText(
      admin,
      "org-a",
      {
        table: "tickets",
        column: "message",
      },
      "secret"
    );
    expect(isEncryptedField(text)).toBe(true);
    expect(
      await decryptText(
        admin,
        "org-a",
        {
          table: "tickets",
          column: "message",
        },
        text
      )
    ).toBe("secret");

    const encoded = await encryptJson(
      admin,
      "org-a",
      {
        table: "ticket_investigations",
        column: "evidence",
      },
      { fact: "private" }
    );
    expect(
      await decryptJson(
        admin,
        "org-a",
        {
          table: "ticket_investigations",
          column: "evidence",
        },
        encoded
      )
    ).toEqual({ fact: "private" });
  });

  test("passes through writes when disabled and decrypts prefixed values", async () => {
    const admin = {} as Parameters<typeof encryptText>[0];
    const encrypted = await encryptText(
      admin,
      "org-a",
      {
        table: "tickets",
        column: "message",
      },
      "value"
    );
    vi.stubEnv("HELP_DESK_ORG_ENCRYPTION_ENABLED", "false");
    expect(
      await encryptText(
        admin,
        "org-a",
        {
          table: "tickets",
          column: "message",
        },
        "plain"
      )
    ).toBe("plain");
    expect(
      await decryptText(
        admin,
        "org-a",
        {
          table: "tickets",
          column: "message",
        },
        encrypted
      )
    ).toBe("value");
  });

  test("rejects organization and column AAD mismatch", async () => {
    const admin = {} as Parameters<typeof encryptText>[0];
    const encrypted = await encryptText(
      admin,
      "org-a",
      {
        table: "tickets",
        column: "message",
      },
      "value"
    );
    await expect(
      decryptText(
        admin,
        "org-b",
        {
          table: "tickets",
          column: "message",
        },
        encrypted
      )
    ).rejects.toMatchObject({
      code: "decrypt_failed",
    } satisfies Partial<DataProtectionError>);
    await expect(
      decryptText(
        admin,
        "org-a",
        {
          table: "ticket_comments",
          column: "message",
        },
        encrypted
      )
    ).rejects.toMatchObject({ code: "decrypt_failed" });
  });

  test("distinguishes missing master key from unavailable organization keys", async () => {
    const admin = {} as Parameters<typeof encryptText>[0];
    vi.stubEnv("HELP_DESK_MASTER_KEY", "invalid");
    await expect(
      encryptText(
        admin,
        "org-a",
        { table: "tickets", column: "message" },
        "value"
      )
    ).rejects.toMatchObject({ code: "master_key_missing" });

    vi.stubEnv("HELP_DESK_MASTER_KEY", Buffer.alloc(32, 1).toString("base64"));
    getActiveOrgKey.mockRejectedValueOnce(
      new Error("organization_keys unavailable")
    );
    await expect(
      encryptText(
        admin,
        "org-a",
        { table: "tickets", column: "message" },
        "value"
      )
    ).rejects.toMatchObject({ code: "org_key_unavailable" });
  });
});
