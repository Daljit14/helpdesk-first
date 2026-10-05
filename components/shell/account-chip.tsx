"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronUp } from "lucide-react";
import {
  Avatar,
  AvatarPicker,
  DEFAULT_AVATAR,
  type AvatarId,
  normalizeAvatarId,
  useSavedAvatar,
} from "@/components/avatar/avatar";
import { getDisplayName } from "@/lib/auth/display-name";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type AvatarFeedback = {
  userId: string;
  status: "idle" | "saving" | "saved" | "error";
  retryTarget?: AvatarId | "initial";
};

export function AccountChip({
  email,
  userId,
  avatar,
  name,
}: {
  email: string;
  userId: string;
  avatar?: string | null;
  /** Optional full name (user_metadata.full_name); falls back to the email. */
  name?: string | null;
}) {
  const metadataAvatar = normalizeAvatarId(avatar);
  const displayName = getDisplayName({
    email,
    user_metadata: name ? { full_name: name } : null,
  });
  const [choiceState, setChoiceState] = useState<{
    userId: string;
    value: AvatarId | "initial";
  } | null>(null);
  const choice = choiceState?.userId === userId ? choiceState.value : null;
  const [saved, setSaved] = useSavedAvatar(
    `hf-avatar:${userId}`,
    metadataAvatar ?? DEFAULT_AVATAR
  );
  const selected = choice ?? metadataAvatar ?? saved;
  const [open, setOpen] = useState(false);
  const [feedback, setFeedback] = useState<AvatarFeedback>({
    userId,
    status: "idle",
  });
  const currentFeedback =
    feedback.userId === userId ? feedback : { userId, status: "idle" as const };
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const initial = (displayName || email).slice(0, 1).toUpperCase();

  useEffect(() => {
    if (currentFeedback.status !== "saved") return;
    const timeout = window.setTimeout(() => {
      setFeedback((previous) =>
        previous.userId === userId && previous.status === "saved"
          ? { userId, status: "idle" }
          : previous
      );
    }, 2000);
    return () => window.clearTimeout(timeout);
  }, [currentFeedback.status, userId]);

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

  async function select(next: AvatarId | "initial") {
    const previous = selected;
    setChoiceState({ userId, value: next });
    setFeedback({ userId, status: "saving" });
    setOpen(false);
    buttonRef.current?.focus();
    try {
      const result = await createClient().auth.updateUser({
        data: { avatar: next },
      });
      if (result?.error) throw result.error;
      setSaved(next);
      setFeedback({ userId, status: "saved" });
    } catch {
      setChoiceState({ userId, value: previous });
      setFeedback({ userId, status: "error", retryTarget: next });
    }
  }

  return (
    <div ref={rootRef} className="relative min-w-0">
      {open && (
        <div
          id="avatar-picker"
          className="hf-picker-in absolute inset-x-0 bottom-full z-50 mb-2 min-w-0 max-w-full"
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
          "group flex min-h-12 w-full min-w-0 items-center gap-3 rounded-2xl px-2.5 py-1.5 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25",
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
          <Avatar id={selected} size={36} className="ring-2 ring-card" />
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
      <div className="min-h-4 px-2 text-[11px] leading-4">
        <p
          role="status"
          aria-live="polite"
          className={cn(
            currentFeedback.status === "error" &&
              "font-semibold text-destructive",
            currentFeedback.status === "saved" && "text-muted-foreground"
          )}
        >
          {currentFeedback.status === "saving" && "Saving avatar…"}
          {currentFeedback.status === "saved" && "Avatar saved"}
          {currentFeedback.status === "error" && (
            <>
              Couldn&apos;t save your avatar.{" "}
              <button
                type="button"
                className="font-bold underline underline-offset-2"
                onClick={() => {
                  if (currentFeedback.retryTarget)
                    void select(currentFeedback.retryTarget);
                }}
              >
                Retry
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
