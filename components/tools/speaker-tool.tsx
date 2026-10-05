"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Volume2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getAudioContextCtor,
  resumeAudio,
  type ToolReport,
} from "./diagnostics";
import { ToolButton, ToolCard, ToolNotice } from "./tool-shell";

type Channel = "left" | "both" | "right";
type Answer = "yes" | "no";

const CHANNELS: Array<{ id: Channel; label: string; pan: number }> = [
  { id: "left", label: "Left", pan: -1 },
  { id: "both", label: "Both", pan: 0 },
  { id: "right", label: "Right", pan: 1 },
];

const NOTES = [523.25, 659.25, 783.99, 1046.5];
const NOTE_LEN = 0.28;
// Bluetooth speakers/headphones often drop the first ~100 ms while they wake
// up, which would swallow the first note — lead in with a little silence.
const LEAD_IN = 0.18;

export function SpeakerTool() {
  const [playing, setPlaying] = useState<Channel | null>(null);
  const [lastPlayed, setLastPlayed] = useState<Channel | null>(null);
  const [answers, setAnswers] = useState<Partial<Record<Channel, Answer>>>({});
  const [unsupported, setUnsupported] = useState(false);
  const [noPan, setNoPan] = useState(false);
  const ctxRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<number | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const playIdRef = useRef(0);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    return () => {
      playIdRef.current++;
      if (timerRef.current) window.clearTimeout(timerRef.current);
      void ctxRef.current?.close().catch(() => undefined);
      ctxRef.current = null;
      masterRef.current = null;
    };
  }, []);

  async function play(channel: Channel) {
    const Ctor = getAudioContextCtor();
    if (!Ctor) {
      setUnsupported(true);
      return;
    }
    const playId = ++playIdRef.current;
    let ctx = ctxRef.current;
    if (!ctx || ctx.state === "closed") {
      try {
        ctx = new Ctor();
      } catch {
        setUnsupported(true);
        return;
      }
      ctxRef.current = ctx;
    }
    // Instant feedback + silence any chime that's still playing, so quick
    // repeat taps don't stack into noise.
    setBlocked(false);
    setPlaying(channel);
    setLastPlayed(channel);
    if (masterRef.current) {
      try {
        masterRef.current.disconnect();
      } catch {
        // already disconnected
      }
      masterRef.current = null;
    }
    // resume() must be triggered from the click; it can stay pending forever
    // on iOS, so it is time-limited.
    const running = await resumeAudio(ctx);
    if (playId !== playIdRef.current || ctxRef.current !== ctx) return;
    if (!running) {
      setBlocked(true);
      setPlaying(null);
      return;
    }

    const pan = CHANNELS.find((c) => c.id === channel)?.pan ?? 0;
    const master = ctx.createGain();
    master.gain.value = 0.22;
    masterRef.current = master;
    let out: AudioNode = master;
    if (typeof ctx.createStereoPanner === "function") {
      const panner = ctx.createStereoPanner();
      panner.pan.value = pan;
      master.connect(panner);
      out = panner;
    } else if (pan !== 0) {
      setNoPan(true);
    }
    out.connect(ctx.destination);

    const t0 = ctx.currentTime + LEAD_IN;
    NOTES.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = t0 + i * NOTE_LEN;
      env.gain.setValueAtTime(0.0001, start);
      env.gain.exponentialRampToValueAtTime(1, start + 0.03);
      env.gain.exponentialRampToValueAtTime(0.0001, start + NOTE_LEN * 1.4);
      osc.connect(env);
      env.connect(master);
      osc.start(start);
      osc.stop(start + NOTE_LEN * 1.5);
    });

    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(
      () => {
        if (playId === playIdRef.current) setPlaying(null);
      },
      (LEAD_IN + NOTES.length * NOTE_LEN + 0.2) * 1000
    );
  }

  function answer(value: Answer) {
    if (!lastPlayed) return;
    setAnswers((a) => ({ ...a, [lastPlayed]: value }));
  }

  const answered = Object.keys(answers) as Channel[];
  let report: ToolReport | null = null;
  if (answered.length) {
    const lines = CHANNELS.map(
      (c) =>
        [
          `${c.label} channel`,
          answers[c.id] === "yes"
            ? "Heard"
            : answers[c.id] === "no"
              ? "Not heard"
              : "Not tested",
        ] as [string, string]
    );
    const nos = answered.filter((c) => answers[c] === "no");
    const yeses = answered.filter((c) => answers[c] === "yes");
    if (yeses.length === 0) {
      report = {
        tool: "Speakers",
        tone: "bad",
        verdict: "No sound is coming out.",
        tip: "Check the volume isn't muted (keyboard keys and the taskbar/menu-bar speaker icon), that the right output device is selected in sound settings, and that headphones or Bluetooth speakers are actually connected.",
        lines,
      };
    } else if (nos.length) {
      report = {
        tool: "Speakers",
        tone: "warn",
        verdict: `The ${nos.map((c) => (c === "both" ? "both-speakers" : c)).join(" and ")} chime${nos.length > 1 ? "s weren't" : " wasn't"} heard.`,
        tip: "If only one side is silent, push the headphone plug fully in, check the left/right balance in sound settings, and try another pair of headphones to see if it's the device or the headset.",
        lines,
      };
    } else {
      report = {
        tool: "Speakers",
        tone: "good",
        verdict: "Your speakers are working.",
        tip: "If a specific app is silent, check its own volume and output device — many call apps pick their own speaker separately from the system.",
        lines,
      };
    }
  }

  return (
    <ToolCard
      id="speakers"
      icon={Volume2}
      title="Speaker test"
      description="Plays a short chime on the left, right or both speakers so you can check each side."
      report={report}
      active={playing !== null}
      live={
        playing
          ? `Playing test sound on ${playing === "both" ? "both speakers" : `the ${playing} speaker`}`
          : lastPlayed
            ? "Did you hear the sound?"
            : undefined
      }
    >
      <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-white/80">
        <Volume2 className="h-3.5 w-3.5" aria-hidden />
        Set your volume to about 30% first.
      </p>

      <div className="grid grid-cols-3 gap-3">
        {CHANNELS.map((c) => {
          const isPlaying = playing === c.id;
          const result = answers[c.id];
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => play(c.id)}
              aria-label={`Play test sound: ${c.label}${c.id === "both" ? " speakers" : " speaker"}`}
              className={cn(
                "group relative flex flex-col items-center gap-2 overflow-hidden rounded-2xl border px-2 py-4 transition-[transform,background-color,border-color] hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#c084fc]/40",
                isPlaying
                  ? "border-[#c9b8ff]/60 bg-[#7c5cff]/25"
                  : "border-white/10 bg-white/5 hover:bg-white/10"
              )}
            >
              <span className="relative flex h-14 w-14 items-center justify-center">
                <span
                  className={cn(
                    "relative flex h-12 w-12 items-center justify-center rounded-full bg-[linear-gradient(135deg,#7c5cff,#d946ef)] shadow-[0_10px_24px_-10px_#7c5cff]",
                    c.id === "left" && "-scale-x-100"
                  )}
                >
                  <Volume2 className="h-6 w-6" aria-hidden />
                </span>
              </span>
              <span className="text-sm font-extrabold">{c.label}</span>
              <span
                aria-hidden
                className={cn(
                  "text-[11px] font-bold",
                  result === "yes"
                    ? "text-[#5ee0a8]"
                    : result === "no"
                      ? "text-[#ff9bb3]"
                      : "text-white/45"
                )}
              >
                {result === "yes"
                  ? "Heard"
                  : result === "no"
                    ? "Not heard"
                    : isPlaying
                      ? "Playing…"
                      : "Tap to play"}
              </span>
            </button>
          );
        })}
      </div>

      {unsupported && (
        <div className="mt-4">
          <ToolNotice title="Not supported on this browser">
            This browser can&apos;t play generated test tones. Try playing any
            video or song instead to check your speakers.
          </ToolNotice>
        </div>
      )}
      {blocked && (
        <div className="mt-4">
          <ToolNotice tone="warn" title="Your browser blocked the sound">
            Tap a button again — browsers only allow sound after a tap or click.
            If it keeps failing, check the tab isn&apos;t muted (look for a
            speaker icon on the tab) and the volume is up.
          </ToolNotice>
        </div>
      )}
      {noPan && (
        <p className="mt-3 text-xs font-semibold text-white/60">
          This browser can&apos;t send sound to one side only, so left and right
          play on both speakers.
        </p>
      )}

      {lastPlayed && !playing && (
        <div className="hf-rise mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-3">
          <p className="flex-1 text-sm font-bold">
            Did you hear the{" "}
            {lastPlayed === "both" ? "chime" : `${lastPlayed} chime`}?
          </p>
          <ToolButton
            variant="ghost"
            icon={Check}
            onClick={() => answer("yes")}
            aria-pressed={answers[lastPlayed] === "yes"}
          >
            Yes
          </ToolButton>
          <ToolButton
            variant="ghost"
            icon={X}
            onClick={() => answer("no")}
            aria-pressed={answers[lastPlayed] === "no"}
          >
            No
          </ToolButton>
        </div>
      )}
    </ToolCard>
  );
}
