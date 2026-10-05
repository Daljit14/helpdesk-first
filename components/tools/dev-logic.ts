/**
 * Pure logic for the devices / peripherals / printing / accounts / support
 * toolkit tools. No DOM access in here so everything is unit-testable.
 */
import type { Tone } from "./diagnostics";

/* ------------------------------------------------------------------ */
/* Mouse & trackpad                                                    */
/* ------------------------------------------------------------------ */

/** Gaps shorter than this between two clicks are almost certainly a worn switch ("chatter"), not a person. */
export const BOUNCE_MS = 60;
/** Windows / macOS default double-click window. */
export const DOUBLE_CLICK_MS = 500;

export type ClickGapKind = "bounce" | "double" | "separate";

export function classifyClickGap(
  gapMs: number,
  doubleMs = DOUBLE_CLICK_MS,
  bounceMs = BOUNCE_MS
): ClickGapKind {
  if (gapMs < bounceMs) return "bounce";
  if (gapMs <= doubleMs) return "double";
  return "separate";
}

export type ClickSample = { button: number; t: number };

export type ClickAnalysis = {
  total: number;
  doubles: number;
  bounces: number;
  /** Shortest gap seen between two clicks of the same button. */
  fastestGapMs: number | null;
  /** Buttons that registered at least once (0 left, 1 middle, 2 right). */
  buttonsSeen: number[];
};

export function analyzeClicks(
  clicks: ClickSample[],
  doubleMs = DOUBLE_CLICK_MS,
  bounceMs = BOUNCE_MS
): ClickAnalysis {
  const lastByButton = new Map<number, number>();
  let doubles = 0;
  let bounces = 0;
  let fastest: number | null = null;
  for (const c of clicks) {
    const prev = lastByButton.get(c.button);
    if (prev !== undefined) {
      const gap = c.t - prev;
      const kind = classifyClickGap(gap, doubleMs, bounceMs);
      if (kind === "bounce") bounces++;
      else if (kind === "double") doubles++;
      if (gap >= 0 && (fastest === null || gap < fastest)) fastest = gap;
    }
    lastByButton.set(c.button, c.t);
  }
  return {
    total: clicks.length,
    doubles,
    bounces,
    fastestGapMs: fastest,
    buttonsSeen: [...lastByButton.keys()].sort((a, b) => a - b),
  };
}

export type PointSample = { x: number; y: number; t: number };

export type JitterStats = {
  samples: number;
  /** Largest distance (px) from the average position. */
  maxDeviation: number;
  /** Root-mean-square distance (px) from the average position. */
  rms: number;
  /** Straight-line distance between first and last sample. */
  netDrift: number;
  level: "none" | "tiny" | "noticeable" | "high";
};

/**
 * Samples collected while the person is NOT touching the mouse. A healthy
 * mouse reports no movement at all, so any real motion means a dirty
 * sensor, a bad surface, or something nudging the desk.
 */
export function jitterStats(points: PointSample[]): JitterStats {
  if (points.length === 0) {
    return { samples: 0, maxDeviation: 0, rms: 0, netDrift: 0, level: "none" };
  }
  const mx = points.reduce((s, p) => s + p.x, 0) / points.length;
  const my = points.reduce((s, p) => s + p.y, 0) / points.length;
  let max = 0;
  let sq = 0;
  for (const p of points) {
    const d = Math.hypot(p.x - mx, p.y - my);
    if (d > max) max = d;
    sq += d * d;
  }
  const first = points[0];
  const last = points[points.length - 1];
  const rms = Math.sqrt(sq / points.length);
  const netDrift = Math.hypot(last.x - first.x, last.y - first.y);
  const reach = Math.max(max, netDrift);
  let level: JitterStats["level"] = "none";
  if (points.length >= 2) {
    level = reach <= 2 ? "tiny" : reach <= 8 ? "noticeable" : "high";
  }
  return {
    samples: points.length,
    maxDeviation: round1(max),
    rms: round1(rms),
    netDrift: round1(netDrift),
    level,
  };
}

export type WheelEventLike = {
  deltaX: number;
  deltaY: number;
  deltaMode: number;
  t: number;
};

export type WheelStats = {
  events: number;
  direction: "up" | "down" | "left" | "right" | "none";
  /** Rough lines-per-second at the fastest burst. */
  peakSpeed: number;
  /** Times the wheel reversed direction within a single burst (a sign of a worn encoder). */
  reversals: number;
};

/** Normalises pixel / line / page deltas to approximate "lines". */
export function wheelLines(
  e: Pick<WheelEventLike, "deltaY" | "deltaX" | "deltaMode">
): { x: number; y: number } {
  const factor = e.deltaMode === 1 ? 1 : e.deltaMode === 2 ? 20 : 1 / 40;
  return { x: e.deltaX * factor, y: e.deltaY * factor };
}

