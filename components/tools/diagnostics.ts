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
/* Small async helpers                                                 */
/* ------------------------------------------------------------------ */

/**
 * Resolves with `fallback` if `promise` hasn't settled within `ms`, and with
 * `fallback` if it rejects. Browser APIs like getBattery() or
 * storage.estimate() occasionally never settle (private windows, locked-down
 * work profiles) — a tool must never spin forever because of that.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  fallback: T
): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      }
    );
  });
}

/** Stops every track on a stream (safe on null). */
export function stopStream(stream: MediaStream | null | undefined) {
  stream?.getTracks().forEach((t) => {
    try {
      t.onended = null;
      t.stop();
    } catch {
      // already stopped
    }
  });
}

/** Fullscreen with the old WebKit prefix; resolves false if unsupported or refused. */
export async function enterFullscreen(
  el: HTMLElement = document.documentElement
): Promise<boolean> {
  const anyEl = el as HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void> | void;
  };
  try {
    if (el.requestFullscreen) {
      await el.requestFullscreen();
      return true;
    }
    if (anyEl.webkitRequestFullscreen) {
      await anyEl.webkitRequestFullscreen();
      return true;
    }
  } catch {
    // iOS Safari and some embedded browsers refuse — the overlay still works
  }
  return false;
}

export function fullscreenActive(): boolean {
  const doc = document as Document & {
    webkitFullscreenElement?: Element | null;
  };
  return !!(document.fullscreenElement ?? doc.webkitFullscreenElement);
}

export async function exitFullscreen(): Promise<void> {
  const doc = document as Document & {
    webkitExitFullscreen?: () => Promise<void> | void;
  };
  try {
    if (!fullscreenActive()) return;
    if (document.exitFullscreen) await document.exitFullscreen();
    else if (doc.webkitExitFullscreen) await doc.webkitExitFullscreen();
  } catch {
    // ignore
  }
}

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
    area.style.top = "0";
    area.style.left = "0";
    area.style.opacity = "0";
    area.style.fontSize = "16px"; // stops iOS zooming into the field
    const previous = document.activeElement as HTMLElement | null;
    document.body.appendChild(area);
    area.focus({ preventScroll: true });
    area.select();
    area.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    area.remove();
    previous?.focus?.({ preventScroll: true });
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
    const estimate = await withTimeout(
      navigator.storage.estimate(),
      4000,
      null
    );
    if (!estimate) return { supported: false };
    let persisted: boolean | null = null;
    try {
      persisted = navigator.storage.persisted
        ? await withTimeout(navigator.storage.persisted(), 2000, null)
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
      tip: "This can also happen in private/incognito windows. Check free space in your system settings instead: Windows → Settings → System → Storage, Mac → System Settings → General → Storage.",
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
      ? "Your browser has very little room to work with."
      : "There's plenty of room available to your browser.",
    tip: lowQuota
      ? "Browsers get a share of your disk, and yours is small — either the disk is nearly full or this is a private/incognito window (those always report a small number). Try a normal window; if it's still small, empty the recycle bin/trash, clear Downloads, and remove apps you don't use."
      : "This is only a rough hint — browsers get a share of your disk, so a healthy number usually means the disk isn't full. For the real free space, check storage in your system settings.",
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
    const b = await withTimeout(nav.getBattery(), 4000, null);
    if (!b) return { supported: false };
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
    const status = await withTimeout(
      navigator.permissions.query({ name: name as PermissionName }),
      3000,
      null
    );
    return status ? (status.state as PermState) : "unsupported";
  } catch {
    return "unsupported";
  }
}

/** Maps the Notification API's "default" to our "prompt". */
export function notificationState(): PermState {
  if (typeof Notification === "undefined") return "unsupported";
  return Notification.permission === "default"
    ? "prompt"
    : (Notification.permission as PermState);
}

/**
 * Asks for notification permission. MUST be called straight from a click
 * handler. Handles the old callback-style API (Safari < 15).
 */
