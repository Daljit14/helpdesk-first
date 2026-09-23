import { describe, expect, it } from "vitest";
import {
  diagnosticsBatchSchema,
  enrollRequestSchema,
  enrollResponseSchema,
  heartbeatResponseSchema,
  jobPollResponseSchema,
} from "./protocol";

describe("device-agent protocol", () => {
  it("rejects unknown fields and accepts resolved heartbeat execution", () => {
    expect(() =>
      enrollRequestSchema.parse({
        token: "hd1_" + "a".repeat(43),
        platform: "linux",
        hostname: "host",
        agentVersion: "1.0.0",
        publicKey: "a".repeat(44),
        extra: true,
      })
    ).toThrow();
    expect(
      heartbeatResponseSchema.parse({
        pollIntervalSec: 300,
        killSwitch: false,
        executionEnabled: true,
        catalogVersion: "1",
        revoked: false,
      })
    ).toMatchObject({ executionEnabled: true });
  });

  it("accepts non-RFC-version ids for organizations, devices and jobs", () => {
    const legacyId = "00000000-0000-0000-0000-000000000001";
    expect(
      enrollResponseSchema.parse({
        deviceId: legacyId,
        organizationId: legacyId,
        pollIntervalSec: 300,
        catalogVersion: "1",
      })
    ).toMatchObject({ organizationId: legacyId });
    expect(
      jobPollResponseSchema.parse({
        jobs: [
          {
            id: legacyId,
            actionId: "device_network_status",
            actionVersion: 1,
            parameters: {},
            mode: "shadow",
            kind: "action",
            expiresAt: new Date().toISOString(),
            snapshotSpec: [],
          },
        ],
      }).jobs
    ).toHaveLength(1);
    expect(() =>
      enrollResponseSchema.parse({
        deviceId: "not-a-uuid",
        organizationId: legacyId,
        pollIntervalSec: 300,
        catalogVersion: "1",
      })
    ).toThrow();
  });

  it("bounds diagnostic batches", () => {
    expect(() => diagnosticsBatchSchema.parse({ records: [] })).toThrow();
    expect(() =>
      diagnosticsBatchSchema.parse({
        records: [
          {
            kind: "dns_resolution",
            collectedAt: new Date().toISOString(),
            ok: false,
            summary: "failed",
          },
        ],
      })
    ).not.toThrow();
  });
});