export function analyzeWheel(
  events: WheelEventLike[],
  burstGapMs = 250
): WheelStats {
  if (events.length === 0)
    return { events: 0, direction: "none", peakSpeed: 0, reversals: 0 };
  let sx = 0;
  let sy = 0;
  let reversals = 0;
  let peak = 0;
  let burstStart = events[0].t;
  let burstLines = 0;
  let lastSign = 0;
  let prevT = events[0].t;
  for (const e of events) {
    const l = wheelLines(e);
    sx += l.x;
    sy += l.y;
    if (e.t - prevT > burstGapMs) {
      burstStart = e.t;
      burstLines = 0;
      lastSign = 0;
    }
    const sign = Math.sign(l.y);
    if (sign !== 0) {
      if (lastSign !== 0 && sign !== lastSign) reversals++;
      lastSign = sign;
    }
    burstLines += Math.abs(l.y) + Math.abs(l.x);
    const span = Math.max(0.1, (e.t - burstStart) / 1000);
    if (e.t - burstStart >= 100) peak = Math.max(peak, burstLines / span);
    prevT = e.t;
  }
  let direction: WheelStats["direction"] = "none";
  if (Math.abs(sy) >= Math.abs(sx) && sy !== 0)
    direction = sy > 0 ? "down" : "up";
  else if (sx !== 0) direction = sx > 0 ? "right" : "left";
  return {
    events: events.length,
    direction,
    peakSpeed: Math.round(peak * 10) / 10,
    reversals,
  };
}

export type PointerVerdict = { tone: Tone; verdict: string; tip: string };

export function pointerVerdict(args: {
  clicks: ClickAnalysis;
  wheel: WheelStats;
  jitter: JitterStats | null;
  dragged: boolean;
}): PointerVerdict {
  const { clicks, wheel, jitter, dragged } = args;
  const problems: string[] = [];
  if (clicks.bounces > 0) {
    problems.push(
      `${clicks.bounces} click${clicks.bounces === 1 ? "" : "s"} registered twice in under ${BOUNCE_MS} ms`
    );
  }
  if (jitter && (jitter.level === "noticeable" || jitter.level === "high")) {
    problems.push(
      `the pointer moved ${jitter.maxDeviation} px while you weren't touching it`
    );
  }
  if (wheel.reversals >= 3)
    problems.push("the scroll wheel jumped backwards while scrolling");
  if (problems.length > 0) {
    return {
      tone: "warn",
      verdict: `Possible mouse or trackpad problem: ${problems.join("; ")}.`,
      tip: "Double-clicks you didn't mean usually point to a worn button switch; drifting points to a dirty sensor or a shiny/glass surface. Clean the sensor, try a mouse mat, change the batteries or try another USB port. If a different mouse behaves, the first one needs replacing.",
    };
  }
  const missing = [0, 1, 2].filter(
    (b) => !clicks.buttonsSeen.includes(b)
  ).length;
  if (clicks.total === 0 && wheel.events === 0 && !dragged) {
    return {
      tone: "info",
      verdict: "Nothing tested yet.",
      tip: "Click each button, roll the wheel, drag the handle and run the hold-still test to get a verdict.",
    };
  }
  if (missing > 0 && clicks.total > 0) {
    return {
      tone: "info",
      verdict:
        "Everything you tried works. Some buttons haven't been tested yet.",
      tip: "Left, middle (wheel press) and right buttons should all light up. Trackpads usually have no middle button — that's normal.",
    };
  }
  return {
    tone: "good",
    verdict: "Your mouse or trackpad looks healthy.",
    tip: "Buttons registered cleanly, the wheel scrolled in one direction and the pointer stayed put. If it still feels off, check pointer speed in your system settings.",
  };
}

/* ------------------------------------------------------------------ */
/* Touch screen                                                        */
/* ------------------------------------------------------------------ */

export type GridCoverage = {
  total: number;
  hit: number;
  missing: number;
  percent: number;
};

export function gridCoverage(total: number, hit: number): GridCoverage {
  const h = Math.max(0, Math.min(total, hit));
  return {
    total,
    hit: h,
    missing: total - h,
    percent: total === 0 ? 0 : Math.round((h / total) * 100),
  };
}

/** Cell indices (row-major) that were never touched, collapsed to "row 2, col 3" style labels. */
export function missingCellLabels(cols: number, hit: boolean[]): string[] {
  const out: string[] = [];
  hit.forEach((v, i) => {
    if (!v)
      out.push(`row ${Math.floor(i / cols) + 1}, column ${(i % cols) + 1}`);
  });
  return out;
}

