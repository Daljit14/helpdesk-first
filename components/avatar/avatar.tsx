"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
} from "react";
import { Bot, Check, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { ClayCanvas } from "@/components/avatar/clay-canvas";
import {
  useAvatarAnimationPreference,
  usePrefersReducedMotion,
} from "@/components/avatar/avatar-motion";
import {
  HUMAN_AVATAR_IDS,
  PORTRAITS,
  portraitSrc,
  type HumanAvatarId,
} from "@/components/avatar/portraits";

export type AvatarId = HumanAvatarId;

export const AVATAR_IDS: AvatarId[] = [...HUMAN_AVATAR_IDS];

export const AVATAR_LABELS: Record<AvatarId, string> = Object.fromEntries(
  HUMAN_AVATAR_IDS.map((id) => [id, PORTRAITS[id].label])
) as Record<AvatarId, string>;

export type AssistantAvatarId = "bot";

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

const AVATAR_CACHE_EVENT = "hf-avatar-cache-change";

function subscribeToSavedAvatar(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(AVATAR_CACHE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(AVATAR_CACHE_EVENT, onStoreChange);
  };
}

function readSavedAvatar(
  key: string,
  fallback: AvatarId | "initial"
): AvatarId | "initial" {
  try {
    return normalizeAvatarId(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function isHumanId(value: unknown): value is AvatarId {
  return (
    typeof value === "string" &&
    (HUMAN_AVATAR_IDS as readonly string[]).includes(value)
  );
}

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

export function Avatar({
  id,
  size = 40,
  className,
  title,
  animate = false,
}: {
  id: AvatarId | AssistantAvatarId | LegacyAvatarId;
  size?: number | "fill";
  className?: string;
  title?: string;
  animate?: boolean;
}) {
  const fill = size === "fill";
  const pixelSize = fill ? 64 : size;
  const [failedAvatar, setFailedAvatar] = useState<AvatarId | null>(null);
  const [animationEnabled] = useAvatarAnimationPreference();
  const prefersReducedMotion = usePrefersReducedMotion();
  const human: AvatarId = isHumanId(id)
    ? id
    : (LEGACY_AVATAR_MAP[id as LegacyAvatarId] ?? DEFAULT_AVATAR);
  const src = portraitSrc(human, pixelSize > 96 ? 256 : 96);
  const imageRef = useRef<HTMLImageElement>(null);
  const canAnimate =
    animate &&
    animationEnabled &&
    !prefersReducedMotion &&
    id !== "bot" &&
    failedAvatar !== human;
  const box = fill
    ? { width: "100%", height: "100%" }
    : { width: size, height: size };

  useEffect(() => {
    const image = imageRef.current;
    if (image?.complete && image.naturalWidth === 0) {
      setFailedAvatar(human);
    }
  }, [human, id, src]);

  if (id === "bot") {
    return (
      <span
        data-avatar="bot"
        className={cn(
          "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[linear-gradient(135deg,#5b3cc4,#7c5cff)]",
          className
        )}
        style={box}
        role="img"
        aria-label={title ?? "Support Assistant (AI)"}
      >
        <Bot
          className="h-[55%] w-[55%] text-white"
          strokeWidth={1.8}
          aria-hidden
        />
      </span>
    );
  }

  return (
    <span
      data-avatar={human}
      data-animating={canAnimate ? "true" : "false"}
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted",
        className
      )}
      style={box}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {failedAvatar === human ? (
        <UserRound
          className="h-[55%] w-[55%] text-muted-foreground"
          aria-hidden
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={imageRef}
          src={src}
          srcSet={`${portraitSrc(human, 96)} 96w, ${portraitSrc(human, 256)} 256w`}
          sizes={`${pixelSize}px`}
          width={fill ? 96 : size}
          height={fill ? 96 : size}
          decoding="async"
          loading={pixelSize >= 64 ? "lazy" : undefined}
          className="h-full w-full object-cover"
          alt=""
          onError={() => setFailedAvatar(human)}
        />
      )}
      {canAnimate && <ClayCanvas key={human} id={human} />}
    </span>
  );
}

export function useSavedAvatar(
  key: string,
  fallback: AvatarId | "initial" = "initial"
) {
  const getSnapshot = useCallback(
    () => readSavedAvatar(key, fallback),
    [fallback, key]
  );
  const getServerSnapshot = useCallback(() => fallback, [fallback]);
  const avatar = useSyncExternalStore(
    subscribeToSavedAvatar,
    getSnapshot,
    getServerSnapshot
  );

  useEffect(() => {
    try {
      localStorage.removeItem("hf-avatar");
    } catch {}
  }, [key]);

  const save = useCallback(
    (next: AvatarId | "initial") => {
      try {
        localStorage.setItem(key, next);
      } catch {
        return;
      }
      window.dispatchEvent(new Event(AVATAR_CACHE_EVENT));
    },
    [key]
  );

  return [avatar, save] as const;
}

const INITIAL_OPTION = "initial" as const;
const RADIO_OPTIONS = [...AVATAR_IDS, INITIAL_OPTION] as const;

export function AvatarPicker({
  value,
  initial,
  onChange,
}: {
  value: AvatarId | "initial";
  initial: string;
  onChange: (next: AvatarId | "initial") => void;
}) {
  const [animationEnabled, setAnimationEnabled] =
    useAvatarAnimationPreference();
  const prefersReducedMotion = usePrefersReducedMotion();
  const buttonsRef = useRef<Array<HTMLButtonElement | null>>([]);
  const [hovered, setHovered] = useState<AvatarId | "initial" | null>(null);
  const [focused, setFocused] = useState<AvatarId | "initial" | null>(null);
  const selectedIndex = Math.max(
    0,
    RADIO_OPTIONS.indexOf(value as (typeof RADIO_OPTIONS)[number])
  );
  const initialSelectedIndex = useRef(selectedIndex);
  const preview = hovered ?? focused;
  const caption = preview
    ? preview === INITIAL_OPTION
      ? "Your initial"
      : AVATAR_LABELS[preview]
    : value === INITIAL_OPTION
      ? "Selected: Your initial"
      : `Selected: ${AVATAR_LABELS[value]}`;

  useEffect(() => {
    buttonsRef.current[initialSelectedIndex.current]?.focus();
  }, []);

  function focusOption(index: number) {
    const nextIndex = Math.max(0, Math.min(RADIO_OPTIONS.length - 1, index));
    buttonsRef.current[nextIndex]?.focus();
  }

  function onOptionKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
    option: (typeof RADIO_OPTIONS)[number]
  ) {
    if (
      event.key === "Enter" ||
      event.key === " " ||
      event.key === "Spacebar"
    ) {
      event.preventDefault();
      onChange(option);
      return;
    }

    let nextIndex: number | null = null;
    switch (event.key) {
      case "ArrowLeft":
        nextIndex = index - 1;
        break;
      case "ArrowRight":
        nextIndex = index + 1;
        break;
      case "ArrowUp":
        nextIndex = index - 4;
        break;
      case "ArrowDown":
        nextIndex = index + 4;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = RADIO_OPTIONS.length - 1;
        break;
    }
    if (nextIndex !== null) {
      event.preventDefault();
      focusOption(nextIndex);
    }
  }

  return (
    <div className="w-full min-w-0 rounded-2xl border border-border bg-card p-3 text-card-foreground shadow-[var(--shadow-md)]">
      <p className="px-1 text-sm font-extrabold">Choose your avatar</p>
      <p className="px-1 text-[11px] font-medium text-muted-foreground">
        Pick a look that feels like you
      </p>
      <div role="radiogroup" aria-label="Avatar" className="min-w-0">
        <div className="mt-2.5 grid grid-cols-4 gap-2">
          {AVATAR_IDS.map((id, index) => {
            const selected = value === id;
            return (
              <button
                key={id}
                ref={(node) => {
                  buttonsRef.current[index] = node;
                }}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={AVATAR_LABELS[id]}
                title={AVATAR_LABELS[id]}
                tabIndex={selectedIndex === index ? 0 : -1}
                onClick={() => onChange(id)}
                onKeyDown={(event) => onOptionKeyDown(event, index, id)}
                onMouseEnter={() => setHovered(id)}
                onMouseLeave={() => setHovered(null)}
                onFocus={() => setFocused(id)}
                onBlur={() => setFocused(null)}
                className={cn(
                  "group relative flex aspect-square min-h-11 min-w-11 items-center justify-center overflow-hidden rounded-xl border border-border bg-muted transition-[box-shadow,border-color] duration-150 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                  selected &&
                    "border-primary ring-2 ring-primary ring-offset-2 ring-offset-card"
                )}
              >
                <Avatar
                  id={id}
                  size="fill"
                  className="h-full w-full rounded-xl"
                  animate={selected || hovered === id || focused === id}
                />
                <span
                  aria-hidden
                  className={cn(
                    "absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition-opacity duration-150",
                    selected ? "opacity-100" : "opacity-0"
                  )}
                >
                  <Check className="h-3 w-3" strokeWidth={3} />
                </span>
              </button>
            );
          })}
        </div>
        <p
          aria-live="polite"
          className="mt-2 min-h-[2lh] px-1 text-center text-[11px] font-bold leading-tight text-balance text-muted-foreground"
        >
          {caption}
        </p>
        <button
          ref={(node) => {
            buttonsRef.current[AVATAR_IDS.length] = node;
          }}
          type="button"
          role="radio"
          aria-checked={value === INITIAL_OPTION}
          aria-label="Use my initial"
          tabIndex={selectedIndex === AVATAR_IDS.length ? 0 : -1}
          onClick={() => onChange(INITIAL_OPTION)}
          onKeyDown={(event) =>
            onOptionKeyDown(event, AVATAR_IDS.length, INITIAL_OPTION)
          }
          onMouseEnter={() => setHovered(INITIAL_OPTION)}
          onMouseLeave={() => setHovered(null)}
          onFocus={() => setFocused(INITIAL_OPTION)}
          onBlur={() => setFocused(null)}
          className={cn(
            "mt-1.5 flex min-h-11 w-full min-w-0 items-center gap-3 rounded-xl border px-3 text-sm font-bold transition-[box-shadow,border-color] duration-150 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
            value === INITIAL_OPTION
              ? "border-primary bg-primary/5 ring-2 ring-primary ring-offset-2 ring-offset-card"
              : "border-border bg-card hover:bg-muted"
          )}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-extrabold text-foreground">
            {initial}
          </span>
          <span className="min-w-0 flex-1 truncate text-left">
            Use my initial
          </span>
          <Check
            className={cn(
              "h-4 w-4 shrink-0 text-primary transition-opacity duration-150",
              value === INITIAL_OPTION ? "opacity-100" : "opacity-0"
            )}
            aria-hidden
          />
        </button>
      </div>
      <div className="mt-2 flex min-h-11 items-center justify-between gap-2 rounded-xl border border-border bg-card px-3 py-2">
        <span className="min-w-0 text-xs font-bold">Avatar animation</span>
        <button
          type="button"
          role="switch"
          aria-label="Avatar animation"
          aria-checked={animationEnabled && !prefersReducedMotion}
          aria-disabled={prefersReducedMotion ? "true" : undefined}
          onClick={() => {
            if (!prefersReducedMotion) setAnimationEnabled(!animationEnabled);
          }}
          className="relative flex h-11 min-h-11 w-11 shrink-0 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        >
          <span
            aria-hidden
            className={cn(
              "absolute inset-x-0 top-1/2 h-6 -translate-y-1/2 rounded-full border p-0.5 transition-colors duration-150",
              animationEnabled && !prefersReducedMotion
                ? "border-primary bg-primary"
                : "border-border bg-muted"
            )}
          />
          <span
            aria-hidden
            className={cn(
              "absolute left-0.5 top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-card shadow-sm transition-transform duration-150",
              animationEnabled && !prefersReducedMotion
                ? "translate-x-5"
                : "translate-x-0"
            )}
          />
        </button>
      </div>
      {prefersReducedMotion && (
        <p className="mt-1 px-1 text-[10px] leading-tight text-muted-foreground">
          Off while your device reduces motion
        </p>
      )}
    </div>
  );
}
