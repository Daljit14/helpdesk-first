"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Play, RefreshCw, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  listDevices,
  stopStream,
  mediaErrorGuidance,
  mediaSupported,
  type ReportLine,
  type ToolReport,
} from "./diagnostics";
import { ToolButton, ToolCard, ToolNotice } from "./tool-shell";

type Status =
  "idle" | "starting" | "live" | "stopped" | "error" | "unsupported";
type CamInfo = {
  label: string;
  width: number | null;
  height: number | null;
  fps: number | null;
};

export function CameraTool() {
  const [status, setStatus] = useState<Status>("idle");
  const [devices, setDevices] = useState<Array<{ id: string; label: string }>>(
    []
  );
  const [selected, setSelected] = useState("");
  const [info, setInfo] = useState<CamInfo | null>(null);
  const [error, setError] = useState<ReturnType<
    typeof mediaErrorGuidance
  > | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const aliveRef = useRef(true);
  const attemptRef = useRef(0);
  const [slow, setSlow] = useState(false);

  // Strict Mode runs effect -> cleanup -> effect, so "alive" is set in the
  // setup half too. Bumping attemptRef invalidates any getUserMedia call that
  // is still waiting for the permission prompt when the tool unmounts (tab
  // switch) — its stream is stopped the moment it arrives instead of leaking.
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      attemptRef.current++;
      stopStream(streamRef.current);
      streamRef.current = null;
    };
  }, []);

  // If the permission prompt is ignored/hidden, say so after a few seconds
  // instead of showing "Waiting…" forever.
  useEffect(() => {
    if (status !== "starting") return;
    const timer = window.setTimeout(() => setSlow(true), 8000);
    return () => {
      window.clearTimeout(timer);
      setSlow(false);
    };
  }, [status]);

  function releaseStream() {
    stopStream(streamRef.current);
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }

  async function start(deviceId?: string) {
    if (!mediaSupported()) {
      setStatus("unsupported");
      return;
    }
    const attempt = ++attemptRef.current;
    const current = () => aliveRef.current && attempt === attemptRef.current;
    releaseStream();
    setError(null);
    setStatus("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: deviceId ? { deviceId: { exact: deviceId } } : true,
        audio: false,
      });
      if (!current()) {
        stopStream(stream); // superseded, stopped, or unmounted while waiting
        return;
      }
      streamRef.current = stream;
      const track = stream.getVideoTracks()[0];
      if (track) {
        track.onended = () => {
          if (current()) stop();
        };
      }
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        // play() rejects if the element is detached or an autoplay rule bites;
        // the stream is still live, so don't treat it as a failure.
        await video.play().catch(() => undefined);
        if (!current()) return;
      }
      const settings = track?.getSettings() ?? {};
      setInfo({
        label: track?.label || "Camera",
        width: settings.width ?? null,
        height: settings.height ?? null,
        fps: settings.frameRate ? Math.round(settings.frameRate) : null,
      });
      setSelected(settings.deviceId ?? deviceId ?? "");
      setStatus("live");
      // Device labels are empty until permission is granted, so list AFTER.
      const found = await listDevices("videoinput");
      if (current()) setDevices(found);
    } catch (err) {
      if (!current()) return;
      releaseStream();
      setError(mediaErrorGuidance(err, "camera"));
      setStatus("error");
      const found = await listDevices("videoinput");
      if (current()) setDevices(found);
    }
  }

  function stop() {
    attemptRef.current++;
    releaseStream();
    setStatus((s) => (s === "live" || s === "starting" ? "stopped" : s));
  }

  const running = status === "live" || status === "starting";

  let report: ToolReport | null = null;
  if (status === "error" && error) {
    report = {
      tool: "Camera",
      tone: error.tone,
      verdict: error.verdict,
      tip: error.tip,
      lines: [
        ["Result", error.verdict],
        ["Cameras found", String(devices.length)],
      ],
    };
  } else if ((status === "live" || status === "stopped") && info) {
    const lines: ReportLine[] = [
      ["Camera", info.label],
      [
        "Resolution",
        info.width && info.height
          ? `${info.width} × ${info.height}`
          : "Unknown",
      ],
      ["Frame rate", info.fps ? `${info.fps} fps` : "Unknown"],
      ["Cameras found", String(devices.length)],
    ];
    report = {
      tool: "Camera",
      tone: "good",
      verdict: "Your camera is working in this browser.",
      tip: "If you can see yourself here but not in a meeting, the meeting app is probably using a different camera or has been blocked — check its video settings and address-bar permissions.",
      lines,
    };
  }

  return (
    <ToolCard
      id="camera"
      icon={Camera}
      title="Camera test"
      description="Turns on your camera and shows a private preview. The video never leaves this page."
      report={report}
      active={running}
      live={
        status === "starting"
          ? "Starting camera"
          : status === "live"
            ? "Camera preview is on"
            : status === "stopped"
              ? "Camera turned off"
              : status === "error" && error
                ? error.verdict
                : undefined
      }
      actions={
        status === "starting" ? (
          <ToolButton icon={RefreshCw} spinning disabled>
            Starting…
          </ToolButton>
        ) : status === "live" ? (
          <ToolButton variant="danger" icon={Square} onClick={stop}>
            Stop camera
          </ToolButton>
        ) : (
          <ToolButton
            icon={status === "idle" ? Play : RefreshCw}
            onClick={() => start(selected || undefined)}
          >
            {status === "idle" ? "Start camera" : "Try again"}
          </ToolButton>
        )
      }
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="relative aspect-video overflow-hidden rounded-[20px] border border-white/10 bg-[#0a0716]">
          <video
            ref={videoRef}
            muted
            playsInline
            aria-label="Camera preview"
            className={cn(
              "h-full w-full -scale-x-100 object-cover transition-opacity duration-500",
              status === "live" ? "opacity-100" : "opacity-0"
            )}
          />
          {/* Frame corners */}
          <span aria-hidden className="pointer-events-none absolute inset-3">
            <span className="absolute left-0 top-0 h-5 w-5 rounded-tl-lg border-l-2 border-t-2 border-white/60" />
            <span className="absolute right-0 top-0 h-5 w-5 rounded-tr-lg border-r-2 border-t-2 border-white/60" />
            <span className="absolute bottom-0 left-0 h-5 w-5 rounded-bl-lg border-b-2 border-l-2 border-white/60" />
            <span className="absolute bottom-0 right-0 h-5 w-5 rounded-br-lg border-b-2 border-r-2 border-white/60" />
          </span>
          {status === "starting" && (
            <span
              aria-hidden
              className="hf-tool-scan pointer-events-none absolute inset-x-0 top-0 h-1/3 bg-[linear-gradient(180deg,transparent,rgb(124_92_255/0.45),transparent)]"
            />
          )}
          {status === "live" && (
            <span className="hf-pop absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wider backdrop-blur">
              <span className="relative flex h-2 w-2">
                <span className="hf-ping absolute inset-0 rounded-full bg-[#ff5c7a]" />
                <span className="relative h-2 w-2 rounded-full bg-[#ff5c7a]" />
              </span>
              Live · private
            </span>
          )}
          {status !== "live" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center">
              <Camera
                className={cn(
                  "h-10 w-10 text-white/40",
                  status === "starting" && "hf-blink"
                )}
                aria-hidden
              />
              <p className="text-sm font-semibold text-white/60">
                {status === "starting"
                  ? "Waiting for permission…"
                  : status === "stopped"
                    ? "Camera is off"
                    : "Preview appears here"}
              </p>
            </div>
          )}
        </div>

        <div className="grid content-start gap-3">
          {status === "unsupported" && (
            <ToolNotice title="Not supported on this browser">
              This page can&apos;t access cameras — it must be opened over https
              in an up-to-date Chrome, Edge, Firefox or Safari (not inside an
              app&apos;s built-in browser).
            </ToolNotice>
          )}
          {status === "starting" && (
            <ToolNotice title="Look for a permission prompt">
              {slow
                ? "Still waiting. Check the address bar for a camera prompt or a blocked-camera icon, and make sure no other app (Zoom, Teams) is using it."
                : "Your browser will ask to use the camera — choose Allow."}
            </ToolNotice>
          )}
          {info && (status === "live" || status === "stopped") && (
            <dl className="grid grid-cols-2 gap-2.5 text-sm">
              <div className="col-span-2 rounded-2xl border border-white/10 bg-white/5 p-3">
                <dt className="text-[11px] font-bold uppercase tracking-wide text-white/55">
                  Camera
                </dt>
                <dd className="mt-1 truncate font-extrabold">{info.label}</dd>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                <dt className="text-[11px] font-bold uppercase tracking-wide text-white/55">
                  Resolution
                </dt>
                <dd className="mt-1 font-extrabold tabular-nums">
                  {info.width && info.height
                    ? `${info.width}×${info.height}`
                    : "—"}
                </dd>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                <dt className="text-[11px] font-bold uppercase tracking-wide text-white/55">
                  Frame rate
                </dt>
                <dd className="mt-1 font-extrabold tabular-nums">
                  {info.fps ? `${info.fps} fps` : "—"}
                </dd>
              </div>
            </dl>
          )}
          {devices.length > 1 && (
            <label className="grid gap-1.5 text-sm font-bold">
              Switch camera
              <select
                value={selected}
                onChange={(e) => {
                  setSelected(e.target.value);
                  void start(e.target.value);
                }}
                className="h-11 rounded-xl border border-white/15 bg-[#1b1433] px-3 text-sm font-semibold text-white outline-none focus:border-[#c9b8ff] focus:ring-4 focus:ring-[#7c5cff]/30"
              >
                {devices.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          {devices.length > 0 && (
            <p className="text-xs font-semibold text-white/55">
              {devices.length} camera{devices.length === 1 ? "" : "s"} detected
            </p>
          )}
          {status === "idle" && (
            <p className="text-sm text-white/60">
              Tip: close Zoom, Teams or FaceTime first — only one app can use
              the camera at a time on many devices.
            </p>
          )}
        </div>
      </div>
    </ToolCard>
  );
}