export function touchVerdict(args: {
  maxTouches: number;
  coverage: GridCoverage;
  touched: boolean;
}): PointerVerdict {
  const { maxTouches, coverage, touched } = args;
  if (!touched) {
    return {
      tone: "info",
      verdict: "Nothing tested yet.",
      tip: "Draw on the canvas with one or more fingers, then tap every square in the grid.",
    };
  }
  if (
    coverage.total > 0 &&
    coverage.hit > 0 &&
    coverage.missing > 0 &&
    coverage.percent < 100
  ) {
    const done = coverage.percent >= 90;
    return {
      tone: done ? "warn" : "info",
      verdict: done
        ? `${coverage.missing} square${coverage.missing === 1 ? "" : "s"} never responded.`
        : `Grid ${coverage.percent}% complete. Keep tapping the remaining squares.`,
      tip: done
        ? "Squares that stay dark are dead zones. Clean the screen, remove the screen protector and restart. If the same spot is dead every time, the touch layer needs repair."
        : "Every square should turn green when you tap it. Any that won't are dead zones.",
    };
  }
  if (coverage.percent === 100) {
    return {
      tone: "good",
      verdict: `Every area responded. Up to ${maxTouches} finger${maxTouches === 1 ? "" : "s"} at once.`,
      tip: "No dead zones found. If touch still misbehaves in one app, the app (not the screen) is the likely cause.",
    };
  }
  return {
    tone: maxTouches >= 2 ? "good" : "info",
    verdict: `Touch works. Up to ${maxTouches} finger${maxTouches === 1 ? "" : "s"} detected at once.`,
    tip: "Tap each grid square to check for dead zones. Most phones and tablets handle 5 or more fingers; many laptops handle 2 to 10.",
  };
}

/* ------------------------------------------------------------------ */
/* Clock & time sync                                                   */
/* ------------------------------------------------------------------ */

export type ClockSample = {
  /** Client clock just before the request (ms since epoch). */
  t0: number;
  /** Client clock just after the response arrived. */
  t1: number;
  /** Server clock reading (ms since epoch). */
  server: number;
  /** Server clock only has whole-second resolution (HTTP Date header). */
  coarse?: boolean;
};

export type ClockOffset = {
  /** server minus device, in ms. Positive means the device clock is BEHIND. */
  offsetMs: number;
  rttMs: number;
  /** +/- error bar in ms. */
  uncertaintyMs: number;
};

/** NTP-style midpoint estimate: assume the server stamped the reply halfway through the round trip. */
export function computeClockOffset(s: ClockSample): ClockOffset {
  const rtt = Math.max(0, s.t1 - s.t0);
  const mid = s.t0 + rtt / 2;
  // A Date header is truncated to the second, so on average it is 500ms early.
  const server = s.coarse ? s.server + 500 : s.server;
  return {
    offsetMs: Math.round(server - mid),
    rttMs: Math.round(rtt),
    uncertaintyMs: Math.round(rtt / 2 + (s.coarse ? 500 : 0)),
  };
}

/** Pick the sample with the least network delay: it has the smallest error. */
export function bestClockOffset(samples: ClockSample[]): ClockOffset | null {
  if (samples.length === 0) return null;
  let best: ClockOffset | null = null;
  for (const s of samples) {
    const o = computeClockOffset(s);
    if (!best || o.uncertaintyMs < best.uncertaintyMs) best = o;
  }
  return best;
}

export const SKEW_WARN_MS = 30_000;
export const SKEW_BAD_MS = 120_000;

export type SkewLevel = "ok" | "drift" | "bad";

export function classifySkew(offsetMs: number): SkewLevel {
  const a = Math.abs(offsetMs);
  if (a > SKEW_BAD_MS) return "bad";
  if (a > SKEW_WARN_MS) return "drift";
  return "ok";
}

/** Unsigned, human-friendly span such as "4.2 s" or "5 min 0 s". */
export function formatSpan(ms: number): string {
  const a = Math.abs(ms);
  if (a < 1000) return `${Math.round(a)} ms`;
  if (a < 120_000) return `${(a / 1000).toFixed(1)} s`;
  const mins = Math.floor(a / 60_000);
  const secs = Math.round((a % 60_000) / 1000);
  if (a < 3_600_000) return `${mins} min ${secs} s`;
  const hrs = Math.floor(a / 3_600_000);
  const rem = Math.round((a % 3_600_000) / 60_000);
  return `${hrs} h ${rem} min`;
}

export function formatOffset(ms: number): string {
  if (Math.abs(ms) < 1000) return `${Math.round(ms)} ms`;
  return `${ms < 0 ? "-" : "+"}${formatSpan(ms)}`;
}

/** "5 min 0 s ahead of the server" style wording. Negative offset means the device is ahead. */
export function describeSkew(offsetMs: number): string {
  if (Math.abs(offsetMs) < 1000) return "in sync";
  return `${formatSpan(offsetMs)} ${offsetMs < 0 ? "ahead" : "behind"}`;
}

export type ClockVerdict = PointerVerdict & { level: SkewLevel };

export function clockVerdict(
  offsetMs: number,
  uncertaintyMs: number
): ClockVerdict {
  const level = classifySkew(offsetMs);
  const ahead = offsetMs < 0;
  const dir = ahead ? "ahead of" : "behind";
  if (level === "ok") {
    return {
      level,
      tone: "good",
      verdict: "Your clock is in sync.",
      tip: `Your device is within about ${formatSpan(Math.abs(offsetMs) + uncertaintyMs)} of the server, which is fine for sign-in codes and secure websites.`,
    };
  }
  if (level === "drift") {
    return {
      level,
      tone: "warn",
      verdict: `Your clock is ${formatSpan(offsetMs)} ${dir} the server.`,
      tip: "Not a problem yet, but it's drifting. Turn on automatic time so it keeps itself right before it starts breaking sign-in codes.",
    };
  }
  return {
    level,
    tone: "bad",
    verdict: `Your clock is ${formatSpan(offsetMs)} ${dir} the server.`,
    tip: "A clock this far out causes one-time-code (MFA) failures, sign-in loops and 'certificate not trusted' errors. Fix the time using the steps above, then sign in again.",
  };
}

