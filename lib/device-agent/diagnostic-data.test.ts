import { describe, expect, test } from "vitest";
import { APP_DISPLAY_NAMES } from "../../agent/src/collectors/error-events";
import {
  DIAGNOSTIC_CRASHED_APP_DISPLAY_NAMES,
  sanitizeDiagnosticRecord,
} from "./diagnostic-data";

describe("sanitizeDiagnosticRecord", () => {
  test("keeps only approved recent error counts and app names", () => {
    const result = sanitizeDiagnosticRecord(
      "recent_error_events",
      "Remove-Item -Recurse C:\\Windows was reported by the device.",
      {
        appCrash: 4,
        total: 4,
        windowHours: 24,
        message: "Remove-Item -Recurse C:\\Windows",
        category: "Remove-Item -Recurse C:\\Windows",
        crashedApps: ["Outlook", "Remove-Item -Recurse C:\\Windows"],
      }
    );

    expect(result).toEqual({
      summary: "4 recent error events in the last 24 hours.",
      data: {
        appCrash: 4,
        total: 4,
        windowHours: 24,
        crashedApps: ["Outlook"],
      },
    });
    expect(JSON.stringify(result)).not.toContain("Remove-Item");
  });

  test("drops invalid values and bounds newestAt", () => {
    const result = sanitizeDiagnosticRecord("recent_error_events", "unsafe", {
      total: Number.POSITIVE_INFINITY,
      appHang: -1,
      signIn: null,
      newestAt: "x".repeat(41),
      crashedApps: ["Teams", 42, "unknown"],
      error: "secret",
    });

    expect(result).toEqual({
      summary: "0 recent error events in the last 24 hours.",
      data: { signIn: null, crashedApps: ["Teams"] },
    });
  });

  test("leaves other diagnostic kinds unchanged", () => {
    const data = { command: "Remove-Item -Recurse C:\\Windows" };
    const result = sanitizeDiagnosticRecord("dns_resolution", "summary", data);

    expect(result).toEqual({ summary: "summary", data });
    expect(result.data).toBe(data);
  });

  test("uses the collector's exact crashed-app display-name set", () => {
    expect([...new Set(DIAGNOSTIC_CRASHED_APP_DISPLAY_NAMES)].sort()).toEqual(
      [...new Set(Object.values(APP_DISPLAY_NAMES))].sort()
    );
  });
});
