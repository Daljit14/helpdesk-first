"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { reviewPilotResolutionAction } from "@/app/actions/admin-pilot";
import type { PilotReview } from "@/lib/admin/resolution-center";

export function PilotReviewForm({
  review,
  canReview,
}: {
  review: PilotReview;
  canReview: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  if (!canReview) {
    return (
      <div className="mt-4 rounded border bg-muted/40 p-3 text-sm">
        <p className="font-medium">Review: {review.reviewStatus}</p>
        {review.reviewNote && (
          <p className="mt-1 text-muted-foreground">{review.reviewNote}</p>
        )}
        <p className="mt-2 text-muted-foreground">
          Organization admin required to review.
        </p>
      </div>
    );
  }
  return (
    <form
      className="mt-4 flex flex-wrap items-start gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        startTransition(async () => {
          const result = await reviewPilotResolutionAction(form);
          if ("error" in result) setMessage(result.error);
          else {
            setMessage("Review saved.");
            router.refresh();
          }
        });
      }}
    >
      <input type="hidden" name="id" value={review.id} />
      <select
        name="status"
        defaultValue={
          review.reviewStatus === "pending" ? "confirmed" : review.reviewStatus
        }
        disabled={pending}
        className="rounded border px-2 py-1"
      >
        <option value="confirmed">Confirmed</option>
        <option value="incorrect">Incorrect</option>
        <option value="unsafe">Unsafe</option>
      </select>
      <input
        name="note"
        defaultValue={review.reviewNote ?? ""}
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
        className="basis-full text-sm text-muted-foreground"
      >
        {message}
      </p>
    </form>
  );
}
