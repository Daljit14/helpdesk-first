import type { Executor } from ".";
import { parseJsonRows } from "../collectors/shared";
import { truncate } from "./shared";

const powershell = ["-NoProfile", "-NonInteractive", "-Command"] as const;

function statusValue(output: string, key?: string): boolean | null {
  const scalar = output.trim().match(/^(true|false)$/i)?.[1];
  if (scalar) return scalar.toLowerCase() === "true";
  if (!key) return null;
  const value = parseJsonRows(output)[0]?.[key];
  return typeof value === "boolean" ? value : null;
}

const enableRealtime: Executor = {
  actionId: "device_security_enable_realtime_protection",
  platform: "windows",
  snapshot: async (exec) => {
    const output = await exec(
      "powershell.exe",
      [...powershell, "(Get-MpPreference).DisableRealtimeMonitoring"],
      { timeoutMs: 30_000 }
    );
    return {
      security: truncate(output),
      realtimeDisabled: statusValue(output) ?? false,
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
      [...powershell, "(Get-MpComputerStatus).RealTimeProtectionEnabled"],
      { timeoutMs: 30_000 }
    );
    const enabled = statusValue(output);
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
        "(Get-MpComputerStatus).AntivirusSignatureLastUpdated.ToUniversalTime().ToString('o')",
      ],
      { timeoutMs: 30_000 }
    );
    return { signatureTimestamp: output.trim().slice(0, 500) };
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
        "(Get-MpComputerStatus).AntivirusSignatureLastUpdated.ToUniversalTime().ToString('o')",
      ],
      { timeoutMs: 30_000 }
    );
    const beforeDate =
      typeof snapshot.signatureTimestamp === "string"
        ? Date.parse(snapshot.signatureTimestamp)
        : Number.NaN;
    const currentTimestamp = output.trim();
    const currentDate = Date.parse(currentTimestamp);
    const ok =
      Number.isFinite(currentDate) &&
      (!Number.isFinite(beforeDate) || currentDate >= beforeDate);
    return {
      ok,
      summary: `AntivirusSignatureLastUpdated=${currentTimestamp || "unknown"}`,
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
    const trimmed = output.trim();
    let parsed: unknown;
    try {
      parsed = trimmed ? JSON.parse(trimmed) : [];
    } catch {
      parsed = null;
    }
    const rows = parseJsonRows(output);
    const ok =
      Array.isArray(parsed) && parsed.length === 0
        ? true
        : rows.length > 0 && rows.every((row) => row.ActionSuccess === true);
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
