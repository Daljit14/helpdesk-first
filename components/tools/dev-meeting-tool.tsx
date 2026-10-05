"use client";

import { useEffect, useRef, useState } from "react";
import {
  Camera,
  CheckCircle2,
  Circle,
  Mic,
  Monitor,
  Play,
  RefreshCw,
  Video,
  Volume2,
  X,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getAudioContextCtor,
  listDevices,
  mediaErrorGuidance,
  mediaSupported,
  type ReportLine,
  type ToolReport,
} from "./diagnostics";
import {
  cameraQuality,
  fpsFromTimes,
  levelToPercent,
  meetingSummary,
  micLevelState,
  permissionHelp,
  rmsLevel,
  type MeetingCheck,
  type MeetingCheckId,
  type MeetingCheckState,
} from "./dev-logic";
import { Meter, Panel, useEnv, useSaveResult, withTimeout } from "./dev-shared";
import { ToolButton, ToolCard, ToolNotice } from "./tool-shell";

type Row = { state: MeetingCheckState; detail: string };
type Rows = Record<MeetingCheckId, Row>;
type Guidance = ReturnType<typeof mediaErrorGuidance> & { denied: boolean };
type Stage = "idle" | "running" | "done";

const LABELS: Record<MeetingCheckId, string> = {
  camera: "Camera",
  mic: "Microphone",
  speaker: "Speakers",
  share: "Screen sharing",
};
const ORDER: MeetingCheckId[] = ["camera", "mic", "speaker", "share"];
const MIC_MS = 3000;
const PROMPT_TIMEOUT_MS = 30_000;

const BLANK: Rows = {
  camera: { state: "pending", detail: "Not checked yet" },
  mic: { state: "pending", detail: "Not checked yet" },
  speaker: { state: "pending", detail: "Not checked yet" },
  share: { state: "pending", detail: "Not checked yet" },
};

function isDenied(err: unknown): boolean {
  const n =
    err && typeof err === "object" && "name" in err
      ? String((err as { name: unknown }).name)
      : "";
  return (
    n === "NotAllowedError" ||
    n === "PermissionDeniedError" ||
    n === "SecurityError"
  );
}

function stopStream(s: MediaStream | null) {
  s?.getTracks().forEach((t) => {
    try {
      t.stop();
    } catch {
      // already stopped
    }
  });
}

