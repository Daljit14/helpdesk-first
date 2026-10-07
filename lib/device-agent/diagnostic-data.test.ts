import { describe, expect, test } from "vitest";
import { APP_DISPLAY_NAMES } from "../../agent/src/collectors/error-events";
import {
  DIAGNOSTIC_CRASHED_APP_DISPLAY_NAMES,
  signedIdentifiersFromRecord,
  sanitizeDiagnosticRecord,
} from "./diagnostic-data";

describe("signedIdentifiersFromRecord", () => {
  test("extracts only allowlisted strings and bounded string arrays", () => {
    expect(
      signedIdentifiersFromRecord("wifi_status", {
        ssid: "Contoso-Corp",
        summary: "Guest-Open",
        names: ["ignored"],
      })
    ).toEqual(["Contoso-Corp"]);
    expect(
      signedIdentifiersFromRecord("printers", {
        names: ["Office Printer", 42, "x".repeat(81), "Lab Printer"],
        summary: "Guest-Open",
      })
    ).toEqual(["Office Printer", "Lab Printer"]);
    expect(
      signedIdentifiersFromRecord("printers", {
        names: Array.from({ length: 41 }, (_, index) => `printer-${index}`),
      })
    ).toHaveLength(40);
  });

  test("never extracts free text or recent error app names", () => {
    expect(
      signedIdentifiersFromRecord("recent_error_events", {
        crashedApps: ["Outlook"],
        summary: "Use Guest-Open",
      })
    ).toEqual([]);
    expect(
      signedIdentifiersFromRecord("wifi_status", {
        ssid: "",
        summary: "Guest-Open",
      })
    ).toEqual([]);
  });
});

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
