"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CheckCircle2, Eye } from "lucide-react";
import { reviewShadowDecision } from "@/app/actions/admin-shadow";
import type { ShadowDecision } from "@/lib/admin/resolution-center";

const FIELD =
  "h-10 min-w-0 rounded-xl border border-border bg-card px-3 text-sm font-semibold text-foreground shadow-sm transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60";
const PRIMARY_BUTTON =
  "inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-extrabold text-primary-foreground shadow-sm transition-transform hover:-translate-y-px disabled:opacity-60";

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
      <div className="mt-4 rounded-2xl border border-border bg-muted/40 p-3 text-sm">
        <p className="flex items-center gap-2 font-extrabold">
          <Eye className="h-4 w-4 text-muted-foreground" aria-hidden />
          <span>Review: {reviewStatus}</span>
        </p>
        {reviewNote && (
          <p className="mt-1 text-muted-foreground">{reviewNote}</p>
        )}
        <p className="mt-2 text-xs font-semibold text-muted-foreground">
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
      className="mt-4 flex flex-wrap items-start gap-2 rounded-2xl border border-border bg-muted/30 p-3"
    >
      <input type="hidden" name="id" value={id} />
      <select
        name="status"
        defaultValue={reviewStatus === "unreviewed" ? "agree" : reviewStatus}
        disabled={pending}
        className={FIELD}
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
        className={`${FIELD} min-w-64 flex-1`}
      />
      <button type="submit" disabled={pending} className={PRIMARY_BUTTON}>
        <CheckCircle2 className="h-4 w-4" aria-hidden />
        {pending ? "Saving…" : "Save"}
      </button>
      <p
        role="status"
        aria-live="polite"
        className="min-h-5 basis-full text-sm font-bold text-muted-foreground"
      >
        {message}
      </p>
    </form>
  );
}
