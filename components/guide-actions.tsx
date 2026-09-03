"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Bookmark, ThumbsDown, ThumbsUp } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { toggleBookmark, rateGuide } from "@/app/actions/guides";
import { TicketForm } from "@/components/ticket-form";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/lib/button-variants";
import { cn } from "@/lib/utils";

type GuideActionsProps = {
  issueId: string;
  user: User | null;
  initialBookmarked: boolean;
  initialVote: "up" | "down" | null;
  initialTotals: { up: number; down: number };
};

export function GuideActions({
  issueId,
  user,
  initialBookmarked,
  initialVote,
  initialTotals,
}: GuideActionsProps) {
  const [bookmarked, setBookmarked] = useState(initialBookmarked);
  const [vote, setVote] = useState(initialVote);
  const [totals, setTotals] = useState(initialTotals);
  const [showTicket, setShowTicket] = useState(false);
  const [isPending, startTransition] = useTransition();
  const loginHref = `/login?next=${encodeURIComponent(`/issues/${issueId}`)}`;

  function handleBookmark() {
    if (!user) return;
    const next = !bookmarked;
    setBookmarked(next);
    startTransition(async () => {
      const result = await toggleBookmark(issueId);
      if ("error" in result) setBookmarked(!next);
      else setBookmarked(result.bookmarked);
    });
  }

  function handleVote(nextVote: "up" | "down") {
    if (!user) return;
    const previous = vote;
    const next = nextVote;
    setVote(next);
    setTotals((current) => ({
      up: current.up + (next === "up" ? 1 : 0) - (previous === "up" ? 1 : 0),
      down:
        current.down +
        (next === "down" ? 1 : 0) -
        (previous === "down" ? 1 : 0),
    }));
    startTransition(async () => {
      const result = await rateGuide(issueId, next);
      if ("error" in result) {
        setVote(previous);
        setTotals(initialTotals);
      }
    });
  }

  return (
    <div className="mt-8 space-y-4 rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap gap-3">
        {user ? (
          <Button
            type="button"
            variant={bookmarked ? "default" : "outline"}
            aria-pressed={bookmarked}
            onClick={handleBookmark}
            disabled={isPending}
          >
            <Bookmark
              className={cn("mr-2 h-4 w-4", bookmarked && "fill-current")}
            />
            {bookmarked ? "Bookmarked" : "Bookmark"}
          </Button>
        ) : (
          <Link
            href={loginHref}
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            <Bookmark className="mr-2 h-4 w-4" />
            Log in to bookmark
          </Link>
        )}
        <div className="flex items-center gap-2" aria-label="Guide ratings">
          {user ? (
            <>
              <Button
                type="button"
                variant={vote === "up" ? "default" : "outline"}
                aria-label={`Helpful, ${totals.up} votes`}
                aria-pressed={vote === "up"}
                onClick={() => handleVote("up")}
                disabled={isPending}
              >
                <ThumbsUp className="mr-2 h-4 w-4" />
                {totals.up}
              </Button>
              <Button
                type="button"
                variant={vote === "down" ? "destructive" : "outline"}
                aria-label={`Not helpful, ${totals.down} votes`}
                aria-pressed={vote === "down"}
                onClick={() => handleVote("down")}
                disabled={isPending}
              >
                <ThumbsDown className="mr-2 h-4 w-4" />
                {totals.down}
              </Button>
            </>
          ) : (
            <Link
              href={loginHref}
              className={cn(buttonVariants({ variant: "ghost" }))}
            >
              Log in to rate · {totals.up} / {totals.down}
            </Link>
          )}
        </div>
        {user ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => setShowTicket((open) => !open)}
          >
            Submit a ticket to IT
          </Button>
        ) : (
          <Link
            href={loginHref}
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            Submit a ticket to IT
          </Link>
        )}
      </div>
      {showTicket && user && <TicketForm issueId={issueId} />}
    </div>
  );
}
