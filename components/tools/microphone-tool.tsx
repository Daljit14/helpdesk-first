"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Play, RefreshCw, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getAudioContextCtor,
  listDevices,
  mediaErrorGuidance,
  mediaSupported,
  type ToolReport,
} from "./diagnostics";
import { ToolButton, ToolCard, ToolNotice } from "./tool-shell";

type Status =
  "idle" | "starting" | "live" | "stopped" | "error" | "unsupported";

const BARS = 28;
const HEARD_THRESHOLD = 0.08;
const QUIET_AFTER_MS = 5000;

export function MicrophoneTool() {
  const [status, setStatus] = useState<Status>("idle");
  const [history, setHistory] = useState<number[]>(() => Array(BARS).fill(0));
  const [level, setLevel] = useState(0);
  const [heard, setHeard] = useState(false);
  const [quietLong, setQuietLong] = useState(false);
  const [devices, setDevices] = useState<Array<{ id: string; label: string }>>(
    []
  );
  const [selected, setSelected] = useState("");
  const [label, setLabel] = useState("");
  const [error, setError] = useState<ReturnType<
    typeof mediaErrorGuidance
  > | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef(0);

  useEffect(
    () => () => {
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      void ctxRef.current?.close().catch(() => undefined);
      ctxRef.current = null;
    },
    []
  );

  function release() {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void ctxRef.current?.close().catch(() => undefined);
    ctxRef.current = null;
  }

  async function start(deviceId?: string) {
    const Ctor = getAudioContextCtor();
    if (!mediaSupported() || !Ctor) {
      setStatus("unsupported");
      return;
    }
    release();
    setError(null);
    setHeard(false);
    setQuietLong(false);
    setLevel(0);
    setHistory(Array(BARS).fill(0));
    setStatus("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: deviceId ? { deviceId: { exact: deviceId } } : true,
        video: false,
      });
      streamRef.current = stream;
      const track = stream.getAudioTracks()[0];
      setLabel(track?.label || "Microphone");
      setSelected(track?.getSettings().deviceId ?? deviceId ?? "");
      if (track) track.onended = () => stop();

      const ctx = new Ctor();
      ctxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser); // not to destination — no feedback loop
      const data = new Uint8Array(analyser.fftSize);
      const startedAt = performance.now();
      let smooth = 0;
      let frame = 0;
      let heardLocal = false;

      const loop = (now: number) => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length);
        const value = Math.min(1, rms * 4.5);
        smooth = value > smooth ? value : smooth * 0.9 + value * 0.1;
        frame++;
        if (frame % 2 === 0) {
          setLevel(smooth);
          setHistory((h) => [...h.slice(1), smooth]);
        }
        if (!heardLocal && smooth > HEARD_THRESHOLD) {
          heardLocal = true;
          setHeard(true);
          setQuietLong(false);
        }
        if (!heardLocal && now - startedAt > QUIET_AFTER_MS) setQuietLong(true);
        rafRef.current = requestAnimationFrame(loop);
      };
      rafRef.current = requestAnimationFrame(loop);

      setDevices(await listDevices("audioinput"));
      setStatus("live");
    } catch (err) {
      release();
      setError(mediaErrorGuidance(err, "microphone"));
      setDevices(await listDevices("audioinput"));
      setStatus("error");
    }
  }

  function stop() {
    release();
    setLevel(0);
    setStatus((s) => (s === "live" || s === "starting" ? "stopped" : s));
  }

  const running = status === "live" || status === "starting";

  let report: ToolReport | null = null;
  if (status === "error" && error) {
    report = {
      tool: "Microphone",
      tone: error.tone,
      verdict: error.verdict,
      tip: error.tip,
      lines: [
        ["Result", error.verdict],
        ["Microphones found", String(devices.length)],
      ],
    };
  } else if (status === "live" || status === "stopped") {
    const lines: ToolReport["lines"] = [
      ["Microphone", label || "Unknown"],
      ["Sound detected", heard ? "Yes" : "No"],
      ["Microphones found", String(devices.length)],
    ];
    if (heard) {
      report = {
        tool: "Microphone",
        tone: "good",
        verdict: "Your microphone is picking up sound.",
        tip: "If people still can't hear you in a call, make sure the call app uses this same microphone and that you're not muted in the app or on your headset.",
        lines,
      };
    } else if (quietLong || status === "stopped") {
      report = {
        tool: "Microphone",
        tone: "warn",
        verdict: "We can't hear anything from this microphone.",
        tip: "Check the mute switch on your headset or keyboard, pick a different microphone below, and make sure the right input is chosen in your system sound settings.",
        lines,
      };
    }
  }

  const pct = Math.round(level * 100);

  return (
    <ToolCard
      id="microphone"
      icon={Mic}
      title="Microphone test"
      description="Listens to your microphone and shows a live level meter. Nothing is recorded or sent anywhere."
      report={report}
      active={running}
      live={
        status === "starting"
          ? "Starting microphone"
          : status === "live"
            ? heard
              ? "Sound detected"
              : "Listening. Say something."
            : status === "stopped"
              ? "Microphone turned off"
              : status === "error" && error
                ? error.verdict
                : undefined
      }
      actions={
        running ? (
          <ToolButton variant="danger" icon={Square} onClick={stop}>
            Stop listening
          </ToolButton>
        ) : (
          <ToolButton
            icon={status === "idle" ? Play : RefreshCw}
            onClick={() => start(selected || undefined)}
          >
            {status === "idle" ? "Start microphone" : "Try again"}
          </ToolButton>
        )
      }
    >
      <div className="grid gap-4">
        <div className="relative rounded-[20px] border border-white/10 bg-[#0a0716] p-4">
          <div className="flex items-center justify-between text-xs font-bold text-white/60">
            <span className="inline-flex items-center gap-2">
              <span
                className={cn(
                  "relative flex h-2.5 w-2.5 rounded-full",
                  status === "live" ? "bg-[#5ee0a8]" : "bg-white/25"
                )}
              >
                {status === "live" && (
                  <span className="hf-ping absolute inset-0 rounded-full bg-[#5ee0a8]" />
                )}
              </span>
              {status === "live"
                ? heard
                  ? "Hearing you"
                  : "Listening — say “testing, one, two”"
                : status === "starting"
                  ? "Waiting for permission…"
                  : "Microphone is off"}
            </span>
            <span className="tabular-nums">
              {status === "live" ? `${pct}%` : "—"}
            </span>
          </div>
          <div
            className="mt-3 flex h-24 items-center gap-[3px]"
            role="meter"
            aria-label="Microphone input level"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
          >
            {history.map((v, i) => {
              const h =
                status === "live" ? Math.max(6, Math.min(100, v * 100)) : 6;
              return (
                <span
                  key={i}
                  aria-hidden
                  className={cn(
                    "flex-1 rounded-full transition-[height] duration-75",
                    v > 0.6
                      ? "bg-[linear-gradient(180deg,#ff9bb3,#e0245e)]"
                      : v > HEARD_THRESHOLD
                        ? "bg-[linear-gradient(180deg,#9ee7ff,#7c5cff)]"
                        : "bg-white/15",
                    status === "starting" && "hf-tool-idle-bar"
                  )}
                  style={{
                    height: `${h}%`,
                    animationDelay: `${(i % 7) * 0.08}s`,
                  }}
                />
              );
            })}
          </div>
        </div>

        {status === "unsupported" && (
          <ToolNotice title="Not supported on this browser">
            This browser can&apos;t access microphones from web pages. Try an
            up-to-date Chrome, Edge, Firefox or Safari.
          </ToolNotice>
        )}

        <div className="flex flex-wrap items-end gap-3">
          {label && (status === "live" || status === "stopped") && (
            <p className="min-w-0 flex-1 truncate text-sm font-semibold text-white/75">
              Using: <span className="font-extrabold text-white">{label}</span>
            </p>
          )}
          {devices.length > 1 && (
            <label className="grid min-w-52 gap-1.5 text-sm font-bold">
              Switch microphone
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
        </div>
      </div>
    </ToolCard>
  );
}
