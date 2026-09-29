"use client";

import { useEffect, useRef, useState } from "react";
import { BrandMark } from "@/components/shell/brand-mark";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export const AVATAR_EMOJIS = [
  "🙂",
  "😎",
  "🤓",
  "🧑‍💻",
  "👩‍💻",
  "🧑‍🔧",
  "🐱",
  "🐶",
  "🦊",
  "🐼",
  "🚀",
  "⭐",
] as const;

type AvatarValue = (typeof AVATAR_EMOJIS)[number] | "logo" | "initial";

function isAvatarValue(value: string | null | undefined): value is AvatarValue {
  return (
    value === "logo" ||
    value === "initial" ||
    AVATAR_EMOJIS.includes(value as never)
  );
}

export function AvatarPicker({
  email,
  avatar,
}: {
  email: string;
  avatar?: string | null;
}) {
  const [current, setCurrent] = useState<string | null>(
    isAvatarValue(avatar) ? avatar : null
  );
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

  const display =
    current && current !== "logo" && current !== "initial" ? (
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
        className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 text-left hover:bg-muted"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,#ffc24b,#f472b6)] text-[#1c1633]">
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
          className="absolute bottom-full left-0 z-50 mb-2 w-64 rounded-2xl border border-border bg-card p-3 text-card-foreground shadow-[var(--shadow-md)]"
        >
          <p className="text-xs font-bold text-muted-foreground">
            Choose an avatar
          </p>
          <div className="mt-2 grid grid-cols-6 gap-1">
            <button
              type="button"
              aria-label="Logo"
              onClick={() => void select("logo")}
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-lg hover:bg-muted",
                current === "logo" || !current ? "bg-muted" : undefined
              )}
            >
              <BrandMark className="h-7 w-7 rounded-full" />
            </button>
            {AVATAR_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                aria-label={emoji}
                onClick={() => void select(emoji)}
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-lg text-base hover:bg-muted",
                  current === emoji ? "bg-muted" : undefined
                )}
              >
                {emoji}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void select("initial")}
            className="mt-2 min-h-9 w-full rounded-lg px-2 text-left text-xs font-semibold hover:bg-muted"
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
