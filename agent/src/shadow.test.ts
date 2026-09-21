import { describe, expect, it } from "vitest";
import { DEVICE_ACTIONS } from "../../lib/device-agent/catalog";
import type { DiagnosticRecord } from "../../lib/device-agent/protocol";
import { planShadow } from "./shadow";

describe("shadow planner", () => {
  it("plans catalog actions without executing", () => {
    const diagnostics: DiagnosticRecord[] = [
      {
        kind: "dns_resolution",
        collectedAt: "2026-09-15T00:00:00.000Z",
        ok: false,
        summary: "DNS failed",
        data: {},
      },
    ];
    const actions = planShadow(DEVICE_ACTIONS, diagnostics, "linux");
    expect(actions[0]?.actionId).toBe("device_flush_dns");
    expect(actions[0]?.parametersHash).toMatch(/^[a-f0-9]{64}$/);
    expect(actions[0]?.snapshotSpec.length).toBeGreaterThan(0);
  });
});
