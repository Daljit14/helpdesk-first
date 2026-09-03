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
}: {
  initialTickets: Ticket[];
  userId: string;
}) {
  const [tickets, setTickets] = useState(initialTickets);

  useEffect(() => {
    const supabase = createClient();
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
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  if (tickets.length === 0) {
    return (
      <div className="mt-8 rounded-xl border border-border bg-card p-8 text-center">
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
    <div className="mt-8 overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-border bg-muted/50">
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
              className="border-b border-border last:border-0"
            >
              <td className="px-4 py-4 align-top">
                <Link
                  href={`/issues/${ticket.issue_id}`}
                  className="font-medium underline underline-offset-4"
                >
                  {ticket.issue_title}
                </Link>
              </td>
              <td className="px-4 py-4 align-top">
                <span className="rounded-full bg-muted px-2 py-1 text-xs">
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
