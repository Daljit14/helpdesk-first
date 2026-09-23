import { z } from "zod";

export const PROTOCOL_VERSION = 1;

export const devicePlatformSchema = z.enum(["windows", "macos", "linux"]);
export type DevicePlatform = z.infer<typeof devicePlatformSchema>;
export const deviceClassSchema = z.enum(["managed", "byod"]);
export type DeviceClass = z.infer<typeof deviceClassSchema>;

const semverish = z.string().regex(/^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/);
const base64 = z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/);
const base64url = z.string().regex(/^[A-Za-z0-9_-]+$/);
const boundedData = z
  .record(
    z.string().max(80),
    z.union([z.string().max(500), z.number(), z.boolean(), z.null()])
  )
  .refine((value) => Object.keys(value).length <= 40);

export const enrollRequestSchema = z
  .object({
    token: z.string().min(32).max(128),
    platform: devicePlatformSchema,
    hostname: z.string().min(1).max(128),
    agentVersion: semverish,
    publicKey: base64.length(44),
  })
  .strict();

export const enrollResponseSchema = z
  .object({
    deviceId: z.guid(),
    organizationId: z.guid(),
    pollIntervalSec: z.number().int().min(60).max(3600),
    catalogVersion: z.string().min(1).max(80),
  })
  .strict();

export const heartbeatRequestSchema = z
  .object({
    agentVersion: semverish,
    catalogVersion: z.string().min(1).max(80),
    uptimeSec: z.number().int().nonnegative(),
  })
  .strict();

export const heartbeatResponseSchema = z
  .object({
    pollIntervalSec: z.number().int().min(60).max(3600),
    killSwitch: z.boolean(),
    executionEnabled: z.boolean(),
    catalogVersion: z.string().min(1).max(80),
    revoked: z.boolean(),
  })
  .strict();

export const diagnosticKindSchema = z.enum([
  "network_status",
  "dns_resolution",
  "wifi_status",
  "vpn_status",
  "disk_space",
  "pending_updates",
  "service_status",
  "browser_extensions",
  "security_tool_status",
]);
export type DiagnosticKind = z.infer<typeof diagnosticKindSchema>;

export const diagnosticRecordSchema = z
  .object({
    kind: diagnosticKindSchema,
    collectedAt: z.string().datetime(),
    ok: z.boolean(),
    summary: z.string().min(1).max(500),
    data: boundedData.default({}),
    error: z.string().max(500).optional(),
  })
  .strict();

export const diagnosticsBatchSchema = z
  .object({
    records: z.array(diagnosticRecordSchema).min(1).max(20),
    ticketReference: z
      .string()
      .regex(/^TCK-[A-Z0-9]{8}$/)
      .optional(),
  })
  .strict();

export const shadowActionSchema = z
  .object({
    actionId: z
      .string()
      .regex(/^device_[a-z0-9_]+$/)
      .max(100),
    actionVersion: z.number().int().positive(),
    parametersHash: z.string().regex(/^[a-f0-9]{64}$/),
    reason: z.string().min(1).max(500),
    evidenceKinds: z.array(diagnosticKindSchema).max(9),
    snapshotSpec: z.array(z.string().min(1).max(100)).max(10),
    irreversible: z.boolean(),
  })
  .strict();

export const shadowBatchSchema = z
  .object({ actions: z.array(shadowActionSchema).min(1).max(10) })
  .strict();

const jobOutputSchema = z
  .record(
    z.string().max(80),
    z.union([z.string().max(500), z.number(), z.boolean(), z.null()])
  )
  .refine((value) => Object.keys(value).length <= 40);

export const jobPollResponseSchema = z
  .object({
    jobs: z.array(
      z
        .object({
          id: z.guid(),
          actionId: z.string().regex(/^device_[a-z0-9_]+$/),
          actionVersion: z.number().int().positive(),
          parameters: z.record(z.string(), z.unknown()),
          mode: z.enum(["shadow", "execute"]),
          kind: z.enum(["action", "rollback"]),
          rollbackOf: z.guid().nullable(),
          expiresAt: z.string().datetime(),
          snapshotSpec: z.array(z.string().max(100)).max(10),
        })
        .strict()
    ),
  })
  .strict();

export const jobReportSchema = z
  .object({
    status: z.enum(["succeeded", "failed", "shadowed", "unsupported"]),
    output: jobOutputSchema.default({}),
    snapshot: z
      .object({
        hash: z.string().min(1).max(200),
        kinds: z.array(z.string().max(100)).max(10),
      })
      .strict()
      .optional(),
    diagnostics: z.array(diagnosticRecordSchema).max(20).optional(),
    error: z.string().max(500).optional(),
  })
  .strict();

export const deviceActionPublicSchema = z
  .object({
    id: z.string().regex(/^device_/),
    version: z.number().int().positive(),
    category: z.enum(["network", "security", "endpoint", "peripheral"]),
    platforms: z.array(devicePlatformSchema),
    description: z.string(),
    riskLevel: z.enum(["safe", "caution"]),
    sideEffects: z.enum(["read_only", "local_write"]),
    reversible: z.boolean(),
    irreversible: z.boolean(),
    consent: z.enum(["none", "user"]),
    snapshotSpec: z.array(z.string()),
    requiresDiagnostics: z.array(diagnosticKindSchema),
    owner: z.string(),
    reviewDate: z.string(),
  })
  .strict();
export type DeviceActionPublic = z.infer<typeof deviceActionPublicSchema>;

export const catalogResponseSchema = z
  .object({
    version: z.string().min(1),
    actions: z.array(deviceActionPublicSchema),
  })
  .strict();

export function canonicalRequestString(
  method: string,
  path: string,
  timestamp: string,
  nonce: string,
  bodySha256Hex: string
): string {
  return `${method}\n${path}\n${timestamp}\n${nonce}\n${bodySha256Hex}`;
}

export function isValidNonce(value: string): boolean {
  return value.length === 22 && base64url.safeParse(value).success;
}

export type EnrollRequest = z.infer<typeof enrollRequestSchema>;
export type EnrollResponse = z.infer<typeof enrollResponseSchema>;
export type HeartbeatRequest = z.infer<typeof heartbeatRequestSchema>;
export type HeartbeatResponse = z.infer<typeof heartbeatResponseSchema>;
export type DiagnosticRecord = z.infer<typeof diagnosticRecordSchema>;
export type DiagnosticsBatch = z.infer<typeof diagnosticsBatchSchema>;
export type ShadowAction = z.infer<typeof shadowActionSchema>;
export type ShadowBatch = z.infer<typeof shadowBatchSchema>;
export type JobPollResponse = z.infer<typeof jobPollResponseSchema>;
export type JobReport = z.infer<typeof jobReportSchema>;
