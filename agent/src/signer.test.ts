import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { verifyDeviceSignature } from "../../lib/device-agent/server/signing";
import { canonicalRequestString } from "../../lib/device-agent/protocol";
import { generateDeviceKeyPair, signRequest } from "./signer";

describe("device signer", () => {
  it("verifies an untampered canonical request and rejects changes", () => {
    const keys = generateDeviceKeyPair();
    const timestamp = "1700000000000";
    const nonce = "1234567890123456789012";
    const bodyHash = createHash("sha256").update("{}").digest("hex");
    const signature = signRequest(
      keys.privateKeyPem,
      "POST",
      "/api/agent/heartbeat",
      timestamp,
      nonce,
      "{}"
    );
    expect(
      verifyDeviceSignature({
        publicKeyB64: keys.publicKey,
        signatureB64: signature,
        canonical: canonicalRequestString(
          "POST",
          "/api/agent/heartbeat",
          timestamp,
          nonce,
          bodyHash
        ),
      })
    ).toBe(true);
    expect(
      verifyDeviceSignature({
        publicKeyB64: keys.publicKey,
        signatureB64: signature,
        canonical: canonicalRequestString(
          "POST",
          "/api/agent/heartbeat",
          timestamp,
          nonce,
          `${bodyHash}tampered`
        ),
      })
    ).toBe(false);
  });
});