export type OsFamily =
  | "Windows"
  | "macOS"
  | "iOS"
  | "iPadOS"
  | "Android"
  | "ChromeOS"
  | "Linux"
  | "Unknown";

export function clockFixSteps(os: string): string[] {
  switch (os) {
    case "Windows":
      return [
        "Open Settings → Time & language → Date & time.",
        "Turn on 'Set time automatically' and 'Set time zone automatically'.",
        "Under 'Additional settings', click 'Sync now'.",
        "If Sync fails, restart the 'Windows Time' service or restart the PC.",
      ];
    case "macOS":
      return [
        "Open System Settings → General → Date & Time.",
        "Turn on 'Set time and date automatically' and choose a time server such as time.apple.com.",
        "Turn on 'Set time zone automatically using your current location'.",
        "If the switch is greyed out, click the lock and enter your password, or ask IT.",
      ];
    case "iOS":
    case "iPadOS":
      return [
        "Open Settings → General → Date & Time.",
        "Turn on 'Set Automatically'.",
        "If it's already on, switch it off and on again, then restart the device.",
      ];
    case "Android":
      return [
        "Open Settings → System → Date & time (on some phones: General management → Date and time).",
        "Turn on 'Set time automatically' and 'Set time zone automatically'.",
        "Toggle them off and on again to force a refresh, then restart if needed.",
      ];
    case "ChromeOS":
      return [
        "Open Settings → System preferences → Date and time (or Device → Date and time).",
        "Choose 'Set automatically' for the time zone.",
        "Restart the Chromebook if the time still looks wrong.",
      ];
    case "Linux":
      return [
        "Open Settings → Date & Time and enable 'Automatic Date & Time'.",
        "Or run: timedatectl set-ntp true",
        "Check status with: timedatectl status",
      ];
    default:
      return [
        "Open your device's date and time settings.",
        "Turn on automatic time and time zone, then sync now.",
        "Restart the device if the time doesn't change.",
      ];
  }
}

/* ------------------------------------------------------------------ */
/* Graphics / browser capabilities                                     */
/* ------------------------------------------------------------------ */

export type RendererKind = "hardware" | "software" | "unknown" | "none";

export type RendererInfo = {
  kind: RendererKind;
  vendor: string;
  label: string;
};

const SOFTWARE_RENDERERS = [
  "swiftshader",
  "llvmpipe",
  "softpipe",
  "software rasterizer",
  "microsoft basic render",
  "basic render driver",
  "mesa offscreen",
  "angle (google, vulkan 1.3.0 (swiftshader",
];

export function classifyRenderer(
  renderer: string | null | undefined,
  webglAvailable: boolean
): RendererInfo {
  if (!webglAvailable) {
    return { kind: "none", vendor: "None", label: "WebGL is unavailable" };
  }
  const raw = (renderer ?? "").trim();
  if (!raw) {
    return {
      kind: "unknown",
      vendor: "Unknown",
      label: "The browser hides the graphics card name",
    };
  }
  const r = raw.toLowerCase();
  if (SOFTWARE_RENDERERS.some((s) => r.includes(s))) {
    return { kind: "software", vendor: "Software", label: raw };
  }
  let vendor = "Unknown";
  if (/nvidia|geforce|quadro|rtx|gtx/.test(r)) vendor = "NVIDIA";
  else if (/amd|radeon|\bati\b/.test(r)) vendor = "AMD";
  else if (/intel|iris|uhd|hd graphics/.test(r)) vendor = "Intel";
  else if (/apple|\bm[1-9]\b/.test(r)) vendor = "Apple";
  else if (/adreno|qualcomm/.test(r)) vendor = "Qualcomm";
  else if (/mali|arm/.test(r)) vendor = "ARM";
  else if (/powervr|imagination/.test(r)) vendor = "Imagination";
  return { kind: "hardware", vendor, label: raw };
}

export type FeatureRow = {
  id: string;
  label: string;
  supported: boolean;
  detail?: string;
};

