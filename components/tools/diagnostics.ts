/**
 * Pure, client-side diagnostics used by the self-check toolkit.
 *
 * Everything here runs in the browser only (callers invoke these from
 * effects or event handlers, never during render) and nothing is sent
 * anywhere — results only leave the page if the user copies them.
 */
import { getConnectionInfo, type ConnectionInfo } from "@/lib/network-check";

export type Tone = "good" | "warn" | "bad" | "info";
export type ReportLine = [label: string, value: string];

export type ToolReport = {
  tool: string;
  tone: Tone;
  verdict: string;
  tip: string;
  lines: ReportLine[];
};

/* ------------------------------------------------------------------ */
/* Report formatting                                                   */
/* ------------------------------------------------------------------ */

export function formatReport(report: ToolReport): string {
  const out = [`${report.tool}: ${report.verdict}`];
  for (const [label, value] of report.lines) out.push(`  - ${label}: ${value}`);
  return out.join("\n");
}

export function formatReports(reports: ToolReport[], when = new Date()) {
  const header = `HelpDesk First self-check (${when.toLocaleString()})`;
  return [header, ...reports.map(formatReport)].join("\n\n");
}

export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the textarea fallback
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(
    units.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024))
  );
  const value = bytes / 1024 ** i;
  return `${value >= 100 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
}

function formatDuration(seconds: number): string | null {
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}

/* ------------------------------------------------------------------ */
/* Device & browser                                                    */
/* ------------------------------------------------------------------ */

type UAData = {
  platform?: string;
  mobile?: boolean;
};

export type DeviceInfo = {
  os: string;
  browser: string;
  browserVersion: string;
  mobile: boolean;
  screen: string;
  pixelRatio: number;
  viewport: string;
  language: string;
  timezone: string;
  online: boolean;
  cookies: boolean;
  colorScheme: "dark" | "light";
  touch: boolean;
  cores: number | null;
  memoryGb: number | null;
};

export function detectOS(ua: string, uaPlatform = "", touchPoints = 0): string {
  const p = uaPlatform.toLowerCase();
  if (p) {
    if (p.includes("win")) return "Windows";
    if (p.includes("android")) return "Android";
    if (p.includes("chrome os") || p.includes("chromeos")) return "ChromeOS";
    if (p.includes("mac")) return "macOS";
    if (p.includes("ios")) return "iOS";
    if (p.includes("linux")) return "Linux";
  }
  if (/iPhone|iPod/.test(ua)) return "iOS";
  if (/iPad/.test(ua)) return "iPadOS";
  if (/Android/.test(ua)) return "Android";
  if (/CrOS/.test(ua)) return "ChromeOS";
  if (/Windows/.test(ua)) return "Windows";
  if (/Macintosh|Mac OS X/.test(ua))
    return touchPoints > 1 ? "iPadOS" : "macOS";
  if (/Linux/.test(ua)) return "Linux";
  return "Unknown";
}

export function detectBrowser(ua: string): { name: string; version: string } {
  const tests: Array<[string, RegExp]> = [
    ["Edge", /Edg(?:e|A|iOS)?\/([\d.]+)/],
    ["Opera", /OPR\/([\d.]+)/],
    ["Samsung Internet", /SamsungBrowser\/([\d.]+)/],
    ["Firefox", /(?:Firefox|FxiOS)\/([\d.]+)/],
    ["Chrome", /(?:Chrome|CriOS)\/([\d.]+)/],
    ["Safari", /Version\/([\d.]+).*Safari/],
  ];
  for (const [name, re] of tests) {
    const match = ua.match(re);
    if (match) return { name, version: match[1].split(".")[0] };
  }
  return { name: "Unknown browser", version: "" };
}

export function collectDeviceInfo(): DeviceInfo {
  const nav = navigator as Navigator & {
    userAgentData?: UAData;
    deviceMemory?: number;
  };
  const ua = nav.userAgent ?? "";
  const browser = detectBrowser(ua);
  let timezone = "Unknown";
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Unknown";
  } catch {
    // keep Unknown
  }
  return {
    os: detectOS(
      ua,
      nav.userAgentData?.platform ?? "",
      nav.maxTouchPoints ?? 0
    ),
    browser: browser.name,
    browserVersion: browser.version,
    mobile: nav.userAgentData?.mobile ?? /Mobi|Android|iPhone|iPad/i.test(ua),
    screen: `${window.screen.width} × ${window.screen.height}`,
    pixelRatio: Math.round((window.devicePixelRatio || 1) * 100) / 100,
    viewport: `${window.innerWidth} × ${window.innerHeight}`,
    language: nav.language || "Unknown",
    timezone,
    online: nav.onLine,
    cookies: nav.cookieEnabled,
    colorScheme: window.matchMedia?.("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light",
    touch: (nav.maxTouchPoints ?? 0) > 0 || "ontouchstart" in window,
    cores: nav.hardwareConcurrency || null,
    memoryGb: typeof nav.deviceMemory === "number" ? nav.deviceMemory : null,
  };
}

export function deviceReport(info: DeviceInfo): ToolReport {
  const lines: ReportLine[] = [
    ["Operating system", info.os],
    [
      "Browser",
      `${info.browser}${info.browserVersion ? ` ${info.browserVersion}` : ""}`,
    ],
    ["Device type", info.mobile ? "Phone / tablet" : "Computer"],
    ["Screen", `${info.screen} @ ${info.pixelRatio}x`],
    ["Browser window", info.viewport],
    ["Language", info.language],
    ["Time zone", info.timezone],
    ["Online", info.online ? "Yes" : "No"],
    ["Cookies", info.cookies ? "Enabled" : "Disabled"],
    [
      "System colour preference",
      info.colorScheme === "dark" ? "Dark" : "Light",
    ],
    ["Touch screen", info.touch ? "Yes" : "No"],
    ["CPU cores", info.cores ? String(info.cores) : "Not reported"],
    [
      "Memory",
      info.memoryGb ? `About ${info.memoryGb} GB` : "Not reported by browser",
    ],
  ];
  const base = { tool: "Device & browser", lines };
  if (!info.online) {
    return {
      ...base,
      tone: "warn",
      verdict: "Your browser says this device is offline.",
      tip: "Check Wi-Fi or the network cable first — most other fixes need a working connection.",
    };
  }
  if (!info.cookies) {
    return {
      ...base,
      tone: "warn",
      verdict: "Cookies are turned off in this browser.",
      tip: "Many sites (including sign-in pages) need cookies. Turn them back on in your browser's privacy settings, or allow them for the sites you use.",
    };
  }
  if (info.memoryGb !== null && info.memoryGb <= 2) {
    return {
      ...base,
      tone: "warn",
      verdict: "This device has a small amount of memory.",
      tip: "Low-memory devices slow down quickly with lots of tabs or apps open. Close what you are not using before trying other fixes.",
    };
  }
  return {
    ...base,
    tone: "good",
    verdict: `Running ${info.browser} on ${info.os} — everything looks normal.`,
    tip: "Support usually asks which system and browser you use. Copy these details into your ticket so nobody has to guess.",
  };
}

/* ------------------------------------------------------------------ */
/* Storage                                                             */
/* ------------------------------------------------------------------ */

export type StorageInfo =
  | { supported: false }
  | {
      supported: true;
      usage: number;
      quota: number;
      persisted: boolean | null;
    };

export async function getStorageInfo(): Promise<StorageInfo> {
  if (typeof navigator === "undefined" || !navigator.storage?.estimate) {
    return { supported: false };
  }
  try {
    const estimate = await navigator.storage.estimate();
    let persisted: boolean | null = null;
    try {
      persisted = navigator.storage.persisted
        ? await navigator.storage.persisted()
        : null;
    } catch {
      persisted = null;
    }
    return {
      supported: true,
      usage: estimate.usage ?? 0,
      quota: estimate.quota ?? 0,
      persisted,
    };
  } catch {
    return { supported: false };
  }
}

export function storageReport(info: StorageInfo): ToolReport {
  if (!info.supported) {
    return {
      tool: "Storage",
      tone: "info",
      verdict: "This browser doesn't report storage space.",
      tip: "Check free space in your system settings instead: Windows → Settings → System → Storage, Mac → System Settings → General → Storage.",
      lines: [["Storage estimate", "Not supported"]],
    };
  }
  const lines: ReportLine[] = [
    ["Used by this site", formatBytes(info.usage)],
    ["Available to browser", formatBytes(info.quota)],
  ];
  const lowQuota = info.quota > 0 && info.quota < 1024 ** 3;
  return {
    tool: "Storage",
    lines,
    tone: lowQuota ? "warn" : "good",
    verdict: lowQuota
      ? "Your disk looks close to full."
      : "There's plenty of room available to your browser.",
    tip: lowQuota
      ? "Browsers get a share of your free disk space, and yours is small. Empty the recycle bin/trash, clear Downloads, and remove apps you don't use — a nearly full disk makes everything slow."
      : "Browsers get a share of your free disk space, so a healthy number here usually means your disk isn't full. If apps still complain, check storage in system settings.",
  };
}

/* ------------------------------------------------------------------ */
/* Battery                                                             */
/* ------------------------------------------------------------------ */

export type BatteryInfo =
  | { supported: false }
  | {
      supported: true;
      level: number;
      charging: boolean;
      chargingTime: number;
      dischargingTime: number;
    };

type BatteryManagerLike = {
  level: number;
  charging: boolean;
  chargingTime: number;
  dischargingTime: number;
};

export async function getBatteryInfo(): Promise<BatteryInfo> {
  const nav = navigator as Navigator & {
    getBattery?: () => Promise<BatteryManagerLike>;
  };
  if (typeof nav.getBattery !== "function") return { supported: false };
  try {
    const b = await nav.getBattery();
    return {
      supported: true,
      level: b.level,
      charging: b.charging,
      chargingTime: b.chargingTime,
      dischargingTime: b.dischargingTime,
    };
  } catch {
    return { supported: false };
  }
}

export function batteryReport(info: BatteryInfo): ToolReport {
  if (!info.supported) {
    return {
      tool: "Battery",
      tone: "info",
      verdict: "This browser doesn't share battery details.",
      tip: "Safari and Firefox keep battery info private. Check the battery icon in your taskbar or menu bar instead.",
      lines: [["Battery", "Not available in this browser"]],
    };
  }
  const pct = Math.round(info.level * 100);
  const lines: ReportLine[] = [
    ["Charge", `${pct}%`],
    ["Plugged in", info.charging ? "Yes" : "No"],
  ];
  const remaining = formatDuration(
    info.charging ? info.chargingTime : info.dischargingTime
  );
  if (remaining) {
    lines.push([info.charging ? "Time to full" : "Time left", remaining]);
  }
  if (!info.charging && pct <= 20) {
    return {
      tool: "Battery",
      lines,
      tone: "warn",
      verdict: `Battery is low (${pct}%).`,
      tip: "Plug in before restarts or updates. Low battery also triggers power-saving mode, which can make the device feel slow.",
    };
  }
  return {
    tool: "Battery",
    lines,
    tone: "good",
    verdict: info.charging
      ? `Plugged in and charging (${pct}%).`
      : `Battery is at ${pct}%.`,
    tip: "Desktop PCs without a battery usually show 100% and plugged in. On laptops, keep the charger connected during long fixes.",
  };
}

/* ------------------------------------------------------------------ */
/* Permissions                                                         */
/* ------------------------------------------------------------------ */

export type PermState = "granted" | "denied" | "prompt" | "unsupported";
export type PermissionKey =
  "notifications" | "camera" | "microphone" | "geolocation";
export type PermissionInfo = Record<PermissionKey, PermState>;

export const PERMISSION_LABELS: Record<PermissionKey, string> = {
  notifications: "Notifications",
  camera: "Camera",
  microphone: "Microphone",
  geolocation: "Location",
};

export const PERM_STATE_LABEL: Record<PermState, string> = {
  granted: "Allowed",
  denied: "Blocked",
  prompt: "Will ask",
  unsupported: "Can't check",
};

async function queryPermission(name: string): Promise<PermState> {
  if (!navigator.permissions?.query) return "unsupported";
  try {
    const status = await navigator.permissions.query({
      name: name as PermissionName,
    });
    return status.state as PermState;
  } catch {
    return "unsupported";
  }
}

export async function getPermissionInfo(): Promise<PermissionInfo> {
  let notifications: PermState = "unsupported";
  if (typeof Notification !== "undefined") {
    notifications =
      Notification.permission === "default"
        ? "prompt"
        : (Notification.permission as PermState);
  }
  const [camera, microphone, geolocation] = await Promise.all([
    queryPermission("camera"),
    queryPermission("microphone"),
    queryPermission("geolocation"),
  ]);
  return { notifications, camera, microphone, geolocation };
}

export function permissionsReport(info: PermissionInfo): ToolReport {
  const keys = Object.keys(PERMISSION_LABELS) as PermissionKey[];
  const lines = keys.map(
    (k) => [PERMISSION_LABELS[k], PERM_STATE_LABEL[info[k]]] as ReportLine
  );
  const blocked = keys.filter((k) => info[k] === "denied");
  if (blocked.length) {
    return {
      tool: "Permissions",
      lines,
      tone: "warn",
      verdict: `${blocked.map((k) => PERMISSION_LABELS[k]).join(", ")} ${blocked.length === 1 ? "is" : "are"} blocked for this site.`,
      tip: "Permissions are set per website. If a meeting or chat app can't use something, click the padlock or camera icon in its address bar and choose Allow, then reload.",
    };
  }
  return {
    tool: "Permissions",
    lines,
    tone: "good",
    verdict: "Nothing is blocked for this site.",
    tip: "Sites must ask before using your camera, mic or location. If another app isn't asking, check its own address-bar permissions and your system privacy settings.",
  };
}

/* ------------------------------------------------------------------ */
/* Connection                                                          */
/* ------------------------------------------------------------------ */

export function readConnection(): {
  online: boolean;
  info: ConnectionInfo | null;
} {
  return { online: navigator.onLine, info: getConnectionInfo() };
}

export function connectionReport(
  online: boolean,
  info: ConnectionInfo | null
): ToolReport {
  const lines: ReportLine[] = [["Online", online ? "Yes" : "No"]];
  if (info) {
    lines.push(["Network type", info.effectiveType ?? "Unknown"]);
    if (info.downlinkMbps !== null)
      lines.push(["Estimated speed", `~${info.downlinkMbps} Mbps`]);
    if (info.rttMs !== null) lines.push(["Round trip", `${info.rttMs} ms`]);
    if (info.saveData) lines.push(["Data saver", "On"]);
  } else {
    lines.push(["Connection details", "Not shared by this browser"]);
  }
  if (!online) {
    return {
      tool: "Connection",
      lines,
      tone: "bad",
      verdict: "This device is offline.",
      tip: "Check that Wi-Fi is on (or the cable is plugged in), then restart your router if other devices are offline too.",
    };
  }
  if (!info) {
    return {
      tool: "Connection",
      lines,
      tone: "info",
      verdict: "You're online. This browser keeps connection details private.",
      tip: "That's normal for Safari and Firefox. Run the full speed test for real latency and download numbers.",
    };
  }
  const slow =
    (info.effectiveType && /(^|-)2g|3g/.test(info.effectiveType)) ||
    (info.rttMs !== null && info.rttMs > 300) ||
    (info.downlinkMbps !== null && info.downlinkMbps < 1.5);
  if (slow) {
    return {
      tool: "Connection",
      lines,
      tone: "warn",
      verdict: "Your connection looks slow right now.",
      tip: "Move closer to the router, pause big downloads, or switch to a wired connection. Video calls and cloud sync need a steadier link.",
    };
  }
  return {
    tool: "Connection",
    lines,
    tone: "good",
    verdict: "Your connection looks healthy.",
    tip: "These are the browser's own estimates. For measured numbers, run the full speed test.",
  };
}

/* ------------------------------------------------------------------ */
/* Display refresh rate                                                */
/* ------------------------------------------------------------------ */

const COMMON_RATES = [
  30, 50, 60, 72, 75, 90, 100, 120, 144, 165, 180, 240, 360,
];

export function measureRefreshRate(durationMs = 1000): Promise<number | null> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame !== "function") return resolve(null);
    const deltas: number[] = [];
    let last = 0;
    let start = 0;
    const tick = (now: number) => {
      if (!start) start = now;
      if (last) deltas.push(now - last);
      last = now;
      if (now - start < durationMs) requestAnimationFrame(tick);
      else {
        if (deltas.length < 5) return resolve(null);
        const sorted = [...deltas].sort((a, b) => a - b);
        const median = sorted[Math.floor(sorted.length / 2)];
        if (!median) return resolve(null);
        const hz = 1000 / median;
        const snap = COMMON_RATES.find((r) => Math.abs(r - hz) / r < 0.06);
        resolve(snap ?? Math.round(hz));
      }
    };
    requestAnimationFrame(tick);
  });
}

export function refreshReport(hz: number | null): ToolReport {
  if (hz === null) {
    return {
      tool: "Display",
      tone: "info",
      verdict: "Couldn't measure the refresh rate.",
      tip: "Keep this tab in front and try again — browsers slow down animation in background tabs.",
      lines: [["Refresh rate", "Unknown"]],
    };
  }
  return {
    tool: "Display",
    lines: [["Refresh rate", `~${hz} Hz`]],
    tone: hz < 50 ? "warn" : "good",
    verdict:
      hz < 50
        ? `Your screen is updating at only ~${hz} Hz.`
        : `Your screen refreshes at about ${hz} Hz.`,
    tip:
      hz < 50
        ? "Battery saver or a remote-desktop session can lower this. Plug in, or check display settings for a higher refresh rate."
        : "60 Hz is standard; gaming monitors run higher. If motion looks choppy, check display settings and the cable (HDMI/DisplayPort).",
  };
}

/* ------------------------------------------------------------------ */
/* Camera & microphone errors                                          */
/* ------------------------------------------------------------------ */

export function mediaErrorGuidance(
  error: unknown,
  kind: "camera" | "microphone"
): { tone: Tone; verdict: string; tip: string } {
  const name =
    error && typeof error === "object" && "name" in error
      ? String((error as { name: unknown }).name)
      : "";
  const Device = kind === "camera" ? "Camera" : "Microphone";
  const device = kind;
  const macPath = `System Settings → Privacy & Security → ${Device}`;
  const winPath = `Settings → Privacy & security → ${Device}`;
  switch (name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
      return {
        tone: "bad",
        verdict: `${Device} access was blocked.`,
        tip: `Click the padlock or ${device} icon in the address bar, set ${Device} to Allow, and reload. If it's still blocked, allow your browser in ${winPath} (Windows) or ${macPath} (Mac).`,
      };
    case "NotFoundError":
    case "DevicesNotFoundError":
      return {
        tone: "bad",
        verdict: `No ${device} was found.`,
        tip:
          kind === "camera"
            ? "Check the camera is plugged in, the privacy shutter is open, and (on laptops) the lid is fully open. Try another USB port for external cameras."
            : "Check your headset or mic is plugged in (or paired over Bluetooth) and not muted with a hardware switch.",
      };
    case "NotReadableError":
    case "TrackStartError":
    case "AbortError":
      return {
        tone: "warn",
        verdict: `Your ${device} is busy or couldn't start.`,
        tip: "Another app is probably using it. Quit Zoom, Teams, FaceTime or other call apps completely, then try again. Restarting the device clears stuck drivers.",
      };
    case "OverconstrainedError":
      return {
        tone: "warn",
        verdict: `That ${device} isn't available any more.`,
        tip: "It may have been unplugged. Pick another device from the list and try again.",
      };
    case "SecurityError":
      return {
        tone: "bad",
        verdict: `The browser blocked ${device} access on this page.`,
        tip: "Camera and mic only work on secure (https) pages, and some work devices block them by policy — ask IT if this keeps happening.",
      };
    default:
      return {
        tone: "bad",
        verdict: `Couldn't start the ${device}.`,
        tip: "Reload the page and try again. If it still fails, restart your browser or try another browser to see whether the problem follows the device.",
      };
  }
}

export function mediaSupported(): boolean {
  return (
    typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia
  );
}

export async function listDevices(
  kind: MediaDeviceKind
): Promise<Array<{ id: string; label: string }>> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  try {
    const all = await navigator.mediaDevices.enumerateDevices();
    return all
      .filter((d) => d.kind === kind)
      .map((d, i) => ({
        id: d.deviceId,
        label:
          d.label ||
          `${kind === "videoinput" ? "Camera" : kind === "audioinput" ? "Microphone" : "Speaker"} ${i + 1}`,
      }));
  } catch {
    return [];
  }
}

export function getAudioContextCtor(): typeof AudioContext | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & { webkitAudioContext?: typeof AudioContext };
  return window.AudioContext ?? w.webkitAudioContext ?? null;
}
