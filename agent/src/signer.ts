import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { canonicalRequestString } from "../../lib/device-agent/protocol";

export function generateDeviceKeyPair(): {
  publicKey: string;
  privateKeyPem: string;
} {
  const pair = generateKeyPairSync("ed25519");
  const publicDer = pair.publicKey.export({ format: "der", type: "spki" });
  return {
    publicKey: publicDer.subarray(-32).toString("base64"),
    privateKeyPem: pair.privateKey
      .export({ format: "pem", type: "pkcs8" })
      .toString(),
  };
}

export function signRequest(
  privateKeyPem: string,
  method: string,
  path: string,
  timestamp: string,
  nonce: string,
  body: string
): string {
  const bodyHash = createHash("sha256").update(body).digest("hex");
  const canonical = canonicalRequestString(
    method,
    path,
    timestamp,
    nonce,
    bodyHash
  );
  return sign(null, Buffer.from(canonical), privateKeyPem).toString("base64");
}
