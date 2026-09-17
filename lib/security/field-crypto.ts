import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { isOrgEncryptionEnabled } from "@/lib/security/data-protection-config";
import { getActiveOrgKey, getOrgKeyVersion } from "@/lib/security/org-keys";
import { createAdminClient } from "@/lib/supabase/admin";

export type FieldRef = {
  table:
    | "tickets"
    | "ticket_comments"
    | "ticket_investigations"
    | "ticket_attachments";
  column: string;
};

export class DataProtectionError extends Error {
  readonly code:
    "master_key_missing" | "decrypt_failed" | "organization_missing";

  constructor(
    code: "master_key_missing" | "decrypt_failed" | "organization_missing"
  ) {
    super(code);
    this.name = "DataProtectionError";
    this.code = code;
  }
}

type Admin = ReturnType<typeof createAdminClient>;
const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;

export function isEncryptedField(value: unknown): boolean {
  return typeof value === "string" && value.startsWith("enc:1:");
}

function aad(organizationId: string, ref: FieldRef): Buffer {
  return Buffer.from(`${organizationId}|${ref.table}.${ref.column}`, "utf8");
}

function encode(
  version: number,
  iv: Buffer,
  tag: Buffer,
  ciphertext: Buffer
): string {
  return `enc:1:${version}:${iv.toString("base64")}:${tag.toString("base64")}:${ciphertext.toString("base64")}`;
}

export async function encryptText(
  admin: Admin,
  organizationId: string,
  ref: FieldRef,
  plaintext: string
): Promise<string> {
  if (!isOrgEncryptionEnabled()) return plaintext;
  let key;
  try {
    key = await getActiveOrgKey(admin, organizationId);
  } catch {
    throw new DataProtectionError("master_key_missing");
  }
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key.dek, iv);
  cipher.setAAD(aad(organizationId, ref));
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  return encode(key.keyVersion, iv, cipher.getAuthTag(), ciphertext);
}

export async function decryptText(
  admin: Admin,
  organizationId: string,
  ref: FieldRef,
  stored: string | null
): Promise<string | null> {
  if (stored === null || !isEncryptedField(stored)) return stored;
  try {
    const parts = stored.split(":");
    if (parts.length !== 6) throw new Error("invalid envelope");
    const key = await getOrgKeyVersion(admin, organizationId, Number(parts[2]));
    const decipher = createDecipheriv(
      ALGORITHM,
      key.dek,
      Buffer.from(parts[3], "base64")
    );
    decipher.setAAD(aad(organizationId, ref));
    decipher.setAuthTag(Buffer.from(parts[4], "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(parts[5], "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new DataProtectionError("decrypt_failed");
  }
}

export async function encryptJson(
  admin: Admin,
  organizationId: string,
  ref: FieldRef,
  value: unknown
): Promise<unknown> {
  if (!isOrgEncryptionEnabled()) return value;
  return {
    $enc: await encryptText(admin, organizationId, ref, JSON.stringify(value)),
  };
}

export async function decryptJson<T>(
  admin: Admin,
  organizationId: string,
  ref: FieldRef,
  stored: unknown
): Promise<T | null> {
  if (stored === null || stored === undefined) return null;
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) {
    return stored as T;
  }
  const encoded = (stored as { $enc?: unknown }).$enc;
  if (typeof encoded !== "string") return stored as T;
  const plaintext = await decryptText(admin, organizationId, ref, encoded);
  return plaintext === null ? null : (JSON.parse(plaintext) as T);
}
