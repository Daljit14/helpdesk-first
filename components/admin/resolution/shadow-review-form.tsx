"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { reviewShadowDecision } from "@/app/actions/admin-shadow";
import type { ShadowDecision } from "@/lib/admin/resolution-center";

export function ShadowReviewForm({
  id,
  reviewStatus,
  reviewNote,
  canReview,
}: {
  id: string;
  reviewStatus: ShadowDecision["reviewStatus"];
  reviewNote: string | null;
  canReview: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");

  if (!canReview) {
    return (
      <div className="mt-4 rounded border bg-muted/40 p-3 text-sm">
        <p className="font-medium">Review: {reviewStatus}</p>
        {reviewNote && (
          <p className="mt-1 text-muted-foreground">{reviewNote}</p>
        )}
        <p className="mt-2 text-muted-foreground">
          Organization admin required to review.
        </p>
      </div>
    );
  }

  function submit(formData: FormData) {
    startTransition(async () => {
      const result = await reviewShadowDecision(formData);
      if ("error" in result) {
        setMessage(result.error);
        return;
      }
      setMessage("Review saved.");
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={(event) => {
        const form = event.currentTarget;
        event.preventDefault();
        submit(new FormData(form));
      }}
      className="mt-4 flex flex-wrap items-start gap-2"
    >
      <input type="hidden" name="id" value={id} />
      <select
        name="status"
        defaultValue={reviewStatus === "unreviewed" ? "agree" : reviewStatus}
        disabled={pending}
        className="rounded border px-2 py-1"
      >
        <option value="agree">Agree</option>
        <option value="disagree">Disagree</option>
        <option value="unsafe">Unsafe</option>
      </select>
      <input
        name="note"
        defaultValue={reviewNote ?? ""}
        placeholder="Review note"
        disabled={pending}
        className="min-w-64 rounded border px-2 py-1"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded border px-3 py-1 disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save"}
      </button>
      <p
        role="status"
        aria-live="polite"
        className="min-h-5 basis-full text-sm text-muted-foreground"
      >
        {message}
      </p>
    </form>
  );
}
