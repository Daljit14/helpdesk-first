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

  it("maps security, printer, and audio findings to bounded shadow actions", () => {
    const diagnostics: DiagnosticRecord[] = [
      {
        kind: "security_tool_status",
        collectedAt: "2026-09-15T00:00:00.000Z",
        ok: true,
        summary: "Defender protection is disabled",
        data: { realTimeProtection: false, threatCount: 1 },
      },
      {
        kind: "printers",
        collectedAt: "2026-09-15T00:00:00.000Z",
        ok: true,
        summary: "Printer queue is stuck",
        data: { jobCount: 2, cups: "stopped" },
      },
      {
        kind: "audio",
        collectedAt: "2026-09-15T00:00:00.000Z",
        ok: true,
        summary: "Audio is stopped",
        data: { running: false },
      },
    ];
    const actions = planShadow(DEVICE_ACTIONS, diagnostics, "linux");
    expect(actions.map((action) => action.actionId)).toEqual([
      "device_printer_clear_queue",
      "device_audio_restart",
    ]);
    expect(
      planShadow(DEVICE_ACTIONS, diagnostics, "windows").map(
        (action) => action.actionId
      )
    ).toEqual([
      "device_security_enable_realtime_protection",
      "device_security_remove_detected_threats",
      "device_printer_clear_queue",
      "device_audio_restart",
    ]);
  });
});
