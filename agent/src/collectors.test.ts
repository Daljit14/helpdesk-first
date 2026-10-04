import { describe, expect, it, vi } from "vitest";
import { cameraPrivacyCollector, linuxCollectors } from "./collectors/linux";
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
    expect(records).toHaveLength(12);
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

  it("parses Windows Defender JSON status and threat count", async () => {
    const collector = windowsCollectors.find(
      (candidate) => candidate.kind === "security_tool_status"
    );
    const result = await collector!.run(async () =>
      JSON.stringify({ RealTimeProtectionEnabled: false, ThreatCount: 2 })
    );
    expect(result.data).toEqual({
      realTimeProtection: false,
      threatCount: 2,
    });
  });

  it("keeps Linux printer and audio diagnostics useful when probes exit non-zero", async () => {
    const exec = async (file: string): Promise<string> => {
      if (file === "systemctl" || file === "lpstat") {
        throw new Error("inactive");
      }
      return "";
    };
    const printers = linuxCollectors.find(
      (collector) => collector.kind === "printers"
    );
    const audio = linuxCollectors.find(
      (collector) => collector.kind === "audio"
    );
    const printerResult = await printers!.run(exec);
    const audioResult = await audio!.run(exec);
    expect(printerResult.ok).toBe(true);
    expect(printerResult.data).toEqual({
      names: [],
      jobCount: 0,
      cups: "stopped",
    });
    expect(audioResult.ok).toBe(true);
    expect(audioResult.data).toEqual({
      pipewire: "unknown",
      pulseaudio: "unknown",
      defaultSink: null,
      running: false,
    });
  });

  it("reports stopped macOS audio as a structured running=false finding", async () => {
    const audio = macosCollectors.find(
      (collector) => collector.kind === "audio"
    );
    const result = await audio!.run(async (file) => {
      if (file === "pgrep") throw new Error("coreaudiod is stopped");
      return "{}";
    });
    expect(result.data).toEqual({
      coreaudiod: false,
      running: false,
      defaultOutput: null,
    });
  });

  it("reads Windows camera privacy without returning device names", async () => {
    const camera = windowsCollectors.find(
      (collector) => collector.kind === "camera_privacy"
    );
    const result = await camera!.run(async (file, args) => {
      expect(file).toBe("powershell.exe");
      expect(args.at(-1)).toContain("Get-PnpDevice -Class Camera,Image");
      expect(args.at(-1)).toContain("ConvertTo-Json -Compress");
      return JSON.stringify({
        UserAccess: "Deny",
        SystemAccess: "Allow",
        DevicesPresent: 1,
        Name: "Fake Camera App Name",
      });
    });
    expect(result.data).toEqual({
      userAccess: "deny",
      systemAccess: "allow",
      devicesPresent: 1,
      blocked: true,
    });
    expect(JSON.stringify(result)).not.toContain("Fake Camera App Name");
  });

  it("counts macOS cameras while leaving TCC access unknown", async () => {
    const camera = macosCollectors.find(
      (collector) => collector.kind === "camera_privacy"
    );
    const result = await camera!.run(async (file, args) => {
      expect(file).toBe("system_profiler");
      expect(args).toEqual(["SPCameraDataType", "-json"]);
      return JSON.stringify({
        SPCameraDataType: [{ _name: "Fake Camera App Name" }],
      });
    });
    expect(result.data).toEqual({
      userAccess: "unknown",
      systemAccess: "unknown",
      devicesPresent: 1,
      blocked: false,
    });
    expect(JSON.stringify(result)).not.toContain("Fake Camera App Name");
  });

  it("returns a bounded error when macOS camera profiling fails", async () => {
    const camera = macosCollectors.find(
      (collector) => collector.kind === "camera_privacy"
    );
    const result = await camera!.run(async () => {
      throw new Error("system_profiler unavailable");
    });
    expect(result).toMatchObject({
      kind: "camera_privacy",
      ok: false,
      summary: "Diagnostic unavailable.",
    });
  });

  it("counts Linux camera device nodes without executing a command", async () => {
    const readDirectory = vi.fn(async (path: string) => {
      expect(path).toBe("/dev");
      return ["video0", "video2", "not-video"];
    });
    const camera = cameraPrivacyCollector(readDirectory);
    const exec = vi.fn(async () => "");
    const result = await camera!.run(exec);
    expect(readDirectory).toHaveBeenCalledWith("/dev");
    expect(exec).not.toHaveBeenCalled();
    expect(result.data).toEqual({
      userAccess: "unknown",
      systemAccess: "unknown",
      devicesPresent: 2,
      blocked: false,
    });
  });

  it("returns a bounded error when Windows camera collection fails", async () => {
    const camera = windowsCollectors.find(
      (collector) => collector.kind === "camera_privacy"
    );
    const result = await camera!.run(async () => {
      throw new Error("probe failed");
    });
    expect(result).toMatchObject({
      kind: "camera_privacy",
      ok: false,
      summary: "Diagnostic unavailable.",
    });
  });

  it("returns a bounded error when Linux device enumeration fails", async () => {
    const camera = cameraPrivacyCollector(async () => {
      throw new Error("permission denied");
    });
    const result = await camera!.run(async () => "");
    expect(result).toMatchObject({
      kind: "camera_privacy",
      ok: false,
      summary: "Diagnostic unavailable.",
    });
  });

  it("maps denied Windows microphone access to blocked", async () => {
    const microphone = windowsCollectors.find(
      (collector) => collector.kind === "mic_privacy"
    );
    const result = await microphone!.run(async () =>
      JSON.stringify({
        UserAccess: "Allow",
        SystemAccess: "Deny",
        DevicesPresent: 2,
        FriendlyName: "Fake Microphone App Name",
      })
    );
    expect(result.data).toEqual({
      userAccess: "allow",
      systemAccess: "deny",
      devicesPresent: 2,
      muted: null,
      blocked: true,
    });
    expect(JSON.stringify(result)).not.toContain("Fake Microphone App Name");
  });

  it("returns a bounded error when Windows microphone probing fails", async () => {
    const microphone = windowsCollectors.find(
      (collector) => collector.kind === "mic_privacy"
    );
    const result = await microphone!.run(async () => {
      throw new Error("PowerShell unavailable");
    });
    expect(result).toMatchObject({
      kind: "mic_privacy",
      ok: false,
      summary: "Diagnostic unavailable.",
    });
  });

  it("counts nested macOS audio inputs and detects mute without names", async () => {
    const microphone = macosCollectors.find(
      (collector) => collector.kind === "mic_privacy"
    );
    const result = await microphone!.run(async (file, args) => {
      if (file === "system_profiler") {
        expect(args).toEqual(["SPAudioDataType", "-json"]);
        return JSON.stringify({
          SPAudioDataType: [
            {
              _items: [
                {
                  _name: "Fake Mic App Name",
                  coreaudio_input_source: {},
                },
                {
                  _name: "Fake Device Name",
                  coreaudio_device_input: {},
                },
              ],
            },
          ],
        });
      }
      expect(file).toBe("osascript");
      expect(args).toEqual(["-e", "input volume of (get volume settings)"]);
      return "0";
    });
    expect(result.data).toEqual({
      userAccess: "unknown",
      systemAccess: "unknown",
      devicesPresent: 2,
      muted: true,
      blocked: true,
    });
    expect(JSON.stringify(result)).not.toMatch(/Fake (?:Mic App|Device) Name/);
  });

  it("counts Linux microphone sources and excludes monitor sources", async () => {
    const microphone = linuxCollectors.find(
      (collector) => collector.kind === "mic_privacy"
    );
    const result = await microphone!.run(async (_file, args) =>
      args[0] === "list"
        ? [
            "0 alsa_input.pci Fake Input",
            "1 alsa_output.pci.monitor Fake Monitor",
            "2 alsa_input.usb Another Input",
          ].join("\n")
        : "Mute: no"
    );
    expect(result.data).toEqual({
      userAccess: "unknown",
      systemAccess: "unknown",
      devicesPresent: 2,
      muted: false,
      blocked: false,
    });
    expect(JSON.stringify(result)).not.toMatch(/Fake (?:Input|Monitor)/);
  });

  it("treats failed microphone probes as unknown", async () => {
    const macMic = macosCollectors.find(
      (collector) => collector.kind === "mic_privacy"
    );
    const macResult = await macMic!.run(async (file) => {
      if (file === "system_profiler") {
        return JSON.stringify({ SPAudioDataType: [{ _items: [] }] });
      }
      throw new Error("osascript unavailable");
    });
    expect(macResult.data).toMatchObject({
      devicesPresent: 0,
      muted: null,
      blocked: false,
    });
    const macProfilerFailure = await macMic!.run(async () => {
      throw new Error("system_profiler unavailable");
    });
    expect(macProfilerFailure).toMatchObject({
      kind: "mic_privacy",
      ok: false,
      summary: "Diagnostic unavailable.",
    });

    const linuxMic = linuxCollectors.find(
      (collector) => collector.kind === "mic_privacy"
    );
    const linuxResult = await linuxMic!.run(async () => {
      throw new Error("pactl unavailable");
    });
    expect(linuxResult.data).toMatchObject({
      devicesPresent: null,
      muted: null,
      blocked: false,
    });
  });

  it("counts Windows credentials and expired tickets without identities", async () => {
    const credentials = windowsCollectors.find(
      (collector) => collector.kind === "credential_health"
    );
    const result = await credentials!.run(async (file) => {
      if (file === "cmdkey") {
        return "Currently stored credentials:\nTarget: LegacyGeneric:target=corp-share";
      }
      return [
        "Current LogonId is 0:0xabc",
        "#0> Client: alice@CORP.EXAMPLE",
        "Server: krbtgt/CORP.EXAMPLE@CORP.EXAMPLE",
        "End Time: 1/1/2000 12:00:00 AM (local)",
      ].join("\n");
    });
    expect(result.data).toMatchObject({
      storedCredentials: 1,
      kerberosTickets: 1,
      kerberosExpired: 1,
      stale: true,
    });
    expect(JSON.stringify(result)).not.toMatch(
      /LegacyGeneric:target=corp-share|alice@CORP\.EXAMPLE|krbtgt\/CORP/i
    );
  });

  it("counts macOS Kerberos tickets and treats failed klist as no cache", async () => {
    const credentials = macosCollectors.find(
      (collector) => collector.kind === "credential_health"
    );
    const output = [
      "Default principal: alice@CORP.EXAMPLE",
      "Valid starting Expires Service principal",
      "10/04/26 08:00:00 10/04/26 10:00:00 krbtgt/CORP.EXAMPLE@CORP.EXAMPLE",
      ">>>Expired<<<",
    ].join("\n");
    const result = await credentials!.run(async (_file, args) => {
      if (args[0] === "-s") throw new Error("expired cache");
      return output;
    });
    expect(result.data).toEqual({
      storedCredentials: null,
      kerberosTickets: 1,
      kerberosExpired: 1,
      stale: true,
    });
    expect(JSON.stringify(result)).not.toMatch(
      /alice@CORP\.EXAMPLE|krbtgt\/CORP/i
    );

    const noCache = await credentials!.run(async () => {
      throw new Error("no credentials cache");
    });
    expect(noCache.data).toEqual({
      storedCredentials: null,
      kerberosTickets: 0,
      kerberosExpired: 0,
      stale: false,
    });
  });

  it("treats failed Windows klist as unknown Kerberos counts", async () => {
    const credentials = windowsCollectors.find(
      (collector) => collector.kind === "credential_health"
    );
    const result = await credentials!.run(async (file) => {
      if (file === "cmdkey") return "Target: LegacyGeneric:target=corp-share";
      throw new Error("klist unavailable");
    });
    expect(result.data).toEqual({
      storedCredentials: 1,
      kerberosTickets: null,
      kerberosExpired: null,
      stale: false,
    });
    expect(JSON.stringify(result)).not.toContain(
      "LegacyGeneric:target=corp-share"
    );
  });

  it("reports no Linux Kerberos tickets when no cache is available", async () => {
    const credentials = linuxCollectors.find(
      (collector) => collector.kind === "credential_health"
    );
    const result = await credentials!.run(async () => {
      throw new Error("no credentials cache");
    });
    expect(result.data).toEqual({
      storedCredentials: null,
      kerberosTickets: 0,
      kerberosExpired: 0,
      stale: false,
    });
  });

  it("counts Linux Kerberos ticket rows without returning principals", async () => {
    const credentials = linuxCollectors.find(
      (collector) => collector.kind === "credential_health"
    );
    const result = await credentials!.run(async (_file, args) => {
      if (args[0] === "-s") throw new Error("ticket cache expired");
      return [
        "Default principal: alice@CORP.EXAMPLE",
        "Valid starting Expires Service principal",
        "10/04/26 08:00:00 10/04/26 10:00:00 krbtgt/CORP.EXAMPLE@CORP.EXAMPLE",
        ">>>Expired<<<",
      ].join("\n");
    });
    expect(result.data).toEqual({
      storedCredentials: null,
      kerberosTickets: 1,
      kerberosExpired: 1,
      stale: true,
    });
    expect(JSON.stringify(result)).not.toMatch(
      /alice@CORP\.EXAMPLE|krbtgt\/CORP/i
    );
  });
});