export async function requestNotificationPermission(): Promise<PermState> {
  if (typeof Notification === "undefined") return "unsupported";
  try {
    const result = await new Promise<NotificationPermission>(
      (resolve, reject) => {
        const maybe = Notification.requestPermission(resolve);
        if (maybe && typeof maybe.then === "function")
          maybe.then(resolve, reject);
      }
    );
    return result === "default" ? "prompt" : (result as PermState);
  } catch {
    return notificationState();
  }
}

/**
 * Shows a notification. Chrome on Android (and installed PWAs) throw on
 * `new Notification()`, so fall back to the service worker registration.
 */
export async function showTestNotification(
  title: string,
  body: string
): Promise<boolean> {
  try {
    new Notification(title, { body });
    return true;
  } catch {
    // fall through to the service worker route
  }
  try {
    const reg = await withTimeout(
      navigator.serviceWorker?.getRegistration() ?? Promise.resolve(undefined),
      2500,
      undefined
    );
    if (!reg) return false;
    await reg.showNotification(title, { body, icon: "/icon-192.png" });
    return true;
  } catch {
    return false;
  }
}

export async function getPermissionInfo(): Promise<PermissionInfo> {
  const notifications = notificationState();
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

/**
 * `reachMs`: undefined = not measured, null = tried and failed, number = ms
 * to reach this site. A failed probe overrides the browser's (often wrong)
 * "online" flag.
 */
export function connectionReport(
  online: boolean,
  info: ConnectionInfo | null,
  reachMs?: number | null
): ToolReport {
  const lines: ReportLine[] = [["Online", online ? "Yes" : "No"]];
  if (reachMs === null) lines.push(["Reaches this site", "No"]);
  else if (typeof reachMs === "number")
    lines.push(["Reaches this site", `Yes (${Math.round(reachMs)} ms)`]);
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
  if (reachMs === null) {
    return {
      tool: "Connection",
      lines,
      tone: "bad",
      verdict: "Your device says it's online, but it couldn't reach this site.",
      tip: "That usually means Wi-Fi is connected without internet (captive portal, router problem) or a VPN/firewall is blocking the site. Try opening another website, reconnect to Wi-Fi, and restart the router if nothing loads.",
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
    (typeof reachMs === "number" && reachMs > 800) ||
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

/** Pure: median frame gap (ms) -> refresh rate snapped to a common value. */
export function snapRefreshRate(medianMs: number): number | null {
  if (!Number.isFinite(medianMs) || medianMs <= 0) return null;
  const hz = 1000 / medianMs;
  const snap = COMMON_RATES.find((r) => Math.abs(r - hz) / r < 0.06);
  return snap ?? Math.round(hz);
}

/**
 * Counts animation frames for `durationMs`. Resolves null (never hangs) if
 * the tab is hidden — browsers pause requestAnimationFrame there — or too
 * few frames arrive.
 */
export function measureRefreshRate(durationMs = 1000): Promise<number | null> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame !== "function") return resolve(null);
    const deltas: number[] = [];
    let last = 0;
    let start = 0;
    let settled = false;
    let frame = 0;
    const finish = (value: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(guard);
      cancelAnimationFrame(frame);
      resolve(value);
    };
    const guard = setTimeout(() => finish(null), durationMs + 2500);
    const tick = (now: number) => {
      if (!start) start = now;
      if (last) deltas.push(now - last);
      last = now;
      if (now - start < durationMs) frame = requestAnimationFrame(tick);
      else {
        // Drop the first frames (layout/start-up jitter) before taking the median.
        const usable = deltas.slice(2);
        if (usable.length < 5) return finish(null);
        const sorted = [...usable].sort((a, b) => a - b);
        finish(snapRefreshRate(sorted[Math.floor(sorted.length / 2)]));
      }
    };
    frame = requestAnimationFrame(tick);
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

/**
 * Resumes a suspended/interrupted AudioContext. Call from inside the click
 * handler. Never hangs: iOS can leave resume() pending forever.
 */
export async function resumeAudio(ctx: AudioContext): Promise<boolean> {
  if (ctx.state === "running") return true;
  await withTimeout(ctx.resume(), 1500, undefined);
  return (ctx.state as string) === "running";
}
