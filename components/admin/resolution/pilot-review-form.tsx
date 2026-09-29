"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CheckCircle2, Eye } from "lucide-react";
import { reviewPilotResolutionAction } from "@/app/actions/admin-pilot";
import type { PilotReview } from "@/lib/admin/resolution-center";

const FIELD =
  "h-10 min-w-0 rounded-xl border border-border bg-card px-3 text-sm font-semibold text-foreground shadow-sm transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60";
const PRIMARY_BUTTON =
  "inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-extrabold text-primary-foreground shadow-sm transition-transform hover:-translate-y-px disabled:opacity-60";

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
      <div className="mt-4 rounded-2xl border border-border bg-muted/40 p-3 text-sm">
        <p className="flex items-center gap-2 font-extrabold">
          <Eye className="h-4 w-4 text-muted-foreground" aria-hidden />
          <span>Review: {review.reviewStatus}</span>
        </p>
        {review.reviewNote && (
          <p className="mt-1 text-muted-foreground">{review.reviewNote}</p>
        )}
        <p className="mt-2 text-xs font-semibold text-muted-foreground">
          Organization admin required to review.
        </p>
      </div>
    );
  }
  return (
    <form
      className="mt-4 flex flex-wrap items-start gap-2 rounded-2xl border border-border bg-muted/30 p-3"
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
        className={FIELD}
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
        className={`${FIELD} min-w-64 flex-1`}
      />
      <button type="submit" disabled={pending} className={PRIMARY_BUTTON}>
        <CheckCircle2 className="h-4 w-4" aria-hidden />
        {pending ? "Saving…" : "Save"}
      </button>
      <p
        role="status"
        aria-live="polite"
        className="basis-full text-sm font-bold text-muted-foreground"
      >
        {message}
      </p>
    </form>
  );
}