/** Counts delivered video frames for `ms` and returns the average frames per second. */
function measureFps(
  video: HTMLVideoElement,
  ms: number
): Promise<number | null> {
  return new Promise((resolve) => {
    const times: number[] = [];
    let done = false;
    let raf = 0;
    const v = video as HTMLVideoElement & {
      requestVideoFrameCallback?: (cb: (now: number) => void) => number;
    };
    const end = () => {
      if (done) return;
      done = true;
      cancelAnimationFrame(raf);
      resolve(fpsFromTimes(times));
    };
    window.setTimeout(end, ms);
    if (typeof v.requestVideoFrameCallback === "function") {
      const tick = (now: number) => {
        if (done) return;
        times.push(now);
        v.requestVideoFrameCallback?.(tick);
      };
      v.requestVideoFrameCallback(tick);
    } else {
      let last = -1;
      const loop = (now: number) => {
        if (done) return;
        if (video.currentTime !== last) {
          last = video.currentTime;
          times.push(now);
        }
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    }
  });
}

function snapshot(video: HTMLVideoElement): string | null {
  try {
    if (!video.videoWidth) return null;
    const c = document.createElement("canvas");
    c.width = 320;
    c.height = Math.round((320 * video.videoHeight) / video.videoWidth);
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    ctx.translate(c.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.7);
  } catch {
    return null;
  }
}

export function DevMeetingTool() {
  const env = useEnv();
  const browser = env?.browser ?? "";
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const shareRef = useRef<HTMLVideoElement | null>(null);
  const camStream = useRef<MediaStream | null>(null);
  const micStream = useRef<MediaStream | null>(null);
  const shareStream = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const runId = useRef(0);
  const rafRef = useRef(0);
  const shareTimer = useRef(0);

  const [stage, setStage] = useState<Stage>("idle");
  const [step, setStep] = useState<MeetingCheckId | null>(null);
  const [rows, setRows] = useState<Rows>(BLANK);
  const [camLive, setCamLive] = useState(false);
  const [thumb, setThumb] = useState<string | null>(null);
  const [micLevel, setMicLevel] = useState(0);
  const [micPeak, setMicPeak] = useState<number | null>(null);
  const [counts, setCounts] = useState<{ cams: number; mics: number }>({
    cams: 0,
    mics: 0,
  });
  const [camInfo, setCamInfo] = useState<{
    label: string;
    w: number | null;
    h: number | null;
    fps: number | null;
  } | null>(null);
  const [errors, setErrors] = useState<{ camera?: Guidance; mic?: Guidance }>(
    {}
  );
  const [awaitingHeard, setAwaitingHeard] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [unsupported, setUnsupported] = useState(false);

  function releaseAll() {
    cancelAnimationFrame(rafRef.current);
    window.clearTimeout(shareTimer.current);
    stopStream(camStream.current);
    stopStream(micStream.current);
    stopStream(shareStream.current);
    camStream.current = null;
    micStream.current = null;
    shareStream.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    if (shareRef.current) shareRef.current.srcObject = null;
    setCamLive(false);
    setSharing(false);
  }

  useEffect(
    () => () => {
      runId.current++;
      cancelAnimationFrame(rafRef.current);
      window.clearTimeout(shareTimer.current);
      stopStream(camStream.current);
      stopStream(micStream.current);
      stopStream(shareStream.current);
      void ctxRef.current?.close().catch(() => undefined);
      ctxRef.current = null;
    },
    []
  );

  function setRow(
    id: MeetingCheckId,
    state: MeetingCheckState,
    detail: string
  ) {
    setRows((r) => ({ ...r, [id]: { state, detail } }));
  }

  /** getUserMedia that never leaks a stream if the run was cancelled while the prompt was open. */
  async function acquire(
    constraints: MediaStreamConstraints,
    my: number
  ): Promise<MediaStream | null> {
    const stream = await withTimeout(
      navigator.mediaDevices.getUserMedia(constraints),
      PROMPT_TIMEOUT_MS
    );
    if (runId.current !== my) {
      stopStream(stream);
      return null;
    }
    return stream;
  }

  async function doCamera(my: number) {
    setStep("camera");
    setRow("camera", "pending", "Waiting for permission...");
    let stream: MediaStream | null = null;
    try {
      stream = await acquire(
        {
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30 },
          },
          audio: false,
        },
        my
      );
      if (!stream) return;
      camStream.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play().catch(() => undefined);
        for (let i = 0; i < 20 && video.readyState < 2; i++)
          await new Promise((r) => window.setTimeout(r, 100));
      }
      if (runId.current !== my) return;
      setCamLive(true);
      const track = stream.getVideoTracks()[0];
      const settings = track?.getSettings() ?? {};
      setRow("camera", "pending", "Measuring frame rate...");
      const measured = video ? await measureFps(video, 1800) : null;
      if (runId.current !== my) return;
      const fps =
        measured ??
        (settings.frameRate ? Math.round(settings.frameRate) : null);
      const w = video?.videoWidth || settings.width || null;
      const h = video?.videoHeight || settings.height || null;
      setCamInfo({ label: track?.label || "Camera", w, h, fps });
      const q = cameraQuality(w, h, fps);
      setRow("camera", q.state, q.note);
      if (video) setThumb(snapshot(video));
      const devices = await listDevices("videoinput");
      setCounts((c) => ({ ...c, cams: devices.length }));
    } catch (err) {
      const g = mediaErrorGuidance(err, "camera");
      const timedOut = err instanceof Error && err.name === "TimeoutError";
      const guidance = timedOut
        ? {
            tone: "warn" as const,
            verdict: "No answer to the camera permission prompt.",
            tip: "Look for the permission prompt near the address bar and choose Allow, then run the check again.",
          }
        : g;
      setErrors((e) => ({
        ...e,
        camera: { ...guidance, denied: isDenied(err) },
      }));
      setRow("camera", "fail", guidance.verdict);
    } finally {
      if (runId.current === my) {
        stopStream(camStream.current);
        camStream.current = null;
        if (videoRef.current) videoRef.current.srcObject = null;
        setCamLive(false);
      }
    }
  }

  async function doMic(my: number) {
    setStep("mic");
    setRow("mic", "pending", "Waiting for permission...");
    try {
      const stream = await acquire({ audio: true, video: false }, my);
      if (!stream) return;
      micStream.current = stream;
      const Ctor = getAudioContextCtor();
      const devices = await listDevices("audioinput");
      setCounts((c) => ({ ...c, mics: devices.length }));
      if (!Ctor) {
        setRow(
          "mic",
          "warn",
          "Microphone started, but this browser can't measure its level"
        );
        return;
      }
      const ctx = new Ctor();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      const data = new Float32Array(analyser.fftSize);
      setRow("mic", "pending", "Say something...");
      setMicPeak(0);
      const started = performance.now();
      let peak = 0;
      await new Promise<void>((resolve) => {
        const loop = (now: number) => {
          if (runId.current !== my) {
            resolve();
            return;
          }
          analyser.getFloatTimeDomainData(data);
          const pct = levelToPercent(rmsLevel(data));
          peak = Math.max(peak, pct);
          setMicLevel(pct);
          setMicPeak(peak);
          if (now - started >= MIC_MS) {
            resolve();
            return;
          }
          rafRef.current = requestAnimationFrame(loop);
        };
        rafRef.current = requestAnimationFrame(loop);
      });
      source.disconnect();
      void ctx.close().catch(() => undefined);
      if (runId.current !== my) return;
      setMicLevel(0);
      const q = micLevelState(peak);
      setRow("mic", q.state, q.note);
    } catch (err) {
      const g = mediaErrorGuidance(err, "microphone");
      const timedOut = err instanceof Error && err.name === "TimeoutError";
      const guidance = timedOut
        ? {
            tone: "warn" as const,
            verdict: "No answer to the microphone permission prompt.",
            tip: "Look for the permission prompt near the address bar and choose Allow, then run the check again.",
          }
        : g;
      setErrors((e) => ({ ...e, mic: { ...guidance, denied: isDenied(err) } }));
      setRow("mic", "fail", guidance.verdict);
    } finally {
      if (runId.current === my) {
        stopStream(micStream.current);
        micStream.current = null;
        setMicLevel(0);
      }
    }
  }

  function playChime(ctx: AudioContext) {
    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.25, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.0);
    [523.25, 659.25].forEach((f, i) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = f;
      osc.connect(gain);
      osc.start(now + i * 0.35);
      osc.stop(now + i * 0.35 + 0.6);
    });
  }

  async function doSpeaker(my: number, ctx: AudioContext | null) {
    setStep("speaker");
    if (!ctx) {
      setRow("speaker", "warn", "This browser can't play test sounds");
      return;
    }
    try {
      await ctx.resume();
      if (runId.current !== my) return;
      playChime(ctx);
      setRow("speaker", "pending", "Did you hear the two-note chime?");
      setAwaitingHeard(true);
    } catch {
      setRow(
        "speaker",
        "warn",
        "The browser blocked the test sound. Click Play chime."
      );
      setAwaitingHeard(true);
    }
  }

  async function run() {
    if (!mediaSupported()) {
      setUnsupported(true);
      return;
    }
    setUnsupported(false);
    const my = ++runId.current;
    releaseAll();
    void ctxRef.current?.close().catch(() => undefined);
    ctxRef.current = null;
    setRows(BLANK);
    setErrors({});
    setThumb(null);
    setCamInfo(null);
    setMicPeak(null);
    setAwaitingHeard(false);
    setStage("running");
    // Created inside the click so the browser allows sound later.
    const Ctor = getAudioContextCtor();
    let ctx: AudioContext | null = null;
    try {
      ctx = Ctor ? new Ctor() : null;
    } catch {
      ctx = null;
    }
    ctxRef.current = ctx;
    try {
      await doCamera(my);
      if (runId.current !== my) return;
      await doMic(my);
      if (runId.current !== my) return;
      await doSpeaker(my, ctx);
    } finally {
      if (runId.current === my) {
        releaseAll();
        setStep(null);
        setStage("done");
      }
    }
  }

  async function replayChime() {
    try {
      const Ctor = getAudioContextCtor();
      if (!Ctor) return;
      let ctx = ctxRef.current;
      if (!ctx || ctx.state === "closed") {
        ctx = new Ctor();
        ctxRef.current = ctx;
      }
      await ctx.resume();
      playChime(ctx);
    } catch {
      setRow("speaker", "warn", "The browser blocked the test sound");
    }
  }

  function answerHeard(heard: boolean) {
    setAwaitingHeard(false);
    setRow(
      "speaker",
      heard ? "pass" : "fail",
      heard
        ? "You heard the chime"
        : "You didn't hear the chime. Check volume, mute and the output device"
    );
  }

  async function testShare() {
    window.clearTimeout(shareTimer.current);
    stopStream(shareStream.current);
    const md =
      typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
    if (!md || typeof md.getDisplayMedia !== "function") {
      setRow(
        "share",
        "warn",
        "Screen sharing isn't available on this browser or device"
      );
      return;
    }
    const my = runId.current;
    setSharing(true);
    setRow("share", "pending", "Choose a screen or window to share...");
    try {
      const stream = await withTimeout(
        md.getDisplayMedia({ video: true, audio: false }),
        PROMPT_TIMEOUT_MS
      );
      if (runId.current !== my) {
        stopStream(stream);
        return;
      }
      shareStream.current = stream;
      const v = shareRef.current;
      if (v) {
        v.srcObject = stream;
        await v.play().catch(() => undefined);
      }
      const s = stream.getVideoTracks()[0]?.getSettings();
      setRow(
        "share",
        "pass",
        s?.width && s?.height
          ? `Works (${s.width}×${s.height}). Stopped automatically`
          : "Works. Stopped automatically"
      );
      shareTimer.current = window.setTimeout(() => {
        stopStream(shareStream.current);
        shareStream.current = null;
        if (shareRef.current) shareRef.current.srcObject = null;
        setSharing(false);
      }, 1600);
    } catch (err) {
      stopStream(shareStream.current);
      shareStream.current = null;
      setSharing(false);
      const name =
        err && typeof err === "object" && "name" in err
          ? String((err as { name: unknown }).name)
          : "";
      if (name === "NotAllowedError") {
        setRow(
          "share",
          "warn",
          "Cancelled or blocked. " + permissionHelp(browser, "screen")
        );
      } else if (name === "TimeoutError") {
        setRow("share", "warn", "No screen was chosen in time. Try again");
      } else {
        setRow(
          "share",
          "fail",
          "Screen sharing failed to start. " + permissionHelp(browser, "screen")
        );
      }
    }
  }

  const checks: MeetingCheck[] = ORDER.map((id) => ({
    id,
    label: LABELS[id],
    state: rows[id].state,
    detail: rows[id].detail,
  }));
  const summary = meetingSummary(checks);
  const started = checks.some((c) => c.state !== "pending");
  const lines: ReportLine[] = [
    ...checks.map((c): ReportLine => [
      c.label,
      `${c.state.toUpperCase()}: ${c.detail}`,
    ]),
    ["Camera name", camInfo?.label ?? "Not read"],
    ["Cameras / microphones found", `${counts.cams} / ${counts.mics}`],
  ];
  const report: ToolReport | null =
    stage === "done" &&
    started &&
    (!awaitingHeard || summary.ready === "not-ready")
      ? {
          tool: "Meeting readiness",
          tone: summary.tone,
          verdict: summary.verdict,
          tip: summary.tip,
          lines,
        }
      : null;
  useSaveResult("dev-meeting", report);

  const running = stage === "running";

  return (
    <ToolCard
      id="dev-meeting"
      icon={Video}
      title="Meeting readiness check"
      description="One click tests your camera, microphone and speakers, and lets you try screen sharing. Nothing is recorded or sent anywhere."
      report={report}
      active={running}
      live={
        running && step
          ? `Checking ${LABELS[step].toLowerCase()}`
          : stage === "done"
            ? summary.verdict
            : undefined
      }
      actions={
        <ToolButton
          icon={stage === "idle" ? Play : RefreshCw}
          spinning={false}
          onClick={() => void run()}
          disabled={running}
        >
          {stage === "idle"
            ? "Check meeting readiness"
            : running
              ? "Checking..."
              : "Run again"}
        </ToolButton>
      }
    >
      {unsupported && (
        <div className="mb-4">
          <ToolNotice
            tone="bad"
            title="This browser can't test camera or microphone"
          >
            Camera and microphone access need a secure (https) page in an
            up-to-date Chrome, Edge, Firefox or Safari. Many in-app browsers
            also block it. Open this page in your regular browser.
          </ToolNotice>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="grid min-w-0 content-start gap-3">
          <div className="relative aspect-video overflow-hidden rounded-[20px] border border-white/10 bg-[#0a0716]">
            <video
              ref={videoRef}
              muted
              playsInline
              aria-label="Camera preview"
              className={cn(
                "h-full w-full -scale-x-100 object-cover transition-opacity duration-500",
                camLive ? "opacity-100" : "opacity-0"
              )}
            />
            {!camLive && thumb && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={thumb}
                alt="Last frame from your camera (kept only on this page)"
                className="hf-rise absolute inset-0 h-full w-full object-cover"
              />
            )}
            {camLive && (
              <span className="hf-pop absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wider backdrop-blur">
                <span className="relative flex h-2 w-2">
                  <span className="hf-ping absolute inset-0 rounded-full bg-[#ff5c7a]" />
                  <span className="relative h-2 w-2 rounded-full bg-[#ff5c7a]" />
                </span>
                Live - private
              </span>
            )}
            {!camLive && !thumb && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center">
                <Camera
                  className={cn(
                    "h-10 w-10 text-white/40",
                    running && step === "camera" && "hf-blink"
                  )}
                  aria-hidden
                />
                <p className="text-sm font-semibold text-white/60">
                  {running && step === "camera"
                    ? "Waiting for permission..."
                    : "Camera preview appears here"}
                </p>
              </div>
            )}
          </div>

          <Panel
            title="Microphone level"
            icon={<Mic className="h-3.5 w-3.5" aria-hidden />}
          >
            <Meter percent={micLevel} label="Microphone level" />
            <p className="mt-2 text-xs font-semibold text-white/60">
              {running && step === "mic"
                ? "Say a few words: the bar should jump."
                : micPeak !== null
                  ? `Loudest moment: ${micPeak}%`
                  : "Appears while the microphone is being checked."}
            </p>
          </Panel>
        </div>

        <div className="grid min-w-0 content-start gap-3">
          <ul className="grid gap-2" aria-label="Meeting readiness checklist">
            {checks.map((c) => (
              <li
                key={c.id}
                data-check={c.id}
                data-state={c.state}
                className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-3"
              >
                <StateIcon state={c.state} active={running && step === c.id} />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-2 text-sm font-extrabold">
                    {c.id === "camera" ? (
                      <Camera className="h-4 w-4 text-[#c9b8ff]" aria-hidden />
                    ) : c.id === "mic" ? (
                      <Mic className="h-4 w-4 text-[#c9b8ff]" aria-hidden />
                    ) : c.id === "speaker" ? (
                      <Volume2 className="h-4 w-4 text-[#c9b8ff]" aria-hidden />
                    ) : (
                      <Monitor className="h-4 w-4 text-[#c9b8ff]" aria-hidden />
                    )}
                    {c.label}
                  </p>
                  <p className="mt-0.5 text-xs font-medium text-white/70">
                    {c.detail}
                  </p>
                </div>
              </li>
            ))}
          </ul>

          {awaitingHeard && (
            <div className="hf-rise flex flex-wrap items-center gap-2 rounded-2xl border border-[#c9b8ff]/30 bg-[#7c5cff]/15 p-3">
              <p className="mr-auto text-sm font-bold">
                Did you hear the chime?
              </p>
              <ToolButton variant="ghost" onClick={() => void replayChime()}>
                Play chime
              </ToolButton>
              <ToolButton onClick={() => answerHeard(true)}>Yes</ToolButton>
              <ToolButton variant="danger" onClick={() => answerHeard(false)}>
                No
              </ToolButton>
            </div>
          )}

          <Panel
            title="Screen sharing"
            icon={<Monitor className="h-3.5 w-3.5" aria-hidden />}
          >
            <p className="text-sm text-white/75">
              Opens your browser&apos;s share picker. The preview shows for a
              moment and stops by itself.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <ToolButton
                variant="ghost"
                icon={Monitor}
                onClick={() => void testShare()}
                disabled={sharing || running}
              >
                Test screen share
              </ToolButton>
              <video
                ref={shareRef}
                muted
                playsInline
                aria-label="Screen share preview"
                className={cn(
                  "h-16 rounded-lg border border-white/15 bg-black object-contain transition-opacity",
                  sharing ? "opacity-100" : "hidden"
                )}
              />
            </div>
          </Panel>
        </div>
      </div>

      {(errors.camera || errors.mic) && (
        <div className="mt-4 grid gap-3">
          {errors.camera && (
            <ToolNotice
              tone={errors.camera.tone}
              title={`Camera: ${errors.camera.verdict}`}
            >
              {!errors.camera.denied && <p>{errors.camera.tip}</p>}
              {errors.camera.denied && (
                <p className="font-semibold">
                  {permissionHelp(browser, "camera")}
                </p>
              )}
            </ToolNotice>
          )}
          {errors.mic && (
            <ToolNotice
              tone={errors.mic.tone}
              title={`Microphone: ${errors.mic.verdict}`}
            >
              {!errors.mic.denied && <p>{errors.mic.tip}</p>}
              {errors.mic.denied && (
                <p className="font-semibold">
                  {permissionHelp(browser, "microphone")}
                </p>
              )}
            </ToolNotice>
          )}
        </div>
      )}
    </ToolCard>
  );
}

function StateIcon({
  state,
  active,
}: {
  state: MeetingCheckState;
  active: boolean;
}) {
  const cls = "mt-0.5 h-5 w-5 shrink-0";
  if (state === "pass")
    return (
      <CheckCircle2
        className={cn(cls, "hf-pop text-[#5ee0a8]")}
        aria-label="Passed"
      />
    );
  if (state === "fail")
    return (
      <X className={cn(cls, "hf-pop text-[#ff9bb3]")} aria-label="Failed" />
    );
  if (state === "warn")
    return (
      <AlertTriangle
        className={cn(cls, "hf-pop text-[#ffd27c]")}
        aria-label="Needs attention"
      />
    );
  if (state === "skipped")
    return <Circle className={cn(cls, "text-white/30")} aria-label="Skipped" />;
  return (
    <Circle
      className={cn(cls, active ? "hf-blink text-[#c9b8ff]" : "text-white/30")}
      aria-label={active ? "In progress" : "Not checked"}
    />
  );
}