export function capabilityTips(args: {
  renderer: RendererInfo;
  webgl2: boolean;
  missing: FeatureRow[];
  cores: number | null;
  memoryGb: number | null;
}): string[] {
  const tips: string[] = [];
  if (args.renderer.kind === "software") {
    tips.push(
      "Your browser is drawing video and graphics with the main processor instead of the graphics chip. Turn on 'Use graphics/hardware acceleration when available' in browser settings → System, restart the browser, and update your graphics driver."
    );
  }
  if (args.renderer.kind === "none") {
    tips.push(
      "WebGL is off or blocked. Check hardware acceleration is on, the browser is up to date, and that no extension or work policy disables it."
    );
  }
  if (!args.webgl2 && args.renderer.kind !== "none") {
    tips.push(
      "WebGL 2 isn't available. Update the browser and graphics driver; some video-background effects need it."
    );
  }
  for (const m of args.missing) {
    if (m.id === "webrtc")
      tips.push(
        "WebRTC is missing, so browser-based meetings can't work here. Use the desktop app or a different browser."
      );
    if (m.id === "wasm")
      tips.push(
        "WebAssembly is off. Some web apps and meeting effects won't run."
      );
    if (m.id === "serviceworker")
      tips.push(
        "Service workers are unavailable (private mode or a policy). Offline mode and notifications won't work."
      );
    if (m.id === "indexeddb")
      tips.push(
        "IndexedDB is blocked (often private mode). Some web apps can't save data."
      );
  }
  if (args.cores !== null && args.cores <= 2) {
    tips.push(
      "This device reports only 1–2 processor cores. Close other tabs and apps before joining meetings, and turn off virtual backgrounds."
    );
  }
  if (args.memoryGb !== null && args.memoryGb <= 2) {
    tips.push(
      "Memory looks low (2 GB or less). Close tabs and heavy apps, or use the phone/desktop app for meetings."
    );
  }
  if (tips.length === 0) {
    tips.push(
      "Nothing here explains lag. Check your network with the speed test, close heavy tabs and apps, and keep the browser up to date."
    );
  }
  return tips;
}

/* ------------------------------------------------------------------ */
/* Meeting readiness                                                   */
/* ------------------------------------------------------------------ */

/** Average frame rate from timestamps in milliseconds. */
export function fpsFromTimes(times: number[]): number | null {
  if (times.length < 2) return null;
  const span = times[times.length - 1] - times[0];
  if (span <= 0) return null;
  return Math.round(((times.length - 1) / span) * 1000 * 10) / 10;
}

/** RMS of audio samples in [-1, 1]. Accepts Float32 time-domain data or 0-255 byte data. */
export function rmsLevel(data: ArrayLike<number>, bytes = false): number {
  if (data.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    const v = bytes ? (data[i] - 128) / 128 : data[i];
    sum += v * v;
  }
  return Math.sqrt(sum / data.length);
}

export function levelToPercent(rms: number): number {
  if (rms <= 0.0005) return 0;
  const db = 20 * Math.log10(rms);
  return Math.max(0, Math.min(100, Math.round(((db + 60) / 60) * 100)));
}

export type MeetingCheckState =
  "pending" | "pass" | "warn" | "fail" | "skipped";
export type MeetingCheckId = "camera" | "mic" | "speaker" | "share";

export type MeetingCheck = {
  id: MeetingCheckId;
  label: string;
  state: MeetingCheckState;
  detail: string;
};

export function cameraQuality(
  width: number | null,
  height: number | null,
  fps: number | null
): { state: MeetingCheckState; note: string } {
  if (!width || !height) return { state: "warn", note: "Resolution unknown" };
  const lines = Math.min(width, height);
  const fpsNote = fps === null ? "" : ` at ${Math.round(fps)} fps`;
  if (fps !== null && fps < 10)
    return {
      state: "warn",
      note: `${width}×${height}${fpsNote} - frames are arriving slowly`,
    };
  if (lines < 360)
    return {
      state: "warn",
      note: `${width}×${height}${fpsNote} - low resolution`,
    };
  if (fps !== null && fps < 20)
    return {
      state: "warn",
      note: `${width}×${height}${fpsNote} - a bit choppy`,
    };
  return { state: "pass", note: `${width}×${height}${fpsNote}` };
}

export function micLevelState(peakPercent: number | null): {
  state: MeetingCheckState;
  note: string;
} {
  if (peakPercent === null) return { state: "skipped", note: "Not tested" };
  if (peakPercent < 8)
    return {
      state: "warn",
      note: "Almost no sound picked up. Speak up, or check the mic isn't muted.",
    };
  if (peakPercent > 97)
    return {
      state: "warn",
      note: "Very loud (clipping). Lower the input volume.",
    };
  return { state: "pass", note: `Peak level ${peakPercent}%` };
}

export function meetingSummary(checks: MeetingCheck[]): {
  ready: "ready" | "almost" | "not-ready" | "pending";
  tone: Tone;
  verdict: string;
  tip: string;
} {
  const done = checks.filter((c) => c.state !== "pending");
  if (done.length === 0) {
    return {
      ready: "pending",
      tone: "info",
      verdict: "Run the check to see if you're ready.",
      tip: "It takes about ten seconds.",
    };
  }
  const fails = checks.filter((c) => c.state === "fail");
  const warns = checks.filter((c) => c.state === "warn");
  const required = checks.filter((c) => c.id === "camera" || c.id === "mic");
  const requiredFail = required.some((c) => c.state === "fail");
  if (requiredFail) {
    return {
      ready: "not-ready",
      tone: "bad",
      verdict: "Not ready for a meeting yet.",
      tip: `Fix first: ${fails.map((f) => f.label.toLowerCase()).join(", ")}. Follow the guidance on each failed item, then run the check again.`,
    };
  }
  if (fails.length > 0 || warns.length > 0) {
    const names = [...fails, ...warns].map((c) => c.label.toLowerCase());
    return {
      ready: "almost",
      tone: "warn",
      verdict: "Almost ready, with a few things to look at.",
      tip: `Check: ${names.join(", ")}. You can still join, but sound or video may not be at its best.`,
    };
  }
  return {
    ready: "ready",
    tone: "good",
    verdict: "You're ready for meetings.",
    tip: "Camera, microphone and speakers all responded. If someone can't see or hear you in a call, check the meeting app's own device settings.",
  };
}

