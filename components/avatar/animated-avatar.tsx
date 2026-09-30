"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

import {
  HUMAN_AVATARS,
  HUMAN_AVATAR_IDS,
  HumanFigure,
  humanAvatarBackground,
  type HumanAvatarId,
} from "@/components/avatar/human-avatars";

/**
 * Animated avatars drawn in SVG + CSS, so they stay crisp, theme-aware and
 * tiny (no image files). People pick from a set of illustrated humans; the
 * Support Assistant keeps its friendly "bot" character. All motion stops for
 * users with "reduce motion" turned on (globals.css rule).
 */

/** Avatars a person can choose for themselves. */
export type AvatarId = HumanAvatarId;

export const AVATAR_IDS: AvatarId[] = [...HUMAN_AVATAR_IDS];

export const AVATAR_LABELS: Record<AvatarId, string> = Object.fromEntries(
  HUMAN_AVATAR_IDS.map((id) => [id, HUMAN_AVATARS[id].label])
) as Record<AvatarId, string>;

/** The Support Assistant's own character (never offered to people). */
export type AssistantAvatarId = "bot";

/** Character ids saved by earlier versions (animals / robots). */
export const LEGACY_AVATAR_MAP = {
  bot: "nova",
  cat: "mei",
  ghost: "ines",
  alien: "kai",
  owl: "amara",
  fox: "sol",
  panda: "ravi",
  astro: "juno",
  rocket: "leo",
} as const satisfies Record<string, AvatarId>;

export type LegacyAvatarId = keyof typeof LEGACY_AVATAR_MAP;

export const DEFAULT_AVATAR: AvatarId = "nova";

function isHumanId(value: unknown): value is AvatarId {
  return (
    typeof value === "string" &&
    (HUMAN_AVATAR_IDS as readonly string[]).includes(value)
  );
}

/**
 * Turns any stored avatar value (new id, legacy animal id, "char:<id>" or
 * "initial") into a current choice. Unknown values return null.
 */
export function normalizeAvatarId(
  value: string | null | undefined
): AvatarId | "initial" | null {
  if (!value) return null;
  if (value === "initial") return "initial";
  const raw = value.startsWith("char:") ? value.slice(5) : value;
  if (isHumanId(raw)) return raw;
  if (Object.prototype.hasOwnProperty.call(LEGACY_AVATAR_MAP, raw)) {
    return LEGACY_AVATAR_MAP[raw as LegacyAvatarId];
  }
  return null;
}

function Eyes({ y = 22, gap = 12, r = 2.6, fill = "#1c1633" }) {
  return (
    <g className="hf-blink-eyes">
      <circle cx={22 - gap / 2} cy={y} r={r} fill={fill} />
      <circle cx={22 + gap / 2} cy={y} r={r} fill={fill} />
    </g>
  );
}

function AssistantBot() {
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
}

export function AnimatedAvatar({
  id,
  size = 40,
  className,
  title,
  index = 0,
}: {
  /** A person's avatar, a legacy saved id, or "bot" for the Support Assistant. */
  id: AvatarId | AssistantAvatarId | LegacyAvatarId;
  /** Pixel size, or "fill" to size by the parent (e.g. a grid column). */
  size?: number | "fill";
  className?: string;
  /** Pass a title to expose the avatar to screen readers; omit for decorative use. */
  title?: string;
  /** Staggers idle animation timing when several avatars are shown together. */
  index?: number;
}) {
  const fill = size === "fill";
  const box = fill
    ? { width: "100%", height: "auto", aspectRatio: "1 / 1" }
    : { width: size, height: size };

  if (id === "bot") {
    const inner = fill ? "86%" : (size as number) * 0.86;
    return (
      <span
        className={cn(
          "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full",
          className
        )}
        style={{ ...box, background: "#ece8fd" }}
        role={title ? "img" : undefined}
        aria-label={title}
        aria-hidden={title ? undefined : true}
      >
        <svg
          viewBox="0 0 44 44"
          width={inner}
          height={inner}
          className="overflow-visible"
        >
          <AssistantBot />
        </svg>
      </span>
    );
  }

  const human: AvatarId = isHumanId(id)
    ? id
    : (LEGACY_AVATAR_MAP[id as LegacyAvatarId] ?? DEFAULT_AVATAR);
  return (
    <span
      className={cn(
        "hf-ava inline-flex shrink-0 overflow-hidden rounded-full",
        fill && "min-w-0",
        className
      )}
      style={{ ...box, background: humanAvatarBackground(human) }}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <svg viewBox="0 0 44 44" width="100%" height="100%" className="block">
        <HumanFigure id={human} index={index} />
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
      const saved = normalizeAvatarId(localStorage.getItem(STORAGE_KEY));
      if (saved) queueMicrotask(() => setAvatar(saved));
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
 * Avatar picker: a responsive 4-column grid of illustrated people plus a
 * "Use my initial" option. It always takes the width of its container (never
 * wider), so it fits the 264px sidebar and the mobile drawer without any
 * sideways scrolling.
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
    <div className="w-full min-w-0 max-w-full rounded-3xl border border-border bg-card p-3 text-card-foreground shadow-[var(--shadow-md)]">
      <p className="px-1 text-sm font-extrabold">Choose your avatar</p>
      <div role="radiogroup" aria-label="Avatar" className="min-w-0">
        <div className="mt-2.5 grid grid-cols-4 gap-1.5">
          {AVATAR_IDS.map((id, index) => {
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
                  "hf-ava-hover flex aspect-square min-w-0 items-center justify-center rounded-2xl border-2 p-0.5 transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25",
                  selected
                    ? "border-primary bg-secondary"
                    : "border-transparent hover:bg-muted"
                )}
              >
                <AnimatedAvatar id={id} size="fill" index={index} />
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
            "mt-2.5 flex min-h-11 w-full min-w-0 items-center gap-3 rounded-2xl border-2 px-3 text-sm font-bold",
            value === "initial"
              ? "border-primary bg-secondary"
              : "border-border hover:bg-muted"
          )}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,#ffc24b,#f472b6)] text-xs font-extrabold text-[#1c1633]">
            {initial}
          </span>
          <span className="min-w-0 truncate">Use my initial</span>
        </button>
      </div>
    </div>
  );
}
