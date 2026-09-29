"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Animated avatar characters ("moving bitmoji") drawn in SVG + CSS, so they
 * stay crisp, theme-aware and tiny (no GIF files). Every character idles with
 * its own loop — blinking, waving, ear twitches, floating — and all motion
 * stops for users with "reduce motion" turned on (globals.css rule).
 */
export type AvatarId =
  "bot" | "cat" | "ghost" | "alien" | "owl" | "fox" | "panda" | "astro";

export const AVATAR_IDS: AvatarId[] = [
  "bot",
  "cat",
  "ghost",
  "alien",
  "owl",
  "fox",
  "panda",
  "astro",
];

export const AVATAR_LABELS: Record<AvatarId, string> = {
  bot: "Helper bot",
  cat: "Cat",
  ghost: "Ghost",
  alien: "Alien",
  owl: "Owl",
  fox: "Fox",
  panda: "Panda",
  astro: "Astronaut",
};

const BG: Record<AvatarId, string> = {
  bot: "#ece8fd",
  cat: "#fff1d6",
  ghost: "#e0efff",
  alien: "#e3f6ee",
  owl: "#fde7f1",
  fox: "#fff0e0",
  panda: "#eef0f3",
  astro: "#1c1633",
};

function Eyes({ y = 22, gap = 12, r = 2.6, fill = "#1c1633" }) {
  return (
    <g className="hf-blink-eyes">
      <circle cx={22 - gap / 2} cy={y} r={r} fill={fill} />
      <circle cx={22 + gap / 2} cy={y} r={r} fill={fill} />
    </g>
  );
}

function Character({ id }: { id: AvatarId }) {
  switch (id) {
    case "bot":
      return (
        <g className="hf-float-sm">
          <path
            d="M22 9V5"
            stroke="#5b3cc4"
            strokeWidth={2.4}
            strokeLinecap="round"
          />
          <circle cx="22" cy="4" r="2.6" fill="#ffc24b" className="hf-glow" />
          <rect x="9" y="10" width="26" height="21" rx="7" fill="#5b3cc4" />
          <Eyes y={20} gap={10} fill="#ffffff" />
          <path
            d="M17 25q5 3 10 0"
            fill="none"
            stroke="#ffffff"
            strokeWidth={2}
            strokeLinecap="round"
          />
          <path
            className="hf-wave"
            d="M35 22l5-6"
            stroke="#5b3cc4"
            strokeWidth={3}
            strokeLinecap="round"
          />
          <rect x="14" y="31" width="16" height="8" rx="3" fill="#8b6cf6" />
        </g>
      );
    case "cat":
      return (
        <g className="hf-float-sm">
          <path className="hf-ear" d="M10 18 12 6l8 7z" fill="#f59e0b" />
          <path
            className="hf-ear"
            style={{ animationDelay: "0.4s" }}
            d="M34 18 32 6l-8 7z"
            fill="#f59e0b"
          />
          <circle cx="22" cy="24" r="14" fill="#f59e0b" />
          <Eyes y={22} gap={11} />
          <path
            d="M20 27l2 1.5 2-1.5"
            fill="none"
            stroke="#1c1633"
            strokeWidth={1.6}
            strokeLinecap="round"
          />
          <path
            d="M8 26h6M8 29h6M30 26h6M30 29h6"
            stroke="#7a4b00"
            strokeWidth={1}
            strokeLinecap="round"
          />
        </g>
      );
    case "ghost":
      return (
        <g className="hf-bob">
          <path
            d="M9 38V20a13 13 0 0 1 26 0v18l-4.3-3-4.4 3-4.3-3-4.3 3-4.4-3z"
            fill="#ffffff"
            stroke="#2553b0"
            strokeWidth={1.6}
          />
          <Eyes y={21} gap={9} fill="#2553b0" />
          <ellipse cx="22" cy="28" rx="2.6" ry="3.2" fill="#2553b0" />
        </g>
      );
    case "alien":
      return (
        <g className="hf-float-sm">
          <path
            d="M16 9l-3-4M28 9l3-4"
            stroke="#12805c"
            strokeWidth={2}
            strokeLinecap="round"
          />
          <circle cx="13" cy="5" r="2" fill="#12805c" className="hf-glow" />
          <circle cx="31" cy="5" r="2" fill="#12805c" className="hf-glow" />
          <ellipse cx="22" cy="23" rx="14" ry="15" fill="#34c38f" />
          <g className="hf-blink-eyes">
            <ellipse cx="16" cy="21" rx="4" ry="5" fill="#1c1633" />
            <ellipse cx="28" cy="21" rx="4" ry="5" fill="#1c1633" />
          </g>
          <path
            d="M19 31q3 2 6 0"
            fill="none"
            stroke="#0b5c3d"
            strokeWidth={1.8}
            strokeLinecap="round"
          />
        </g>
      );
    case "owl":
      return (
        <g className="hf-float-sm">
          <path className="hf-ear" d="M11 12l2-6 5 5z" fill="#b1245f" />
          <path
            className="hf-ear"
            style={{ animationDelay: "0.3s" }}
            d="M33 12l-2-6-5 5z"
            fill="#b1245f"
          />
          <ellipse cx="22" cy="24" rx="14" ry="15" fill="#ec4f8a" />
          <circle cx="16" cy="21" r="5.5" fill="#ffffff" />
          <circle cx="28" cy="21" r="5.5" fill="#ffffff" />
          <Eyes y={21} gap={12} r={2.6} />
          <path d="M20 26l2 3 2-3z" fill="#ffc24b" />
          <path
            d="M14 33q8 4 16 0"
            fill="none"
            stroke="#b1245f"
            strokeWidth={1.6}
            strokeLinecap="round"
          />
        </g>
      );
    case "fox":
      return (
        <g className="hf-float-sm">
          <path className="hf-ear" d="M9 20 11 5l9 9z" fill="#e8590c" />
          <path
            className="hf-ear"
            style={{ animationDelay: "0.5s" }}
            d="M35 20 33 5l-9 9z"
            fill="#e8590c"
          />
          <path d="M8 18q14-10 28 0l-14 20z" fill="#e8590c" />
          <path d="M13 24q9 4 18 0l-9 14z" fill="#ffffff" />
          <Eyes y={21} gap={12} />
          <circle cx="22" cy="31" r="2" fill="#1c1633" />
        </g>
      );
    case "panda":
      return (
        <g className="hf-float-sm">
          <circle className="hf-ear" cx="11" cy="11" r="5" fill="#1c1633" />
          <circle
            className="hf-ear"
            style={{ animationDelay: "0.4s" }}
            cx="33"
            cy="11"
            r="5"
            fill="#1c1633"
          />
          <circle cx="22" cy="24" r="14" fill="#ffffff" stroke="#d0d5dd" />
          <ellipse
            cx="16"
            cy="22"
            rx="4"
            ry="5"
            fill="#1c1633"
            transform="rotate(-20 16 22)"
          />
          <ellipse
            cx="28"
            cy="22"
            rx="4"
            ry="5"
            fill="#1c1633"
            transform="rotate(20 28 22)"
          />
          <Eyes y={22} gap={12} r={1.6} fill="#ffffff" />
          <ellipse cx="22" cy="29" rx="2.4" ry="1.8" fill="#1c1633" />
        </g>
      );
    case "astro":
      return (
        <g className="hf-float-sm">
          <circle cx="8" cy="9" r="0.9" fill="#ffffff" className="hf-i-blink" />
          <circle
            cx="37"
            cy="14"
            r="0.9"
            fill="#ffffff"
            className="hf-i-blink"
            style={{ animationDelay: "0.8s" }}
          />
          <circle cx="22" cy="22" r="14" fill="#ffffff" />
          <rect x="12" y="15" width="20" height="13" rx="6.5" fill="#5b3cc4" />
          <path
            d="M16 19q3-2 6 0"
            fill="none"
            stroke="#c9b8ff"
            strokeWidth={1.6}
            strokeLinecap="round"
          />
          <rect x="16" y="35" width="12" height="6" rx="2" fill="#ffffff" />
        </g>
      );
  }
}

