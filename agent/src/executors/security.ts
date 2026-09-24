import type { Executor } from ".";
import { truncate } from "./shared";

const powershell = ["-NoProfile", "-NonInteractive", "-Command"] as const;

function statusValue(output: string, key: string): boolean | null {
  const value = output.match(
    new RegExp(`${key}\\s*[:=]\\s*(true|false)`, "i")
  )?.[1];
  return value ? value.toLowerCase() === "true" : null;
}

const enableRealtime: Executor = {
  actionId: "device_security_enable_realtime_protection",
  platform: "windows",
  snapshot: async (exec) => {
    const output = await exec(
      "powershell.exe",
      [
        ...powershell,
        "Get-MpPreference | Select-Object DisableRealtimeMonitoring | ConvertTo-Json -Compress",
      ],
      { timeoutMs: 30_000 }
    );
    return {
      security: truncate(output),
      realtimeDisabled:
        statusValue(output, "DisableRealtimeMonitoring") ?? false,
    };
  },
  apply: async (exec) => {
    await exec(
      "powershell.exe",
      [...powershell, "Set-MpPreference -DisableRealtimeMonitoring $false"],
      { timeoutMs: 30_000 }
    );
  },
  verify: async (exec) => {
    const output = await exec(
      "powershell.exe",
      [
        ...powershell,
        "Get-MpComputerStatus | Select-Object RealTimeProtectionEnabled",
      ],
      { timeoutMs: 30_000 }
    );
    const enabled = statusValue(output, "RealTimeProtectionEnabled");
    return {
      ok: enabled === true,
      summary: `RealTimeProtectionEnabled=${String(enabled)}`,
    };
  },
  rollback: async (exec, _params, snapshot) => {
    await exec(
      "powershell.exe",
      [
        ...powershell,
        `Set-MpPreference -DisableRealtimeMonitoring $${snapshot.realtimeDisabled === true ? "true" : "false"}`,
      ],
      { timeoutMs: 30_000 }
    );
  },
};

const updateSignatures: Executor = {
  actionId: "device_security_update_signatures",
  platform: "windows",
  snapshot: async (exec) => {
    const output = await exec(
      "powershell.exe",
      [
        ...powershell,
        "Get-MpComputerStatus | Select-Object AntivirusSignatureLastUpdated",
      ],
      { timeoutMs: 30_000 }
    );
    return { signatureTimestamp: truncate(output) };
  },
  apply: async (exec) => {
    await exec("powershell.exe", [...powershell, "Update-MpSignature"], {
      timeoutMs: 120_000,
    });
  },
  verify: async (exec, _params, snapshot) => {
    const output = await exec(
      "powershell.exe",
      [
        ...powershell,
        "Get-MpComputerStatus | Select-Object AntivirusSignatureLastUpdated",
      ],
      { timeoutMs: 30_000 }
    );
    const before = snapshot.signatureTimestamp;
    const beforeDate =
      typeof before === "string" ? Date.parse(before) : Number.NaN;
    const currentMatch = output.match(
      /AntivirusSignatureLastUpdated\s*[:=]\s*(.+)/i
    );
    const currentDate = currentMatch?.[1] ? Date.parse(currentMatch[1]) : NaN;
    const ok =
      Number.isFinite(currentDate) &&
      (!Number.isFinite(beforeDate) || currentDate >= beforeDate);
    return {
      ok,
      summary: `AntivirusSignatureLastUpdated=${currentMatch?.[1]?.trim() ?? "unknown"}`,
    };
  },
};

const removeThreats: Executor = {
  actionId: "device_security_remove_detected_threats",
  platform: "windows",
  snapshot: async (exec) => {
    const output = await exec(
      "powershell.exe",
      [
        ...powershell,
        "Get-MpThreatDetection | Select-Object ThreatID,ThreatName | ConvertTo-Json -Compress",
      ],
      { timeoutMs: 30_000 }
    );
    return { security: truncate(output) };
  },
  apply: async (exec) => {
    await exec("powershell.exe", [...powershell, "Remove-MpThreat"], {
      timeoutMs: 120_000,
    });
  },
  verify: async (exec) => {
    const output = await exec(
      "powershell.exe",
      [
        ...powershell,
        "Get-MpThreatDetection | Select-Object ActionSuccess | ConvertTo-Json -Compress",
      ],
      { timeoutMs: 30_000 }
    );
    const rows = output.match(/ActionSuccess\s*[:=]\s*(true|false)/gi) ?? [];
    const ok =
      rows.length === 0 || rows.every((row) => /true$/i.test(row.trim()));
    return {
      ok,
      summary: ok ? "No active threats reported." : truncate(output),
    };
  },
};

export const windowsSecurityExecutors: readonly Executor[] = [
  enableRealtime,
  updateSignatures,
  removeThreats,
];