/** Browser-specific steps to re-allow a blocked camera, microphone or screen share. */
export function permissionHelp(
  browser: string,
  kind: "camera" | "microphone" | "screen"
): string {
  const Name =
    kind === "camera"
      ? "Camera"
      : kind === "microphone"
        ? "Microphone"
        : "Screen sharing";
  switch (browser) {
    case "Chrome":
    case "Edge":
      return kind === "screen"
        ? "Click the padlock (or tune icon) in the address bar, open Site settings and make sure this site isn't blocked. On a Mac, also allow your browser under System Settings → Privacy & Security → Screen & System Audio Recording, then restart the browser."
        : `Click the padlock (or tune icon) in the address bar → Site settings → set ${Name} to Allow, then reload. Still blocked? Allow your browser under Windows Settings → Privacy & security → ${Name}, or Mac System Settings → Privacy & Security → ${Name}.`;
    case "Firefox":
      return `Click the permissions icon on the left of the address bar, remove the blocked ${Name.toLowerCase()} entry (the small x), reload and choose Allow when asked. If nothing appears, check your system's privacy settings for ${Name.toLowerCase()}.`;
    case "Safari":
      return kind === "screen"
        ? "Safari on Mac needs macOS 12.3+. Allow Safari in System Settings → Privacy & Security → Screen & System Audio Recording. iPhone and iPad can't share screens from a web page."
        : `On Mac: Safari → Settings → Websites → ${Name}, set this site to Allow. On iPhone/iPad: Settings → Apps → Safari → ${Name} → Ask or Allow.`;
    default:
      return `Open the site settings (padlock icon in the address bar), set ${Name} to Allow and reload. Also check your device's privacy settings allow this browser to use the ${Name.toLowerCase()}.`;
  }
}

/* ------------------------------------------------------------------ */
/* Clipboard                                                           */
/* ------------------------------------------------------------------ */

export type CleanPasteOptions = {
  collapseSpaces: boolean;
  straightenQuotes: boolean;
  joinLines: boolean;
  trimLines: boolean;
  stripInvisible: boolean;
};

export const DEFAULT_CLEAN_OPTIONS: CleanPasteOptions = {
  collapseSpaces: true,
  straightenQuotes: true,
  joinLines: false,
  trimLines: true,
  stripInvisible: true,
};

/** Takes plain text (formatting is already gone) and tidies it for pasting into forms, tickets and terminals. */
export function cleanPaste(
  text: string,
  opts: CleanPasteOptions = DEFAULT_CLEAN_OPTIONS
): string {
  let out = text.replace(/\r\n?/g, "\n");
  if (opts.stripInvisible) {
    out = out.replace(/[​-‍⁠﻿­]/g, "").replace(/ /g, " ");
  }
  if (opts.straightenQuotes) {
    out = out
      .replace(/[‘’‛′]/g, "'")
      .replace(/[“”‟″]/g, '"')
      .replace(/[–—]/g, "-")
      .replace(/…/g, "...");
  }
  if (opts.trimLines) {
    out = out
      .split("\n")
      .map((l) => l.trim())
      .join("\n");
  }
  if (opts.collapseSpaces) out = out.replace(/[ \t]{2,}/g, " ");
  if (opts.joinLines) {
    out = out
      .split(/\n{2,}/)
      .map((p) => p.replace(/\n+/g, " ").trim())
      .join("\n\n");
  }
  return out.replace(/\n{3,}/g, "\n\n").trim();
}

export type ClipboardState =
  "granted" | "denied" | "prompt" | "unsupported" | "unknown";

export function clipboardAdvice(
  browser: string,
  kind: "write" | "read"
): string {
  const what = kind === "write" ? "copying" : "pasting from the clipboard";
  switch (browser) {
    case "Firefox":
      return kind === "read"
        ? "Firefox only lets pages read the clipboard when you click a 'Paste' prompt that appears under the cursor. Use the Paste button here, then pick Paste in the small popup. Or press Ctrl/Cmd+V in the box."
        : "Click the button again straight after tapping the page. Firefox allows copying only from a real click.";
    case "Safari":
      return `Safari allows ${what} only straight after you click or tap. If a 'Paste' bubble appears, tap it. Safari → Settings → Websites doesn't have a clipboard switch, so a work profile or content blocker may be the cause.`;
    case "Edge":
    case "Chrome":
      return `Click the padlock (or tune icon) in the address bar → Site settings → set 'Clipboard' to Allow, then reload. If it's greyed out, a work policy controls it. Ask IT.`;
    default:
      return "Check the padlock icon in the address bar for a Clipboard permission and set it to Allow. Make sure the page is secure (https) and you click the button yourself.";
  }
}

