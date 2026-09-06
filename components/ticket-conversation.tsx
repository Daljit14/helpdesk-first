"use client";

import { useEffect, useState, useTransition } from "react";
import {
  addUserComment,
  requestHuman,
  verifyTicket,
} from "@/app/actions/tickets";
import { createClient } from "@/lib/supabase/client";

type Comment = {
  id: number;
  message: string;
  author_type: string;
  created_at: string;
};

export function TicketConversation({
  ticketId,
  userId,
  initialComments,
  status,
}: {
  ticketId: string;
  userId: string;
  initialComments: Comment[];
  status: string;
}) {
  const [comments, setComments] = useState(initialComments);
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    const supabase = createClient();
    const refresh = async () => {
      const { data } = await supabase
        .from("ticket_comments")
        .select("id,message,author_type,created_at")
        .eq("ticket_id", ticketId)
        .eq("visibility", "public")
        .order("created_at", { ascending: true });
      if (data) setComments(data as Comment[]);
    };
    const channel = supabase
      .channel(`ticket-comments-${ticketId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "ticket_comments",
          filter: `ticket_id=eq.${ticketId}`,
        },
        () => void refresh()
      )
      .subscribe();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 30_000);
    return () => {
      window.clearInterval(timer);
      supabase.removeChannel(channel);
    };
  }, [ticketId, userId]);

  function submitComment(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await addUserComment(ticketId, message);
      setNotice("error" in result ? result.error : "Comment added.");
      if (!("error" in result)) {
        setMessage("");
        const supabase = createClient();
        const { data } = await supabase
          .from("ticket_comments")
          .select("id,message,author_type,created_at")
          .eq("ticket_id", ticketId)
          .eq("visibility", "public")
          .order("created_at", { ascending: true });
        if (data) setComments(data as Comment[]);
      }
    });
  }

  return (
    <div className="mt-6 space-y-6">
      <div className="glass p-5">
        <h2 className="font-semibold">Conversation</h2>
        <ol className="mt-4 space-y-3">
          {comments.map((comment) => (
            <li
              key={comment.id}
              className={`max-w-[85%] rounded-2xl p-3 ${
                comment.author_type === "user"
                  ? "ml-auto bg-primary/10"
                  : "bg-muted/60"
              }`}
            >
              <p className="text-xs font-medium uppercase">
                {comment.author_type}
              </p>
              <p className="mt-1 whitespace-pre-wrap">{comment.message}</p>
            </li>
          ))}
        </ol>
        <form onSubmit={submitComment} className="mt-4 space-y-2">
          <label htmlFor="ticket-comment" className="font-medium">
            Reply
          </label>
          <textarea
            id="ticket-comment"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            className="w-full rounded-2xl border border-border/70 bg-background/60 p-3 backdrop-blur"
            rows={3}
          />
          <button className="rounded-full bg-gradient-to-b from-primary to-primary/85 px-5 py-2 text-primary-foreground shadow-md shadow-primary/25">
            Add reply
          </button>
        </form>
        {notice && <p className="mt-2 text-sm">{notice}</p>}
      </div>
      {(status === "AI Resolving" || status === "Waiting for User") && (
        <button
          type="button"
          onClick={() =>
            startTransition(async () => {
              const result = await requestHuman(
                ticketId,
                "User requested human support."
              );
              setNotice(
                "error" in result ? result.error : "A human has been requested."
              );
            })
          }
          className="glass-pill px-5 py-2"
        >
          I still need help from a person
        </button>
      )}
      {status === "Pending Verification" && (
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() =>
              startTransition(async () => {
                const result = await verifyTicket(ticketId, true);
                setNotice(
                  "error" in result ? result.error : "Thanks for confirming."
                );
              })
            }
            className="rounded-full bg-gradient-to-b from-primary to-primary/85 px-5 py-2 text-primary-foreground shadow-md shadow-primary/25"
          >
            Yes, it&apos;s fixed
          </button>
          <button
            type="button"
            onClick={() =>
              startTransition(async () => {
                const result = await verifyTicket(ticketId, false);
                setNotice(
                  "error" in result ? result.error : "We&apos;ll keep helping."
                );
              })
            }
            className="glass-pill px-5 py-2"
          >
            No, still broken
          </button>
        </div>
      )}
    </div>
  );
}
