import type { Executor } from ".";
import { truncate } from "./shared";

const powershell = ["-NoProfile", "-NonInteractive", "-Command"] as const;

function printJobSnapshot(output: string) {
  return { printers: truncate(output) };
}

const windowsPrinterClearQueue: Executor = {
  actionId: "device_printer_clear_queue",
  platform: "windows",
  snapshot: async (exec) => {
    const output = await exec(
      "powershell.exe",
      [
        ...powershell,
        "Get-Printer | ForEach-Object { Get-PrintJob -PrinterName $_.Name | Select-Object Id,DocumentName } | ConvertTo-Json -Compress",
      ],
      { timeoutMs: 30_000 }
    );
    return printJobSnapshot(output);
  },
  apply: async (exec) => {
    await exec("powershell.exe", [...powershell, "Stop-Service Spooler"]);
    await exec("powershell.exe", [
      ...powershell,
      'Remove-Item -LiteralPath "$env:SystemRoot\\System32\\spool\\PRINTERS\\*" -Force -ErrorAction SilentlyContinue',
    ]);
    await exec("powershell.exe", [...powershell, "Start-Service Spooler"]);
  },
  verify: async (exec) => {
    const jobs = await exec("powershell.exe", [
      ...powershell,
      "(Get-Printer | ForEach-Object { @(Get-PrintJob -PrinterName $_.Name) }).Count",
    ]);
    const spooler = await exec("powershell.exe", [
      ...powershell,
      "(Get-Service Spooler).Status",
    ]);
    return {
      ok: Number(jobs.trim()) === 0 && /running/i.test(spooler),
      summary: `jobs=${jobs.trim() || "unknown"};spooler=${spooler.trim()}`,
    };
  },
};

const macosPrinterClearQueue: Executor = {
  actionId: "device_printer_clear_queue",
  platform: "macos",
  snapshot: async (exec) =>
    printJobSnapshot(await exec("lpstat", ["-o"], { timeoutMs: 30_000 })),
  apply: async (exec) => {
    await exec("cancel", ["-a"], { timeoutMs: 30_000 });
  },
  verify: async (exec) => {
    const output = await exec("lpstat", ["-o"], { timeoutMs: 30_000 });
    return { ok: output.trim().length === 0, summary: truncate(output) };
  },
};

const linuxPrinterClearQueue: Executor = {
  actionId: "device_printer_clear_queue",
  platform: "linux",
  snapshot: async (exec) =>
    printJobSnapshot(await exec("lpstat", ["-o"], { timeoutMs: 30_000 })),
  apply: async (exec) => {
    await exec("cancel", ["-a"], { timeoutMs: 30_000 });
  },
  verify: async (exec) => {
    const output = await exec("lpstat", ["-o"], { timeoutMs: 30_000 });
    return { ok: output.trim().length === 0, summary: truncate(output) };
  },
};

const windowsAudioRestart: Executor = {
  actionId: "device_audio_restart",
  platform: "windows",
  snapshot: async (exec) => {
    const output = await exec("powershell.exe", [
      ...powershell,
      "Get-Service Audiosrv,AudioEndpointBuilder | Select-Object Name,Status | ConvertTo-Csv -NoTypeInformation",
    ]);
    return { audio: truncate(output) };
  },
  apply: async (exec) => {
    await exec("powershell.exe", [
      ...powershell,
      "Restart-Service Audiosrv -Force",
    ]);
  },
  verify: async (exec) => {
    const output = await exec("powershell.exe", [
      ...powershell,
      "Get-Service Audiosrv,AudioEndpointBuilder | Select-Object Status",
    ]);
    const statuses = output.match(/Running|Stopped/gi) ?? [];
    const ok =
      statuses.length >= 2 && statuses.every((status) => status === "Running");
    return { ok, summary: truncate(output) };
  },
  rollback: async (exec, _params, snapshot) => {
    if (/Audiosrv.*Stopped/i.test(snapshot.audio as string)) {
      await exec("powershell.exe", [...powershell, "Start-Service Audiosrv"]);
    }
    if (/AudioEndpointBuilder.*Stopped/i.test(snapshot.audio as string)) {
      await exec("powershell.exe", [
        ...powershell,
        "Start-Service AudioEndpointBuilder",
      ]);
    }
  },
};

const macosAudioRestart: Executor = {
  actionId: "device_audio_restart",
  platform: "macos",
  snapshot: async (exec) => {
    let output = "";
    try {
      output = await exec("pgrep", ["coreaudiod"], { timeoutMs: 30_000 });
    } catch {
      output = "";
    }
    return { audio: truncate(output) };
  },
  apply: async (exec) => {
    try {
      await exec("sudo", ["-n", "true"], { timeoutMs: 30_000 });
    } catch {
      throw new Error("requires_privilege");
    }
    await exec("sudo", ["-n", "killall", "coreaudiod"], {
      timeoutMs: 30_000,
    });
  },
  verify: async (exec) => {
    let output = "";
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        output = await exec("pgrep", ["coreaudiod"], { timeoutMs: 30_000 });
      } catch {
        output = "";
      }
      if (output.trim()) {
        return { ok: true, summary: truncate(output) };
      }
      if (attempt < 4)
        await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
    return { ok: false, summary: truncate(output) };
  },
};

const linuxAudioRestart: Executor = {
  actionId: "device_audio_restart",
  platform: "linux",
  snapshot: async (exec) => {
    let output = "";
    try {
      output = await exec("systemctl", ["--user", "is-active", "pipewire"], {
        timeoutMs: 30_000,
      });
    } catch {
      output = "inactive";
    }
    return {
      audio: truncate(output.trim() || "inactive"),
      backend: /^(active|running)$/i.test(output.trim())
        ? "pipewire"
        : "pulseaudio",
    };
  },
  apply: async (exec, _params, snapshot) => {
    if (snapshot.backend === "pipewire") {
      await exec(
        "systemctl",
        ["--user", "restart", "pipewire", "pipewire-pulse", "wireplumber"],
        { timeoutMs: 30_000 }
      );
    } else {
      await exec("pulseaudio", ["-k"], { timeoutMs: 30_000 });
      await exec("pulseaudio", ["--start"], { timeoutMs: 30_000 });
    }
  },
  verify: async (exec, _params, snapshot) => {
    try {
      const output =
        snapshot.backend === "pipewire"
          ? await exec("systemctl", ["--user", "is-active", "pipewire"])
          : await exec("pulseaudio", ["--check"]);
      return {
        ok:
          snapshot.backend === "pipewire"
            ? /active|running/i.test(output)
            : true,
        summary: truncate(output),
      };
    } catch (error) {
      return { ok: false, summary: truncate(String(error)) };
    }
  },
};

export const windowsPeripheralExecutors: readonly Executor[] = [
  windowsPrinterClearQueue,
  windowsAudioRestart,
];

export const macosPeripheralExecutors: readonly Executor[] = [
  macosPrinterClearQueue,
  macosAudioRestart,
];

export const linuxPeripheralExecutors: readonly Executor[] = [
  linuxPrinterClearQueue,
  linuxAudioRestart,
];