/* ------------------------------------------------------------------ */
/* Browser clean-up                                                    */
/* ------------------------------------------------------------------ */

export function cacheClearSteps(
  browser: string,
  os: string
): { title: string; steps: string[] } {
  const mac = os === "macOS";
  const mobile = os === "iOS" || os === "iPadOS" || os === "Android";
  switch (browser) {
    case "Chrome":
      return mobile
        ? {
            title: "Google Chrome (phone/tablet)",
            steps: [
              "Tap ⋮ (or … ) → Delete browsing data (or Settings → Privacy and security → Delete browsing data).",
              "Choose a time range, tick 'Cached images and files' only if you want to keep your logins.",
              "Tap Delete data, then reopen the site.",
            ],
          }
        : {
            title: "Google Chrome",
            steps: [
              `Press ${mac ? "Cmd+Shift+Delete" : "Ctrl+Shift+Delete"} (or Settings → Privacy and security → Delete browsing data).`,
              "Set 'Time range' to 'All time' for stubborn problems or 'Last 24 hours' for a gentle clear.",
              "Tick 'Cached images and files'. Leave 'Cookies and other site data' unticked to stay signed in.",
              "Click Delete data, then reload the page.",
            ],
          };
    case "Edge":
      return {
        title: "Microsoft Edge",
        steps: [
          `Press ${mac ? "Cmd+Shift+Delete" : "Ctrl+Shift+Delete"} (or Settings → Privacy, search, and services → Clear browsing data).`,
          "Choose a time range, then tick 'Cached images and files'.",
          "Leave cookies unticked to stay signed in. Click Clear now and reload.",
        ],
      };
    case "Firefox":
      return {
        title: "Mozilla Firefox",
        steps: [
          `Press ${mac ? "Cmd+Shift+Delete" : "Ctrl+Shift+Delete"} (or Settings → Privacy & Security → Cookies and Site Data → Clear Data).`,
          "Untick 'Cookies and Site Data' to stay signed in; tick 'Cached Web Content'.",
          "Click Clear, then reload the page.",
        ],
      };
    case "Safari":
      return mobile
        ? {
            title: "Safari (iPhone/iPad)",
            steps: [
              "Open Settings → Apps → Safari (older iOS: Settings → Safari).",
              "Tap 'Clear History and Website Data' (this also signs you out of sites).",
              "To keep logins, use Advanced → Website Data → Remove for just this site instead.",
            ],
          }
        : {
            title: "Safari (Mac)",
            steps: [
              "Safari → Settings → Advanced → tick 'Show features for web developers' (or 'Show Develop menu in menu bar').",
              "In the menu bar choose Develop → Empty Caches. This keeps your logins.",
              "For one site only: Settings → Privacy → Manage Website Data → find the site → Remove.",
            ],
          };
    case "Samsung Internet":
      return {
        title: "Samsung Internet",
        steps: [
          "Tap the menu → Settings → Personal browsing data → Delete browsing data.",
          "Tick 'Cached images and files' only, then tap Delete data.",
        ],
      };
    default:
      return {
        title: "Your browser",
        steps: [
          "Open the browser's menu → Settings → Privacy (or History) → Clear browsing data.",
          "Tick 'Cached images and files' and leave cookies unticked to stay signed in.",
          "Clear, then reload the page. Try a private/incognito window to see whether the cache was the problem.",
        ],
      };
  }
}

export type SiteUsage = {
  cookies: number;
  localStorageItems: number;
  localStorageBytes: number;
  sessionStorageItems: number;
  cacheNames: number;
  serviceWorkers: number;
  indexedDbs: number | null;
  quotaBytes: number | null;
  usageBytes: number | null;
};

/** Cookie names that likely hold a sign-in. Matches Supabase (`sb-…-auth-token`) and common session cookies. */
export function isAuthCookieName(name: string): boolean {
  return /(^sb-|auth|session|sid$|token|jwt|csrf|login)/i.test(name);
}

export function splitCookieNames(cookieString: string): string[] {
  return cookieString
    .split(";")
    .map((c) => c.split("=")[0].trim())
    .filter(Boolean);
}

/** Approximate size in bytes of a Storage-like object (UTF-16 → 2 bytes per char). */
export function storageBytes(entries: Array<[string, string]>): number {
  return entries.reduce((n, [k, v]) => n + (k.length + v.length) * 2, 0);
}

/* ------------------------------------------------------------------ */
/* Printer test                                                        */
/* ------------------------------------------------------------------ */

export type PrintSymptom = {
  id: "blank" | "streaky" | "misaligned" | "faded" | "colors" | "offline";
  label: string;
  steps: string[];
  guides: Array<{ id: string; label: string }>;
};

