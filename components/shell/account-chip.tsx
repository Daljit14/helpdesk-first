"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronUp } from "lucide-react";
import {
  AnimatedAvatar,
  AvatarPicker,
  DEFAULT_AVATAR,
  type AvatarId,
  normalizeAvatarId,
  useSavedAvatar,
} from "@/components/avatar/animated-avatar";
import { getDisplayName } from "@/lib/auth/display-name";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export function AccountChip({
  email,
  avatar,
  name,
}: {
  email: string;
  avatar?: string | null;
  /** Optional full name (user_metadata.full_name); falls back to the email. */
  name?: string | null;
}) {
  const metadataAvatar = normalizeAvatarId(avatar);
  const displayName = getDisplayName({
    email,
    user_metadata: name ? { full_name: name } : null,
  });
  const [choice, setChoice] = useState<AvatarId | "initial" | null>(null);
  const [saved, setSaved] = useSavedAvatar(metadataAvatar ?? DEFAULT_AVATAR);
  const selected = choice ?? metadataAvatar ?? saved;
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const initial = (displayName || email).slice(0, 1).toUpperCase();

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
    <div ref={rootRef} className="relative min-w-0">
      {open && (
        <div
          id="avatar-picker"
          className="hf-pop absolute inset-x-0 bottom-full z-50 mb-2 min-w-0 max-w-full"
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
        title={`${displayName} · ${email}`}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "hf-ava3-hover group flex min-h-12 w-full min-w-0 items-center gap-3 rounded-2xl px-2.5 py-1.5 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25",
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
          <span className="block truncate text-[13px] font-bold leading-tight text-foreground">
            {displayName}
          </span>
          <span className="block truncate text-[11px] font-medium leading-tight text-muted-foreground">
            {email}
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
