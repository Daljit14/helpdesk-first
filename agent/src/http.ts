import { randomBytes } from "node:crypto";
import { signRequest } from "./signer";
import { loadAgentState, loadPrivateKey } from "./store";

const VERSION = "1.0.0";

export async function postSigned<T>(
  path: string,
  body: unknown,
  parse: (value: unknown) => T
): Promise<T> {
  const state = await loadAgentState();
  const privateKey = await loadPrivateKey();
  const raw = JSON.stringify(body);
  const url = new URL(path, state.serverUrl);
  const timestamp = String(Date.now());
  const nonce = randomBytes(16).toString("base64url");
  const signature = signRequest(
    privateKey,
    "POST",
    url.pathname,
    timestamp,
    nonce,
    raw
  );
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(url, {
        method: "POST",
        body: raw,
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          "user-agent": `helpdesk-agent/${VERSION}`,
          "x-hd-device": state.deviceId,
          "x-hd-timestamp": timestamp,
          "x-hd-nonce": nonce,
          "x-hd-signature": signature,
        },
      });
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength > 256 * 1024) throw new Error("response_too_large");
      const value: unknown = JSON.parse(Buffer.from(bytes).toString("utf8"));
      if (!response.ok) throw new Error("agent_request_failed");
      return parse(value);
    } catch (error) {
      const retryable =
        error instanceof TypeError ||
        (error instanceof Error && error.name === "AbortError");
      if (attempt === 1 || !retryable) throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error("agent_request_failed");
}
