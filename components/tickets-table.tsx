"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Paperclip } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getTicketAttachmentUrl } from "@/lib/supabase/storage";
import type { Ticket } from "@/lib/guides-data";

function AttachmentLink({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getTicketAttachmentUrl(path).then((signedUrl) => {
      if (active) setUrl(signedUrl);
    });
    return () => {
      active = false;
    };
  }, [path]);

  if (!url) return null;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-1 inline-flex items-center gap-1 text-sm underline underline-offset-4"
    >
      <Paperclip className="h-3.5 w-3.5" />
      View attachment
    </a>
  );
}

export function TicketsTable({
  initialTickets,
  userId,
  workflowEnabled = false,
}: {
  initialTickets: Ticket[];
  userId: string;
  workflowEnabled?: boolean;
}) {
  const [tickets, setTickets] = useState(initialTickets);
  const [live, setLive] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    const refreshTickets = async () => {
      const { data, error } = await supabase
        .from("tickets")
        .select(
          "id, issue_id, issue_title, message, status, created_at, attachment_path"
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      if (error) {
        console.warn("Unable to refresh tickets.", error);
        return;
      }
      setTickets((data ?? []) as Ticket[]);
    };
    const channel = supabase
      .channel("tickets-live")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tickets",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          setTickets((current) => {
            if (payload.eventType === "DELETE") {
              const oldRow = payload.old as { id?: string };
              return current.filter((t) => t.id !== oldRow.id);
            }
            const updated = payload.new as Ticket;
            const exists = current.some((t) => t.id === updated.id);
            if (exists) {
              return current.map((t) => (t.id === updated.id ? updated : t));
            }
            return [updated, ...current];
          });
        }
      )
      .subscribe((status, error) => {
        const connected = status === "SUBSCRIBED";
        setLive(connected);
        if (!connected) {
          console.warn(
            `Tickets realtime channel ${status}.`,
            error ?? "No error details."
          );
        }
      });
    const poll = () => {
      if (document.visibilityState === "visible") void refreshTickets();
    };
    const interval = window.setInterval(poll, 30_000);
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") void refreshTickets();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      supabase.removeChannel(channel);
    };
  }, [userId]);

  if (tickets.length === 0) {
    return (
      <div className="glass-strong mt-8 p-8 text-center">
        <p className="text-lg font-medium">
          You have not submitted any tickets.
        </p>
        <Link
          href="/"
          className="mt-4 inline-block underline underline-offset-4"
        >
          Browse troubleshooting guides
        </Link>
      </div>
    );
  }

  return (
    <div
      className="glass-strong mt-8 overflow-x-auto"
      data-live={live ? "connected" : "fallback"}
    >
      <table className="w-full text-left text-sm">
        <thead className="sticky top-0 border-b border-border bg-muted/60 backdrop-blur">
          <tr>
            <th className="px-4 py-3 font-medium">Issue</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Message</th>
            <th className="px-4 py-3 font-medium">Created</th>
          </tr>
        </thead>
        <tbody>
          {tickets.map((ticket) => (
            <tr
              key={ticket.id}
              className="border-b border-border transition-colors hover:bg-muted/40 last:border-0"
            >
              <td className="px-4 py-4 align-top">
                <Link
                  href={
                    workflowEnabled
                      ? `/tickets/${ticket.id}`
                      : `/issues/${ticket.issue_id}`
                  }
                  className="font-medium underline underline-offset-4"
                >
                  {ticket.issue_title}
                </Link>
              </td>
              <td className="px-4 py-4 align-top">
                <span className="glass-pill px-3 py-1 text-xs">
                  {ticket.status}
                </span>
              </td>
              <td className="max-w-md whitespace-pre-wrap px-4 py-4 align-top">
                {ticket.message}
                {ticket.attachment_path && (
                  <AttachmentLink path={ticket.attachment_path} />
                )}
              </td>
              <td className="whitespace-nowrap px-4 py-4 align-top text-muted-foreground">
                {new Date(ticket.created_at).toLocaleDateString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
