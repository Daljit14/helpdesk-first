"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  Cpu,
  Lightbulb,
  RefreshCw,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  measureRefreshRate,
  type ReportLine,
  type ToolReport,
} from "./diagnostics";
import {
  capabilityTips,
  classifyRenderer,
  type FeatureRow,
  type RendererInfo,
} from "./dev-logic";
import { Panel, useSaveResult } from "./dev-shared";
import { StatTile, ToolButton, ToolCard, ToolNotice } from "./tool-shell";

type GpuResult = {
  webgl: boolean;
  webgl2: boolean;
  /** WebGL only starts when the browser promises real hardware (failIfMajorPerformanceCaveat). */
  hardwareContext: boolean | null;
  rendererRaw: string | null;
  vendorRaw: string | null;
  maxTexture: number | null;
  renderer: RendererInfo;
  features: FeatureRow[];
  cores: number | null;
  memoryGb: number | null;
  hz: number | null;
};

type Status = "idle" | "running" | "done" | "error";

function tryContext(
  kind: "webgl" | "webgl2",
  strict: boolean
): WebGLRenderingContext | WebGL2RenderingContext | null {
  try {
    const c = document.createElement("canvas");
    const attrs: WebGLContextAttributes = strict
      ? { failIfMajorPerformanceCaveat: true }
      : {};
    const ctx =
      kind === "webgl2"
        ? c.getContext("webgl2", attrs)
        : ((c.getContext("webgl", attrs) as WebGLRenderingContext | null) ??
          (c.getContext(
            "experimental-webgl",
            attrs
          ) as WebGLRenderingContext | null));
    return ctx as WebGLRenderingContext | WebGL2RenderingContext | null;
  } catch {
    return null;
  }
}

function release(gl: WebGLRenderingContext | WebGL2RenderingContext | null) {
  try {
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    // ignore
  }
}

function supports(fn: () => boolean): boolean {
  try {
    return fn();
  } catch {
    return false;
  }
}

function detect(): Omit<GpuResult, "hz"> {
  const gl = tryContext("webgl", false);
  const gl2 = tryContext("webgl2", false);
  const strict = tryContext("webgl", true);
  let rendererRaw: string | null = null;
  let vendorRaw: string | null = null;
  let maxTexture: number | null = null;
  const source = gl ?? gl2;
  if (source) {
    try {
      const ext = source.getExtension("WEBGL_debug_renderer_info");
      if (ext) {
        rendererRaw =
          String(source.getParameter(ext.UNMASKED_RENDERER_WEBGL) ?? "") ||
          null;
        vendorRaw =
          String(source.getParameter(ext.UNMASKED_VENDOR_WEBGL) ?? "") || null;
      }
      maxTexture = Number(source.getParameter(source.MAX_TEXTURE_SIZE)) || null;
    } catch {
      // keep nulls
    }
  }
  const webgl = !!gl || !!gl2;
  const hardwareContext = webgl ? !!strict : null;
  release(gl);
  release(gl2);
  release(strict);

  let renderer = classifyRenderer(rendererRaw, webgl);
  // A browser that refuses a hardware-only context is almost certainly software rendering.
  if (webgl && hardwareContext === false && renderer.kind !== "software") {
    renderer = {
      kind: "software",
      vendor: renderer.vendor,
      label:
        rendererRaw ??
        "Software rendering (browser refused a hardware context)",
    };
  }

  const nav = navigator as Navigator & {
    deviceMemory?: number;
    gpu?: unknown;
    clipboard?: { writeText?: unknown };
  };
  const features: FeatureRow[] = [
    {
      id: "canvas",
      label: "Canvas 2D",
      supported: supports(
        () => !!document.createElement("canvas").getContext("2d")
      ),
    },
    { id: "webgl", label: "WebGL", supported: !!gl },
    { id: "webgl2", label: "WebGL 2", supported: !!gl2 },
    {
      id: "webgpu",
      label: "WebGPU",
      supported: supports(() => !!nav.gpu),
      detail: "Optional, newer",
    },
    {
      id: "wasm",
      label: "WebAssembly",
      supported: supports(
        () =>
          typeof WebAssembly === "object" &&
          typeof WebAssembly.instantiate === "function"
      ),
    },
    {
      id: "webrtc",
      label: "WebRTC (calls)",
      supported: supports(() => typeof RTCPeerConnection === "function"),
    },
    {
      id: "getusermedia",
      label: "Camera & mic access",
      supported: supports(() => !!navigator.mediaDevices?.getUserMedia),
    },
    {
      id: "displaymedia",
      label: "Screen sharing",
      supported: supports(() => !!navigator.mediaDevices?.getDisplayMedia),
      detail: "Not on phones",
    },
    {
      id: "serviceworker",
      label: "Service workers",
      supported: supports(() => "serviceWorker" in navigator),
    },
    {
      id: "indexeddb",
      label: "IndexedDB",
      supported: supports(
        () => typeof indexedDB !== "undefined" && indexedDB !== null
      ),
    },
    {
      id: "clipboard",
      label: "Clipboard API",
      supported: supports(() => typeof nav.clipboard?.writeText === "function"),
    },
    {
      id: "notifications",
      label: "Notifications",
      supported: supports(() => typeof Notification === "function"),
    },
    {
      id: "websocket",
      label: "WebSocket",
      supported: supports(() => typeof WebSocket === "function"),
    },
  ];
  return {
    webgl,
    webgl2: !!gl2,
    hardwareContext,
    rendererRaw,
    vendorRaw,
    maxTexture,
    renderer,
    features,
    cores: nav.hardwareConcurrency || null,
    memoryGb: typeof nav.deviceMemory === "number" ? nav.deviceMemory : null,
  };
}

