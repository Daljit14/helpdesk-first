"use client";

import { useEffect, useRef, useState } from "react";
import { BrandMark } from "@/components/shell/brand-mark";
import {
  CHARACTERS,
  Character,
  characterLabel,
  resolveCharacterId,
  type CharacterId,
} from "@/components/shell/characters";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export const AVATAR_EMOJIS = [
  "🙂",
  "😎",
  "🤓",
  "🧑‍💻",
  "👩‍💻",
  "🧑‍🔧",
  "🧑‍🎨",
  "🧑‍🚀",
  "🧑‍🎓",
  "🧑‍🍳",
  "🚀",
  "⭐",
] as const;

type AvatarValue =
  (typeof AVATAR_EMOJIS)[number] | "logo" | "initial" | `char:${CharacterId}`;

/** Accepts current values and upgrades legacy "char:<animal>" ids. */
function toAvatarValue(value: string | null | undefined): AvatarValue | null {
  if (!value) return null;
  if (value === "logo" || value === "initial") return value;
  if (AVATAR_EMOJIS.includes(value as never)) return value as AvatarValue;
  if (value.startsWith("char:")) {
    const id = resolveCharacterId(value.slice(5));
    if (id) return `char:${id}`;
  }
  return null;
}

export function AvatarPicker({
  email,
  avatar,
}: {
  email: string;
  avatar?: string | null;
}) {
  const [current, setCurrent] = useState<string | null>(toAvatarValue(avatar));
  const [open, setOpen] = useState(false);
  const [error, setError] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  async function select(next: AvatarValue) {
    setCurrent(next);
    setError(false);
    setOpen(false);
    const result = await createClient().auth.updateUser({
      data: { avatar: next },
    });
    const updateError = result?.error;
    if (updateError) setError(true);
  }

  const display = current?.startsWith("char:") ? (
    <Character id={current.slice(5) as CharacterId} className="h-8 w-8" />
  ) : current && current !== "logo" && current !== "initial" ? (
    <span aria-hidden className="text-base">
      {current}
    </span>
  ) : current === "initial" ? (
    <span aria-hidden className="text-xs font-extrabold">
      {email.slice(0, 1).toUpperCase()}
    </span>
  ) : (
    <BrandMark className="h-8 w-8 rounded-full" />
  );

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button
        type="button"
        aria-label="Choose avatar"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full min-w-0 items-center gap-2.5 rounded-xl px-2 py-1.5 text-left hover:bg-muted"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[linear-gradient(135deg,#ffc24b,#f472b6)] text-[#1c1633]">
          {display}
        </span>
        <span
          className="min-w-0 truncate text-[13px] font-medium text-nav-muted"
          title={email}
        >
          {email}
        </span>
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Choose avatar"
          className="absolute inset-x-0 bottom-full z-50 mb-2 w-full min-w-0 max-w-full rounded-2xl border border-border bg-card p-3 text-card-foreground shadow-[var(--shadow-md)]"
        >
          <p className="text-xs font-bold text-muted-foreground">People</p>
          <div className="mt-2 grid grid-cols-4 gap-1.5">
            <button
              type="button"
              aria-label="Logo"
              onClick={() => void select("logo")}
              className={cn(
                "grid aspect-square min-w-0 place-items-center rounded-xl p-0.5 hover:bg-muted",
                current === "logo" || !current
                  ? "ring-2 ring-primary"
                  : undefined
              )}
            >
              <BrandMark className="h-full w-full rounded-full" />
            </button>
            {CHARACTERS.map((id) => {
              const value = `char:${id}` as const;
              return (
                <button
                  key={id}
                  type="button"
                  aria-label={characterLabel(id)}
                  onClick={() => void select(value)}
                  className={cn(
                    "hf-ava-hover grid aspect-square min-w-0 place-items-center rounded-xl p-0.5 hover:bg-muted",
                    current === value
                      ? "hf-ava-on ring-2 ring-primary"
                      : undefined
                  )}
                >
                  <Character id={id} className="h-full w-full" />
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-xs font-bold text-muted-foreground">Emoji</p>
          <div className="mt-2 grid grid-cols-6 gap-1">
            {AVATAR_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                aria-label={emoji}
                onClick={() => void select(emoji)}
                className={cn(
                  "grid aspect-square min-w-0 place-items-center rounded-xl text-base hover:bg-muted",
                  current === emoji ? "ring-2 ring-primary" : undefined
                )}
              >
                {emoji}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void select("initial")}
            className="mt-3 min-h-10 w-full rounded-xl px-2 text-left text-xs font-semibold hover:bg-muted"
          >
            Use my initial
          </button>
          {error && (
            <p className="mt-2 text-xs font-semibold text-destructive">
              Couldn&apos;t save
            </p>
          )}
        </div>
      )}
    </div>
  );
}
