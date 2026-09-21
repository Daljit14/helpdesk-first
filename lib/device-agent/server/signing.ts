import {
  createHash,
  createPublicKey,
  verify,
  type KeyObject,
} from "node:crypto";
import { canonicalRequestString } from "@/lib/device-agent/protocol";

export function canonicalString(
  method: string,
  path: string,
  timestamp: string,
  nonce: string,
  bodySha256Hex: string
): string {
  return canonicalRequestString(method, path, timestamp, nonce, bodySha256Hex);
}

export function sha256Hex(body: string): string {
  return createHash("sha256").update(body).digest("hex");
}

function rawEd25519PublicKey(publicKeyB64: string): KeyObject {
  const raw = Buffer.from(publicKeyB64, "base64");
  if (raw.length !== 32) throw new Error("invalid public key");
  const spki = Buffer.concat([
    Buffer.from("302a300506032b6570032100", "hex"),
    raw,
  ]);
  return createPublicKey({ key: spki, format: "der", type: "spki" });
}

export function verifyDeviceSignature(input: {
  publicKeyB64: string;
  signatureB64: string;
  canonical: string;
}): boolean {
  try {
    return verify(
      null,
      Buffer.from(input.canonical),
      rawEd25519PublicKey(input.publicKeyB64),
      Buffer.from(input.signatureB64, "base64")
    );
  } catch {
    return false;
  }
}
