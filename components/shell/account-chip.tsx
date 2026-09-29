"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronUp } from "lucide-react";
import {
  AVATAR_IDS,
  AnimatedAvatar,
  AvatarPicker,
  type AvatarId,
  useSavedAvatar,
} from "@/components/avatar/animated-avatar";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

function avatarFromMetadata(value: string | null | undefined) {
  if (value === "initial" || AVATAR_IDS.includes(value as AvatarId)) {
    return value as AvatarId | "initial";
  }
  if (value?.startsWith("char:")) {
    const id = value.slice(5);
    if (AVATAR_IDS.includes(id as AvatarId)) return id as AvatarId;
  }
  return null;
}

export function AccountChip({
  email,
  avatar,
}: {
  email: string;
  avatar?: string | null;
}) {
  const metadataAvatar = avatarFromMetadata(avatar);
  const [choice, setChoice] = useState<AvatarId | "initial" | null>(null);
  const [saved, setSaved] = useSavedAvatar(metadataAvatar ?? "bot");
  const selected = choice ?? metadataAvatar ?? saved;
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const initial = email.slice(0, 1).toUpperCase();

  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function select(next: AvatarId | "initial") {
    setChoice(next);
    setSaved(next);
    setOpen(false);
    buttonRef.current?.focus();
    void createClient()
      .auth.updateUser({ data: { avatar: next } })
      .catch(() => undefined);
  }

  return (
    <div ref={rootRef} className="relative">
      {open && (
        <div
          id="avatar-picker"
          className="hf-pop absolute bottom-full left-0 z-50 mb-2"
        >
          <AvatarPicker value={selected} initial={initial} onChange={select} />
        </div>
      )}
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls="avatar-picker"
        aria-label={`Change avatar for ${email}`}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "group flex min-h-12 w-full items-center gap-3 rounded-2xl px-2.5 py-1.5 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25",
          open && "bg-muted"
        )}
      >
        {selected === "initial" ? (
          <span
            aria-hidden
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,#ffc24b,#f472b6)] text-sm font-extrabold leading-none text-[#1c1633]"
          >
            {initial}
          </span>
        ) : (
          <AnimatedAvatar
            id={selected}
            size={36}
            className="ring-2 ring-card"
          />
        )}
        <span className="min-w-0 flex-1">
          <span
            className="block truncate text-[13px] font-semibold leading-tight text-foreground"
            title={email}
          >
            {email}
          </span>
          <span className="block text-[11px] font-semibold leading-tight text-muted-foreground">
            Change avatar
          </span>
        </span>
        <ChevronUp
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            !open && "rotate-180"
          )}
          aria-hidden
        />
      </button>
    </div>
  );
}
