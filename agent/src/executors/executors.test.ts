import { mkdir, rm, utimes, writeFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { AgentExec } from "../collectors/index";
import { DEVICE_ACTIONS } from "../../../lib/device-agent/catalog";
import { WINDOWS_SERVICE_COMMANDS } from "../service-maps";
import { getExecutor } from ".";
import { cleanupExecutor } from "./cleanup";

type Call = { file: string; args: string[] };

function fakeExec(
  output: (file: string, args: string[]) => string = () => ""
): { exec: AgentExec; calls: Call[] } {
  const calls: Call[] = [];
  return {
    calls,
    exec: async (file, args) => {
      calls.push({ file, args });
      return output(file, args);
    },
  };
}

const platforms = ["windows", "macos", "linux"] as const;

describe("device executors", () => {
  it.each(platforms)("registers every catalog executor on %s", (platform) => {
    for (const action of DEVICE_ACTIONS.filter(
      (candidate) =>
        candidate.sideEffects === "local_write" &&
        candidate.platforms.includes(platform)
    ))
      expect(getExecutor(action.id, platform)).not.toBeNull();
  });

  it.each(platforms)("flushes DNS with fixed argv on %s", async (platform) => {
    const fake = fakeExec((file) => {
      if (platform === "windows" && file === "ipconfig") return "entry\nentry";
      return "";
    });
    const executor = getExecutor("device_flush_dns", platform);
    expect(executor).not.toBeNull();
    const snapshot = await executor!.snapshot(fake.exec, {});
    await executor!.apply(fake.exec, {}, snapshot);
    expect(fake.calls.map(({ file, args }) => [file, ...args])).toEqual(
      platform === "windows"
        ? [
            ["ipconfig", "/displaydns"],
            ["ipconfig", "/flushdns"],
          ]
        : platform === "macos"
          ? [
              ["dscacheutil", "-flushcache"],
              ["killall", "-HUP", "mDNSResponder"],
            ]
          : [["resolvectl", "flush-caches"]]
    );
  });

  it("uses bounded Defender and printer commands on Windows", async () => {
    const fake = fakeExec((file, args) => {
      if (file === "powershell.exe" && args.at(-1)?.includes("DisableRealtime"))
        return "True";
      return "";
    });
    const security = getExecutor(
      "device_security_enable_realtime_protection",
      "windows"
    );
    expect(security).not.toBeNull();
    const securitySnapshot = await security!.snapshot(fake.exec, {});
    await security!.apply(fake.exec, {}, securitySnapshot);
    expect(fake.calls.slice(0, 2)).toEqual([
      {
        file: "powershell.exe",
        args: [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          "(Get-MpPreference).DisableRealtimeMonitoring",
        ],
      },
      {
        file: "powershell.exe",
        args: [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          "Set-MpPreference -DisableRealtimeMonitoring $false",
        ],
      },
    ]);
    const printer = getExecutor("device_printer_clear_queue", "windows");
    expect(printer).not.toBeNull();
    await printer!.snapshot(fake.exec, {});
    expect(fake.calls.at(-1)?.args.at(-1)).toContain("Get-Printer");
  });

  it("parses scalar security status and ISO signature timestamps", async () => {
    const before = "2026-09-20T00:00:00.0000000Z";
    const after = "2026-09-21T00:00:00.0000000Z";
    let signatureReads = 0;
    const fake = fakeExec((file, args) => {
      const command = args.at(-1) ?? "";
      if (file !== "powershell.exe") return "";
      if (command.includes("AntivirusSignatureLastUpdated")) {
        signatureReads += 1;
        return signatureReads === 1 ? before : after;
      }
      if (command.includes("RealTimeProtectionEnabled")) return "False";
      return "";
    });
    const realtime = getExecutor(
      "device_security_enable_realtime_protection",
      "windows"
    );
    const realtimeSnapshot = await realtime!.snapshot(fake.exec, {});
    expect(realtimeSnapshot.realtimeDisabled).toBe(false);
    expect((await realtime!.verify(fake.exec, {}, realtimeSnapshot)).ok).toBe(
      false
    );
    const signatures = getExecutor(
      "device_security_update_signatures",
      "windows"
    );
    const signatureSnapshot = await signatures!.snapshot(fake.exec, {});
    await signatures!.apply(fake.exec, {}, signatureSnapshot);
    expect(
      (await signatures!.verify(fake.exec, {}, signatureSnapshot)).ok
    ).toBe(true);
  });

  it("fails closed when threat verification output is unparseable", async () => {
    const fake = fakeExec(() => "ActionSuccess : True");
    const executor = getExecutor(
      "device_security_remove_detected_threats",
      "windows"
    );
    const result = await executor!.verify(fake.exec, {}, {});
    expect(result.ok).toBe(false);
  });

  it("uses the pulseaudio branch when Linux pipewire is inactive", async () => {
    const calls: Call[] = [];
    const exec: AgentExec = async (file, args) => {
      calls.push({ file, args });
      if (file === "systemctl") throw new Error("inactive");
      return "";
    };
    const executor = getExecutor("device_audio_restart", "linux");
    const snapshot = await executor!.snapshot(exec, {});
    expect(snapshot).toMatchObject({
      audio: "inactive",
      backend: "pulseaudio",
    });
    await executor!.apply(exec, {}, snapshot);
    expect(calls.slice(-2)).toEqual([
      { file: "pulseaudio", args: ["-k"] },
      { file: "pulseaudio", args: ["--start"] },
    ]);
  });

  it("treats an absent macOS coreaudiod process as an empty snapshot", async () => {
    const executor = getExecutor("device_audio_restart", "macos");
    let probes = 0;
    const exec: AgentExec = async (file) => {
      if (file === "pgrep") {
        probes += 1;
        if (probes === 1) throw new Error("not running");
        return "1234";
      }
      return "1234";
    };
    expect(await executor!.snapshot(exec, {})).toEqual({ audio: "" });
    expect((await executor!.verify(exec, {}, {})).ok).toBe(true);
  });

  it("requires non-interactive sudo before restarting macOS audio", async () => {
    const calls: Call[] = [];
    const exec: AgentExec = async (file, args) => {
      calls.push({ file, args });
      if (file === "sudo") throw new Error("sudo unavailable");
      return "";
    };
    const executor = getExecutor("device_audio_restart", "macos");
    expect(executor).not.toBeNull();
    await expect(executor!.apply(exec, {}, {})).rejects.toThrow(
      "requires_privilege"
    );
    expect(calls).toEqual([{ file: "sudo", args: ["-n", "true"] }]);
  });

  it.each(platforms)(
    "uses discovered adapter argv and restores it on %s",
    async (platform) => {
      const fake = fakeExec((file, args) => {
        if (
          platform === "windows" &&
          file === "powershell.exe" &&
          args.some((arg) => arg.includes("Get-NetAdapter"))
        )
          return '{"Name":"Ethernet","Status":"Up","MacAddress":"x"}';
        if (platform === "macos" && file === "networksetup")
          return "An asterisk (*) indicates that a network service is disabled.\nWi-Fi";
        if (platform === "linux" && file === "nmcli") return "eth0:connected";
        return "ip";
      });
      const executor = getExecutor("device_reset_network_adapter", platform);
      expect(executor).not.toBeNull();
      const snapshot = await executor!.snapshot(fake.exec, {});
      await executor!.apply(fake.exec, {}, snapshot);
      await executor!.rollback?.(fake.exec, {}, snapshot);
      const calls = fake.calls.map(({ file, args }) => [file, ...args]);
      expect(calls.length).toBeGreaterThanOrEqual(3);
      if (platform === "windows") {
        expect(calls[2]).toEqual([
          "powershell.exe",
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          "Restart-NetAdapter -Name 'Ethernet' -Confirm:$false",
        ]);
      } else if (platform === "macos") {
        expect(calls.slice(-3)).toEqual([
          ["networksetup", "-setnetworkserviceenabled", "Wi-Fi", "off"],
          ["networksetup", "-setnetworkserviceenabled", "Wi-Fi", "on"],
          ["networksetup", "-setnetworkserviceenabled", "Wi-Fi", "on"],
        ]);
      } else {
        expect(calls.slice(-3)).toEqual([
          ["nmcli", "device", "disconnect", "eth0"],
          ["nmcli", "device", "connect", "eth0"],
          ["nmcli", "device", "connect", "eth0"],
        ]);
      }
    }
  );

  it("rejects unsafe Windows adapter names before building PowerShell", async () => {
    const fake = fakeExec();
    const executor = getExecutor("device_reset_network_adapter", "windows");
    expect(executor).not.toBeNull();
    await expect(
      executor!.apply(fake.exec, {}, { adapterName: "Ethernet; Write-Host x" })
    ).rejects.toThrow("adapter_not_found");
    expect(fake.calls).toHaveLength(0);
  });

  it.each(platforms)(
    "passes Wi-Fi SSID as one argv on %s",
    async (platform) => {
      const fake = fakeExec((file, args) => {
        if (platform === "windows" && file === "netsh")
          return "State : connected\nSSID : Office";
        if (
          platform === "macos" &&
          file === "networksetup" &&
          args.includes("-listallhardwareports")
        )
          return "Hardware Port: Wi-Fi\nDevice: en0";
        if (platform === "macos" && file === "networksetup")
          return "Current Wi-Fi Network: Office";
        if (platform === "linux" && file === "nmcli") return "yes:Office";
        return "Hardware Port: Wi-Fi\nDevice: en0";
      });
      const executor = getExecutor("device_reset_wifi_profile", platform);
      expect(executor).not.toBeNull();
      const snapshot = await executor!.snapshot(fake.exec, {});
      await executor!.apply(fake.exec, { ssid: "Office" }, snapshot);
      const last = fake.calls.at(-1);
      expect(last?.args.some((arg) => arg.includes("Office"))).toBe(true);
      expect(last?.args.join(" ")).not.toContain("&&");
    }
  );

  it("guards Windows service commands and rejects unsupported macOS services", async () => {
    expect(
      Object.values(WINDOWS_SERVICE_COMMANDS).every((command) =>
        /^[A-Za-z0-9_.-]+$/.test(command)
      )
    ).toBe(true);
    const fake = fakeExec((file) =>
      file === "launchctl" ? "running" : "active"
    );
    const linux = getExecutor("device_restart_service", "linux");
    expect(linux).not.toBeNull();
    const linuxSnapshot = await linux!.snapshot(fake.exec, {
      serviceName: "vpn",
    });
    await linux!.apply(fake.exec, { serviceName: "vpn" }, linuxSnapshot);
    expect(fake.calls.slice(-2)).toEqual([
      { file: "systemctl", args: ["is-active", "openvpn"] },
      { file: "systemctl", args: ["restart", "openvpn"] },
    ]);
    const windows = getExecutor("device_restart_service", "windows");
    expect(windows).not.toBeNull();
    const windowsSnapshot = await windows!.snapshot(fake.exec, {
      serviceName: "vpn",
    });
    await windows!.apply(fake.exec, { serviceName: "vpn" }, windowsSnapshot);
    expect(fake.calls.at(-1)).toEqual({
      file: "powershell.exe",
      args: [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "Restart-Service -Name 'RasMan' -Force",
      ],
    });
    const mac = getExecutor("device_restart_service", "macos");
    await expect(
      mac!.snapshot(fake.exec, { serviceName: "vpn" })
    ).rejects.toThrow("unsupported_on_platform");
  });

  it("inventories aged files under fixed roots without shell execution", async () => {
    const root = await mkdtemp(join(tmpdir(), "helpdesk-cleanup-"));
    await mkdir(join(root, "nested"));
    const file = join(root, "nested", "old.tmp");
    await writeFile(file, "old");
    const old = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    await utimes(file, old, old);
    const executor = cleanupExecutor("linux", () => [root]);
    const fake = fakeExec(() => "filesystem 100 50 50 50%");
    const snapshot = await executor.snapshot(fake.exec, {});
    expect(snapshot).toMatchObject({ files: 1, bytes: 3 });
    await executor.apply(fake.exec, {}, snapshot);
    await expect(
      import("node:fs/promises").then(({ stat }) => stat(file))
    ).rejects.toThrow();
    await rm(root, { recursive: true, force: true });
  });
});