const ACCEL_LABEL: Record<RendererInfo["kind"], string> = {
  hardware: "On",
  software: "Likely off",
  unknown: "Probably on",
  none: "Unknown",
};

export function DevGpuTool() {
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<GpuResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const runId = useRef(0);

  async function run() {
    const my = ++runId.current;
    setStatus("running");
    setError(null);
    try {
      const base = detect();
      const hz = await Promise.race([
        measureRefreshRate(900),
        new Promise<null>((r) => window.setTimeout(() => r(null), 3000)),
      ]).catch(() => null);
      if (runId.current !== my) return;
      setResult({ ...base, hz });
      setStatus("done");
    } catch {
      if (runId.current !== my) return;
      setError(
        "The browser threw an error while checking graphics support. Reload the page and try again."
      );
      setStatus("error");
    }
  }

  useEffect(() => {
    queueMicrotask(() => void run());
    return () => {
      runId.current++;
    };
  }, []);

  const missing = result
    ? result.features.filter(
        (f) =>
          !f.supported &&
          ["webrtc", "wasm", "serviceworker", "indexeddb"].includes(f.id)
      )
    : [];
  const tips = result
    ? capabilityTips({
        renderer: result.renderer,
        webgl2: result.webgl2,
        missing,
        cores: result.cores,
        memoryGb: result.memoryGb,
      })
    : [];

  let report: ToolReport | null = null;
  if (result) {
    const r = result.renderer;
    const lines: ReportLine[] = [
      ["Graphics (WebGL) renderer", result.rendererRaw ?? r.label],
      ["Hardware acceleration", ACCEL_LABEL[r.kind]],
      [
        "WebGL / WebGL 2",
        `${result.webgl ? "Yes" : "No"} / ${result.webgl2 ? "Yes" : "No"}`,
      ],
      ["Display refresh", result.hz ? `${result.hz} Hz` : "Not measured"],
      ["CPU cores", result.cores ? String(result.cores) : "Not reported"],
      [
        "Missing features",
        result.features
          .filter(
            (f) => !f.supported && f.id !== "webgpu" && f.id !== "displaymedia"
          )
          .map((f) => f.label)
          .join(", ") || "None",
      ],
    ];
    const bad = r.kind === "none" || missing.length > 0;
    const warn = r.kind === "software" || !result.webgl2;
    report = {
      tool: "Graphics & browser capabilities",
      tone: bad ? "bad" : warn ? "warn" : "good",
      verdict: bad
        ? "Some features video calls and web apps need are missing."
        : r.kind === "software"
          ? "Graphics acceleration looks switched off. Video and meetings may lag."
          : !result.webgl2
            ? "Graphics work, but WebGL 2 is missing."
            : "Graphics and browser features look healthy.",
      tip: tips[0],
      lines,
    };
  }
  useSaveResult("dev-gpu", report);

  const running = status === "running";

  return (
    <ToolCard
      id="dev-gpu"
      icon={Cpu}
      title="Graphics & browser capabilities"
      description="Shows what your browser can do, and whether your graphics chip is actually being used. Handy when video, meetings or web apps lag."
      report={report}
      active={running}
      live={
        running
          ? "Checking graphics support"
          : status === "done" && report
            ? report.verdict
            : undefined
      }
      actions={
        <ToolButton
          icon={RefreshCw}
          spinning={running}
          onClick={() => void run()}
          disabled={running}
        >
          {status === "error"
            ? "Try again"
            : running
              ? "Checking..."
              : "Check again"}
        </ToolButton>
      }
    >
      {status === "error" && error && (
        <ToolNotice tone="bad" title="Couldn't check graphics">
          {error}
        </ToolNotice>
      )}
      {running && !result && (
        <p
          className="text-center text-sm font-semibold text-white/60"
          aria-hidden
        >
          Looking at your graphics...
        </p>
      )}

      {result && (
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
            <StatTile
              icon={Cpu}
              label="Graphics chip"
              value={
                result.renderer.kind === "none"
                  ? "No WebGL"
                  : result.renderer.vendor
              }
              tone={
                result.renderer.kind === "software" ||
                result.renderer.kind === "none"
                  ? "warn"
                  : undefined
              }
            />
            <StatTile
              label="Acceleration"
              value={ACCEL_LABEL[result.renderer.kind]}
              tone={
                result.renderer.kind === "hardware"
                  ? "good"
                  : result.renderer.kind === "software"
                    ? "bad"
                    : undefined
              }
              delay={0.04}
            />
            <StatTile
              label="WebGL"
              value={
                result.webgl2
                  ? "WebGL 2"
                  : result.webgl
                    ? "WebGL 1 only"
                    : "Unavailable"
              }
              tone={result.webgl2 ? "good" : "warn"}
              delay={0.08}
            />
            <StatTile
              label="Screen refresh"
              value={result.hz ? `${result.hz} Hz` : "-"}
              delay={0.12}
            />
          </div>

          <p
            className="min-w-0 break-words rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white/70"
            data-testid="renderer-string"
          >
            Renderer: {result.rendererRaw ?? result.renderer.label}
            {result.maxTexture ? ` · max texture ${result.maxTexture}px` : ""}
          </p>

          <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-white/55">
              Feature support
            </p>
            <ul
              className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3"
              data-testid="feature-matrix"
            >
              {result.features.map((f, i) => (
                <li
                  key={f.id}
                  data-supported={f.supported}
                  className="hf-pop flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm"
                  style={{ animationDelay: `${i * 0.03}s` }}
                >
                  <span
                    className={cn(
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                      f.supported
                        ? "bg-[#5ee0a8]/20 text-[#5ee0a8]"
                        : "bg-[#ff9bb3]/20 text-[#ff9bb3]"
                    )}
                  >
                    {f.supported ? (
                      <Check className="h-3.5 w-3.5" aria-label="Supported" />
                    ) : (
                      <X className="h-3.5 w-3.5" aria-label="Not supported" />
                    )}
                  </span>
                  <span className="min-w-0 font-bold">{f.label}</span>
                  {f.detail && !f.supported && (
                    <span className="ml-auto truncate text-[11px] font-semibold text-white/45">
                      {f.detail}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <Panel
            title="Why does video or a meeting lag?"
            icon={<Lightbulb className="h-3.5 w-3.5" aria-hidden />}
          >
            <ul className="grid gap-2 text-sm text-white/85">
              {tips.map((t, i) => (
                <li key={i} className="flex gap-2.5">
                  <AlertTriangle
                    className={cn(
                      "mt-0.5 h-4 w-4 shrink-0",
                      result.renderer.kind === "software" || missing.length > 0
                        ? "text-[#ffd27c]"
                        : "text-[#9ee7ff]"
                    )}
                    aria-hidden
                  />
                  <span className="font-medium">{t}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      )}
    </ToolCard>
  );
}