export const PRINT_SYMPTOMS: PrintSymptom[] = [
  {
    id: "blank",
    label: "Printed blank",
    steps: [
      "Check the ink or toner level and that the plastic tape on new cartridges was removed.",
      "Make sure the paper is loaded the right way up and the right size is selected.",
      "Run the printer's own 'print head cleaning' once (from Printer Preferences → Maintenance).",
      "Print this page again. If it's still blank, replace the cartridge.",
    ],
    guides: [
      { id: "poor-print-quality", label: "Poor print quality" },
      { id: "print-job-stuck", label: "Print job stuck" },
    ],
  },
  {
    id: "streaky",
    label: "Streaky or lines through it",
    steps: [
      "Look at the nozzle-check block: gaps or missing lines mean clogged nozzles.",
      "Run 1–2 head cleanings from the printer's Maintenance menu, then print this page again.",
      "Laser printers: take out the toner, rock it gently side to side, and wipe the glass strip with a lint-free cloth.",
      "If streaks stay in the same place on every page, the drum or cartridge is worn.",
    ],
    guides: [{ id: "poor-print-quality", label: "Poor print quality" }],
  },
  {
    id: "misaligned",
    label: "Misaligned or skewed",
    steps: [
      "Check the printed grid: lines should be straight and every square the same size.",
      "Re-seat the paper against both guides and don't overfill the tray.",
      "Run 'Align print heads' from Printer Preferences → Maintenance.",
      "In the print dialog, turn off 'Fit to page' and choose 'Actual size' (100%).",
    ],
    guides: [
      { id: "poor-print-quality", label: "Poor print quality" },
      { id: "paper-jam", label: "Paper jam" },
    ],
  },
  {
    id: "faded",
    label: "Faded or pale",
    steps: [
      "Check the grayscale ramp: the lightest steps should still be visible.",
      "Switch the quality to Normal or High and the paper type to match what's loaded.",
      "Replace low ink or toner. Shake laser toner gently first.",
    ],
    guides: [{ id: "poor-print-quality", label: "Poor print quality" }],
  },
  {
    id: "colors",
    label: "Wrong or missing colours",
    steps: [
      "Compare the printed colour bars: a missing bar means that ink is empty or clogged.",
      "Run a head cleaning, then print again.",
      "Make sure 'Black & white' / 'Grayscale' is off in the print dialog.",
      "Replace the empty colour cartridge.",
    ],
    guides: [{ id: "poor-print-quality", label: "Poor print quality" }],
  },
  {
    id: "offline",
    label: "Nothing came out",
    steps: [
      "Check the printer is on, shows Ready and is on the same network.",
      "Open the print queue and cancel any stuck jobs, then print again.",
      "Make sure this printer is selected as the default.",
    ],
    guides: [
      { id: "printer-offline", label: "Printer showing offline" },
      { id: "print-job-stuck", label: "Print job stuck" },
      { id: "wrong-default-printer", label: "Wrong default printer" },
    ],
  },
];

/* ------------------------------------------------------------------ */
/* Support report                                                      */
/* ------------------------------------------------------------------ */

export type ReportSection = {
  id: string;
  title: string;
  body: string;
  /** Contains something personal (IP, email…) and defaults to OFF. */
  sensitive?: boolean;
};

const IPV4 =
  /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g;
const IPV6 =
  /(?:\b(?:[0-9a-f]{1,4}:){7}[0-9a-f]{1,4}\b|\b(?:[0-9a-f]{1,4}:){1,6}:(?:[0-9a-f]{1,4}(?::[0-9a-f]{1,4}){0,5})?|(?:^|\s)::[0-9a-f:]+)/gi;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const SECRET =
  /\b(?:eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}|sk-[A-Za-z0-9]{16,}|[A-Fa-f0-9]{32,})\b/g;

/** Masks IP addresses, email addresses and token-like strings. */
export function scrubSensitive(text: string): string {
  return text
    .replace(SECRET, "[secret removed]")
    .replace(EMAIL, "[email removed]")
    .replace(IPV4, "[ip removed]")
    .replace(IPV6, "[ip removed]");
}

export function formatSupportReport(args: {
  sections: ReportSection[];
  includeIds: string[];
  note?: string;
  when?: Date | null;
  allowPersonal?: boolean;
}): string {
  const {
    sections,
    includeIds,
    note,
    when = new Date(),
    allowPersonal = false,
  } = args;
  const out: string[] = [
    `HelpDesk First support report${when ? ` (${when.toLocaleString("en-US")})` : ""}`,
  ];
  const trimmed = (note ?? "").trim();
  if (trimmed)
    out.push(
      `What's wrong:\n${allowPersonal ? trimmed : scrubSensitive(trimmed)}`
    );
  for (const s of sections) {
    if (!includeIds.includes(s.id)) continue;
    const body = s.sensitive
      ? s.body
      : allowPersonal
        ? s.body
        : scrubSensitive(s.body);
    out.push(`== ${s.title} ==\n${body}`);
  }
  return out.join("\n\n");
}

/** Short one-line problem statement to prefill the assistant (URLs have length limits). */
export function ticketSeed(
  note: string,
  fallback = "Support report from the Toolkit",
  max = 140
): string {
  const first = note.trim().split(/\n/)[0] ?? "";
  const cleaned = scrubSensitive(first).trim();
  const base = cleaned || fallback;
  return base.length > max ? `${base.slice(0, max - 1).trimEnd()}…` : base;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
