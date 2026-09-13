"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  rejectAiSolution,
  rateTicket,
  reopenTicketByUser,
} from "@/app/actions/tickets";
import { confirmTicketResolved } from "@/app/actions/resolution";

export function TicketPortalActions({
  ticketId,
  status,
  canReopen,
  rating,
  ratingComment,
  recommendedIssue,
}: {
  ticketId: string;
  status: string;
  canReopen: boolean;
  rating: number | null;
  ratingComment: string | null;
  recommendedIssue: { id: string; title: string } | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [reopenReason, setReopenReason] = useState("");
  const [showReopen, setShowReopen] = useState(false);
  const [selectedRating, setSelectedRating] = useState(String(rating ?? ""));
  const [ratingText, setRatingText] = useState(ratingComment ?? "");

  function run(action: () => Promise<{ success: true } | { error: string }>) {
    startTransition(async () => {
      const result = await action();
      setNotice("error" in result ? result.error : "Saved.");
      if (!("error" in result)) window.location.reload();
    });
  }

  return (
    <div className="mt-6 space-y-6">
      {recommendedIssue && (
        <section className="glass p-5">
          <h2 className="font-semibold">Recommended guide</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {recommendedIssue.title}
          </p>
          <Link
            href={`/issues/${recommendedIssue.id}`}
            className="mt-3 inline-block underline underline-offset-4"
          >
            Open the step-by-step guide
          </Link>
          {status === "AI Resolving" && (
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                disabled={isPending}
                onClick={() => run(() => confirmTicketResolved(ticketId))}
                className="v2-touch rounded-xl bg-primary px-5 py-2 text-primary-foreground shadow-md disabled:opacity-60"
              >
                This fixed it
              </button>
              <div className="w-full max-w-xl space-y-2">
                <label htmlFor="reject-ai-note" className="text-sm font-medium">
                  What did not work?
                </label>
                <textarea
                  id="reject-ai-note"
                  value={rejectNote}
                  onChange={(event) => setRejectNote(event.target.value)}
                  rows={2}
                  className="w-full rounded-2xl border border-border/70 bg-background/60 p-3 backdrop-blur"
                />
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() =>
                    run(() => rejectAiSolution(ticketId, rejectNote))
                  }
                  className="glass-pill px-5 py-2 disabled:opacity-60"
                >
                  Didn&apos;t work
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {(status === "Resolved" || status === "Closed") && (
        <section className="glass p-5">
          <h2 className="font-semibold">Resolution</h2>
          {canReopen ? (
            <>
              <button
                type="button"
                disabled={isPending}
                onClick={() => setShowReopen((visible) => !visible)}
                className="glass-pill mt-3 px-5 py-2 disabled:opacity-60"
              >
                Reopen this ticket
              </button>
              {showReopen && (
                <div className="mt-3 max-w-xl space-y-2">
                  <label
                    htmlFor="reopen-reason"
                    className="text-sm font-medium"
                  >
                    Why does this still need help?
                  </label>
                  <textarea
                    id="reopen-reason"
                    value={reopenReason}
                    onChange={(event) => setReopenReason(event.target.value)}
                    rows={3}
                    className="w-full rounded-2xl border border-border/70 bg-background/60 p-3 backdrop-blur"
                  />
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() =>
                      run(() => reopenTicketByUser(ticketId, reopenReason))
                    }
                    className="v2-touch rounded-xl bg-primary px-5 py-2 text-primary-foreground shadow-md disabled:opacity-60"
                  >
                    Submit reopen request
                  </button>
                </div>
              )}
            </>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              This ticket can no longer be reopened.
            </p>
          )}
        </section>
      )}

      {(status === "Resolved" || status === "Closed") && (
        <section className="glass p-5">
          <h2 className="font-semibold">Rate your experience</h2>
          {rating ? (
            <p className="mt-2 text-sm">You rated {rating}/5</p>
          ) : (
            <form
              className="mt-3 space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                run(() =>
                  rateTicket(ticketId, Number(selectedRating), ratingText)
                );
              }}
            >
              <fieldset>
                <legend className="text-sm font-medium">Rating</legend>
                <div className="mt-2 flex gap-3">
                  {[1, 2, 3, 4, 5].map((value) => (
                    <label key={value} className="flex items-center gap-1">
                      <input
                        type="radio"
                        name="ticket-rating"
                        value={value}
                        checked={selectedRating === String(value)}
                        onChange={(event) =>
                          setSelectedRating(event.target.value)
                        }
                        aria-label={`${value} out of 5`}
                        required
                      />
                      {value}
                    </label>
                  ))}
                </div>
              </fieldset>
              <label
                htmlFor="rating-comment"
                className="block text-sm font-medium"
              >
                Comment (optional)
              </label>
              <textarea
                id="rating-comment"
                value={ratingText}
                onChange={(event) => setRatingText(event.target.value)}
                rows={2}
                className="w-full rounded-2xl border border-border/70 bg-background/60 p-3 backdrop-blur"
              />
              <button
                type="submit"
                disabled={isPending}
                className="v2-touch rounded-xl bg-primary px-5 py-2 text-primary-foreground shadow-md disabled:opacity-60"
              >
                Submit rating
              </button>
            </form>
          )}
        </section>
      )}
      {notice && <p className="text-sm text-muted-foreground">{notice}</p>}
    </div>
  );
}
