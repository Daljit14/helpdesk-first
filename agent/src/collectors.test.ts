import { describe, expect, it } from "vitest";
import { linuxCollectors } from "./collectors/linux";
import { macosCollectors } from "./collectors/macos";
import { windowsCollectors } from "./collectors/windows";

const happyOutput: Record<string, string> = {
  nmcli: "wlan0:wifi:connected:default\neth0:ethernet:disconnected",
  networksetup: "Current Wi-Fi Network: Office",
  scutil: "Connected",
  df: "/dev/root 1000000 400000 600000 40% /",
  printf: "not available",
  systemctl: "active",
  ifconfig: "en0: flags=8863<UP,RUNNING>",
  softwareupdate: "   * Label: Security Update",
  launchctl: "running",
  netsh: "State : connected\nSSID : Office",
  powershell: "True 400000000 1000000000 Up",
};

function fakeExec(
  output: Record<string, string>,
  failure = false
): (file: string, args: string[]) => Promise<string> {
  return async (file) => {
    if (failure) throw new Error("timeout");
    return output[file] ?? output[file.replace(".exe", "")] ?? "";
  };
}

describe("platform collectors", () => {
  it.each([
    ["linux", linuxCollectors],
    ["macos", macosCollectors],
    ["windows", windowsCollectors],
  ])(
    "%s returns structured data for happy output",
    async (_name, collectors) => {
      const records = await Promise.all(
        collectors.map((collector) => collector.run(fakeExec(happyOutput)))
      );
      expect(
        records.find((record) => record.kind === "network_status")?.data
      ).toEqual(expect.objectContaining({ connected: expect.any(Boolean) }));
      expect(
        records.find((record) => record.kind === "wifi_status")?.data
      ).toEqual(
        expect.objectContaining({
          connected: expect.any(Boolean),
        })
      );
      expect(
        records.find((record) => record.kind === "wifi_status")?.data
      ).toHaveProperty("ssid");
      expect(
        records.find((record) => record.kind === "disk_space")?.data
      ).toEqual(
        expect.objectContaining({
          freePercent: expect.any(Number),
          freeGb: expect.any(Number),
        })
      );
      expect(
        records.find((record) => record.kind === "service_status")?.data
      ).toEqual(expect.objectContaining({ vpn: expect.any(String) }));
    }
  );

  it.each([
    ["linux", linuxCollectors],
    ["macos", macosCollectors],
    ["windows", windowsCollectors],
  ])("%s never throws on garbage output", async (_name, collectors) => {
    const records = await Promise.all(
      collectors.map((collector) => collector.run(fakeExec({})))
    );
    expect(records).toHaveLength(7);
    expect(records.every((record) => record.summary.length <= 512)).toBe(true);
    expect(
      records.find((record) => record.kind === "network_status")?.data
    ).toHaveProperty("adaptersUp");
  });

  it.each([
    ["linux", linuxCollectors],
    ["macos", macosCollectors],
    ["windows", windowsCollectors],
  ])("%s bounds command failures", async (_name, collectors) => {
    const network = collectors.find(
      (collector) => collector.kind === "network_status"
    );
    expect(network).toBeDefined();
    const result = await network!.run(fakeExec({}, true));
    expect(result.ok).toBe(false);
    expect(result.summary).toBe("Diagnostic unavailable.");
  });
});
