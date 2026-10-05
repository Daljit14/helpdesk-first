import { describe, expect, it, vi } from "vitest";
import {
  batteryReport,
  connectionReport,
  detectBrowser,
  detectOS,
  formatBytes,
  formatReports,
  mediaErrorGuidance,
  snapRefreshRate,
  storageReport,
  withTimeout,
} from "./diagnostics";
import { CATEGORY_TOOLS, toolsForCategory } from "./tool-registry";
import { CATEGORIES } from "@/lib/issues";

const CHROME_WIN =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const SAFARI_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15";
const EDGE =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0";

describe("self-check diagnostics", () => {
  it("detects common systems and browsers", () => {
    expect(detectOS(CHROME_WIN)).toBe("Windows");
    expect(detectOS(SAFARI_MAC)).toBe("macOS");
    expect(detectOS(SAFARI_MAC, "", 5)).toBe("iPadOS");
    expect(detectOS("", "Android")).toBe("Android");
    expect(detectBrowser(CHROME_WIN)).toEqual({
      name: "Chrome",
      version: "140",
    });
    expect(detectBrowser(EDGE).name).toBe("Edge");
    expect(detectBrowser(SAFARI_MAC)).toEqual({
      name: "Safari",
      version: "18",
    });
  });

  it("formats bytes and ticket summaries", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    const text = formatReports(
      [
        storageReport({
          supported: true,
          usage: 1024,
          quota: 50 * 1024 ** 3,
          persisted: null,
        }),
      ],
      new Date(0)
    );
    expect(text).toContain("HelpDesk First self-check");
    expect(text).toContain("Storage: There's plenty of room");
    expect(text).toContain("- Used by this site: 1.0 KB");
  });

  it("gives plain-language verdicts", () => {
    expect(connectionReport(false, null).tone).toBe("bad");
    expect(connectionReport(true, null).tone).toBe("info");
    expect(
      connectionReport(true, {
        effectiveType: "3g",
        downlinkMbps: 0.8,
        rttMs: 400,
        saveData: false,
      }).tone
    ).toBe("warn");
    expect(
      batteryReport({
        supported: true,
        level: 0.1,
        charging: false,
        chargingTime: Infinity,
        dischargingTime: 1200,
      }).tone
    ).toBe("warn");
    expect(storageReport({ supported: false }).tone).toBe("info");
    expect(
      mediaErrorGuidance({ name: "NotAllowedError" }, "camera").verdict
    ).toBe("Camera access was blocked.");
    expect(
      mediaErrorGuidance({ name: "NotFoundError" }, "microphone").verdict
    ).toBe("No microphone was found.");
  });

  it("maps every guide category to at least one tool", () => {
    for (const category of CATEGORIES) {
      expect(CATEGORY_TOOLS[category.id]?.length ?? 0).toBeGreaterThan(0);
    }
    expect(toolsForCategory("network")[0]).toBe("speed-test");
    expect(toolsForCategory("unknown")).toEqual(["device"]);
  });
});

describe("robustness helpers", () => {
  it("withTimeout resolves with the fallback when a promise never settles", async () => {
    vi.useFakeTimers();
    const never = new Promise<string>(() => undefined);
    const pending = withTimeout(never, 1000, "fallback");
    await vi.advanceTimersByTimeAsync(1001);
    await expect(pending).resolves.toBe("fallback");
    vi.useRealTimers();
  });

  it("withTimeout passes through results and swallows rejections", async () => {
    await expect(withTimeout(Promise.resolve(5), 1000, 0)).resolves.toBe(5);
    await expect(
      withTimeout(Promise.reject(new Error("x")), 1000, 0)
    ).resolves.toBe(0);
  });

  it("snaps frame gaps to common refresh rates", () => {
    expect(snapRefreshRate(16.7)).toBe(60);
    expect(snapRefreshRate(6.9)).toBe(144);
    expect(snapRefreshRate(8.4)).toBe(120);
    expect(snapRefreshRate(0)).toBeNull();
    expect(snapRefreshRate(Number.NaN)).toBeNull();
  });

  it("a failed reachability probe overrides the browser's online flag", () => {
    const failed = connectionReport(true, null, null);
    expect(failed.tone).toBe("bad");
    expect(failed.verdict).toMatch(/couldn't reach this site/);
    expect(connectionReport(true, null, 40).tone).toBe("info");
    const slow = connectionReport(
      true,
      { effectiveType: "4g", downlinkMbps: 20, rttMs: 50, saveData: false },
      1500
    );
    expect(slow.tone).toBe("warn");
    expect(slow.lines).toContainEqual(["Reaches this site", "Yes (1500 ms)"]);
  });

  it("explains small storage quotas without claiming the disk is full", () => {
    const report = storageReport({
      supported: true,
      usage: 0,
      quota: 200 * 1024 ** 2,
      persisted: null,
    });
    expect(report.tone).toBe("warn");
    expect(report.tip).toMatch(/private\/incognito/);
  });
});
