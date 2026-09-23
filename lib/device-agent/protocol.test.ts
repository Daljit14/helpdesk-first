import { describe, expect, it } from "vitest";
import {
  diagnosticsBatchSchema,
  enrollRequestSchema,
  heartbeatResponseSchema,
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
