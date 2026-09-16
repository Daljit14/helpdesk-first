import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;

function keyFromEnvironment(): Buffer {
  const encoded = process.env.HELP_DESK_CONNECTOR_KEY;
  if (!encoded) throw new Error("HELP_DESK_CONNECTOR_KEY is not configured");
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) {
    throw new Error("HELP_DESK_CONNECTOR_KEY must decode to 32 bytes");
  }
  return key;
}

export type SealedSecret = {
  version: 1;
  iv: string;
  tag: string;
  ciphertext: string;
};

export function sealSecret(value: string, key = keyFromEnvironment()): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  return JSON.stringify({
    version: 1,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  } satisfies SealedSecret);
}

export function openSecret(
  encoded: string,
  key = keyFromEnvironment()
): string {
  const sealed = JSON.parse(encoded) as SealedSecret;
  if (
    sealed.version !== 1 ||
    typeof sealed.iv !== "string" ||
    typeof sealed.tag !== "string" ||
    typeof sealed.ciphertext !== "string"
  ) {
    throw new Error("Invalid sealed secret");
  }
  const decipher = createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(sealed.iv, "base64")
  );
  decipher.setAuthTag(Buffer.from(sealed.tag, "base64").subarray(0, TAG_BYTES));
  return Buffer.concat([
    decipher.update(Buffer.from(sealed.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

export function isConnectorKeyValid(
  value = process.env.HELP_DESK_CONNECTOR_KEY
) {
  if (!value) return false;
  try {
    return Buffer.from(value, "base64").length === 32;
  } catch {
    return false;
  }
}
