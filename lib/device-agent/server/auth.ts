import { createRateLimiter } from "@/lib/ai/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { isDeviceAgentEnabled } from "@/lib/admin/flags";
import { isValidNonce } from "@/lib/device-agent/protocol";
import { canonicalString, sha256Hex, verifyDeviceSignature } from "./signing";

const MAX_BODY = 64 * 1024;
const SKEW_MS = 5 * 60 * 1000;
const deviceLimiter = createRateLimiter(
  { windowMs: 60_000, maxRequests: 120 },
  "device-agent"
);

export type DeviceRow = {
  id: string;
  organization_id: string;
  user_id: string | null;
  device_class: "managed" | "byod";
  platform: "windows" | "macos" | "linux";
  hostname: string;
  agent_version: string;
  public_key: string;
  catalog_version: string;
  status: "active" | "revoked";
};

export type DeviceAuthResult =
  | { ok: true; device: DeviceRow }
  | {
      ok: false;
      status: 401 | 403 | 409 | 413 | 429;
      code:
        | "missing_headers"
        | "unknown_device"
        | "revoked"
        | "skew"
        | "replay"
        | "bad_signature"
        | "too_large"
        | "rate_limited";
    };

export async function authenticateDeviceRequest(
  admin: ReturnType<typeof createAdminClient>,
  request: Request,
  rawBody: string
): Promise<DeviceAuthResult> {
  if (!isDeviceAgentEnabled())
    return { ok: false, status: 403, code: "unknown_device" };
  if (Buffer.byteLength(rawBody, "utf8") > MAX_BODY)
    return { ok: false, status: 413, code: "too_large" };
  const deviceId = request.headers.get("x-hd-device");
  const timestamp = request.headers.get("x-hd-timestamp");
  const nonce = request.headers.get("x-hd-nonce");
  const signature = request.headers.get("x-hd-signature");
  if (!deviceId || !timestamp || !nonce || !signature || !isValidNonce(nonce))
    return { ok: false, status: 401, code: "missing_headers" };
  const { data } = await admin
    .from("devices")
    .select(
      "id,organization_id,user_id,device_class,platform,hostname,agent_version,public_key,catalog_version,status"
    )
    .eq("id", deviceId)
    .maybeSingle();
  const device = data as DeviceRow | null;
  if (!device) return { ok: false, status: 401, code: "unknown_device" };
  if (device.status !== "active")
    return { ok: false, status: 403, code: "revoked" };
  const timestampMs = Number(timestamp);
  if (
    !Number.isSafeInteger(timestampMs) ||
    Math.abs(Date.now() - timestampMs) > SKEW_MS
  )
    return { ok: false, status: 401, code: "skew" };
  const canonical = canonicalString(
    request.method,
    new URL(request.url).pathname,
    timestamp,
    nonce,
    sha256Hex(rawBody)
  );
  if (
    !verifyDeviceSignature({
      publicKeyB64: device.public_key,
      signatureB64: signature,
      canonical,
    })
  )
    return { ok: false, status: 401, code: "bad_signature" };
  const inserted = await admin.from("device_nonces").insert({
    device_id: device.id,
    nonce,
    expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
  });
  if (inserted.error) return { ok: false, status: 409, code: "replay" };
  const limited = await deviceLimiter.check(device.id);
  if (!limited.allowed) return { ok: false, status: 429, code: "rate_limited" };
  await admin
    .from("devices")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", device.id);
  return { ok: true, device };
}