export function AnimatedAvatar({
  id,
  size = 40,
  className,
  title,
}: {
  id: AvatarId;
  size?: number;
  className?: string;
  /** Pass a title to expose the avatar to screen readers; omit for decorative use. */
  title?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full",
        className
      )}
      style={{ width: size, height: size, background: BG[id] }}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <svg
        viewBox="0 0 44 44"
        width={size * 0.86}
        height={size * 0.86}
        className="overflow-visible"
      >
        <Character id={id} />
      </svg>
    </span>
  );
}

const STORAGE_KEY = "hf-avatar";

/** Remembers the chosen avatar in this browser (falls back gracefully). */
export function useSavedAvatar(fallback: AvatarId | "initial" = "initial") {
  const [avatar, setAvatar] = useState<AvatarId | "initial">(fallback);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "initial" || AVATAR_IDS.includes(saved as AvatarId)) {
        queueMicrotask(() => setAvatar(saved as AvatarId | "initial"));
      }
    } catch {
      /* storage unavailable: keep fallback */
    }
  }, []);
  function choose(next: AvatarId | "initial") {
    setAvatar(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }
  return [avatar, choose] as const;
}

/**
 * Avatar picker: a tidy 4-column grid of animated characters plus a
 * "Use my initial" option. Fits inside a 280px popover without clipping.
 */
export function AvatarPicker({
  value,
  initial,
  onChange,
}: {
  value: AvatarId | "initial";
  initial: string;
  onChange: (next: AvatarId | "initial") => void;
}) {
  return (
    <div className="w-[280px] max-w-[calc(100vw-2rem)] rounded-3xl border border-border bg-card p-4 shadow-[var(--shadow-md)]">
      <p className="text-sm font-extrabold">Choose your avatar</p>
      <div role="radiogroup" aria-label="Avatar">
        <div className="mt-3 grid grid-cols-4 gap-2.5">
          {AVATAR_IDS.map((id) => {
            const selected = value === id;
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={AVATAR_LABELS[id]}
                title={AVATAR_LABELS[id]}
                onClick={() => onChange(id)}
                className={cn(
                  "flex aspect-square items-center justify-center rounded-2xl border-2 transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25",
                  selected
                    ? "border-primary bg-secondary"
                    : "border-transparent hover:bg-muted"
                )}
              >
                <AnimatedAvatar id={id} size={46} />
              </button>
            );
          })}
        </div>
        <button
          type="button"
          role="radio"
          aria-checked={value === "initial"}
          onClick={() => onChange("initial")}
          className={cn(
            "mt-3 flex min-h-11 w-full items-center gap-3 rounded-2xl border-2 px-3 text-sm font-bold",
            value === "initial"
              ? "border-primary bg-secondary"
              : "border-border hover:bg-muted"
          )}
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[linear-gradient(135deg,#ffc24b,#f472b6)] text-xs font-extrabold text-[#1c1633]">
            {initial}
          </span>
          Use my initial
        </button>
      </div>
    </div>
  );
}
