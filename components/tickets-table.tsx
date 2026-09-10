"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Clock,
  RotateCcw,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Ticket } from "@/lib/guides-data";
import { getIssueBySlug } from "@/lib/search";
import { AttachmentLink } from "@/components/attachment-link";
import {
  describeTicketStatus,
  ticketReference,
} from "@/lib/tickets/user-status";

type TicketWithAttachments = Ticket & { attachmentCount?: number };

function StatusIcon({ label }: { label: string }) {
  const normalized = label.toLowerCase();
  const Icon = normalized.includes("resolved")
    ? CheckCircle2
    : normalized.includes("waiting") || normalized.includes("reply")
      ? Clock
      : normalized.includes("reopen")
        ? RotateCcw
        : normalized.includes("needed") || normalized.includes("suggested")
          ? AlertTriangle
          : Circle;
  return <Icon className="h-3.5 w-3.5" aria-hidden />;
}

export function TicketsTable({
  initialTickets,
  userId,
  secureAttachmentsEnabled = false,
  portalEnabled = false,
}: {
  initialTickets: TicketWithAttachments[];
  userId: string;
  secureAttachmentsEnabled?: boolean;
  portalEnabled?: boolean;
}) {
  const [tickets, setTickets] = useState(initialTickets);
  const [live, setLive] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    const refreshTickets = async () => {
      const { data, error } = await supabase
        .from("tickets")
        .select(
          portalEnabled
            ? "id, issue_id, issue_title, message, status, created_at, attachment_path, resolver_type"
            : "id, issue_id, issue_title, message, status, created_at, attachment_path"
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      if (error) {
        console.warn("Unable to refresh tickets.", error);
        return;
      }
      let attachmentCounts = new Map<string, number>();
      if (secureAttachmentsEnabled) {
        const { data: attachments } = await supabase
          .from("ticket_attachments")
          .select("ticket_id")
          .eq("uploader_id", userId)
          .not("ticket_id", "is", null)
          .neq("status", "deleted");
        attachmentCounts = new Map();
        for (const attachment of attachments ?? []) {
          if (attachment.ticket_id) {
            attachmentCounts.set(
              attachment.ticket_id,
              (attachmentCounts.get(attachment.ticket_id) ?? 0) + 1
            );
          }
        }
      }
      const refreshedTickets = (data ?? []) as unknown as Ticket[];
      setTickets(
        refreshedTickets.map((ticket) => ({
          ...ticket,
          attachmentCount: attachmentCounts.get(ticket.id) ?? 0,
        }))
      );
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
              return current.map((t) =>
                t.id === updated.id
                  ? { ...updated, attachmentCount: t.attachmentCount }
                  : t
              );
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
  }, [portalEnabled, secureAttachmentsEnabled, userId]);

  if (tickets.length === 0) {
    if (portalEnabled) {
      return (
        <div
          data-live={live ? "connected" : "fallback"}
          className="mt-8 space-y-6"
        >
          <PortalTicketSection
            heading="Open tickets"
            tickets={[]}
            secureAttachmentsEnabled={secureAttachmentsEnabled}
            testId="tickets-open"
          />
          <PortalTicketSection
            heading="Previous tickets"
            tickets={[]}
            secureAttachmentsEnabled={secureAttachmentsEnabled}
            testId="tickets-previous"
          />
        </div>
      );
    }
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

  if (portalEnabled) {
    const groups = tickets.reduce(
      (result, ticket) => {
        const group = describeTicketStatus(ticket.status).group;
        result[group].push(ticket);
        return result;
      },
      {
        open: [] as TicketWithAttachments[],
        previous: [] as TicketWithAttachments[],
      }
    );
    return (
      <div
        data-live={live ? "connected" : "fallback"}
        className="mt-8 space-y-6"
      >
        <PortalTicketSection
          heading="Open tickets"
          tickets={groups.open}
          secureAttachmentsEnabled={secureAttachmentsEnabled}
          testId="tickets-open"
        />
        <PortalTicketSection
          heading="Previous tickets"
          tickets={groups.previous}
          secureAttachmentsEnabled={secureAttachmentsEnabled}
          testId="tickets-previous"
        />
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
                  href={`/tickets/${ticket.id}`}
                  className="font-medium underline underline-offset-4"
                >
                  {ticket.issue_title}
                </Link>
                {getIssueBySlug(ticket.issue_id) && (
                  <Link
                    href={`/issues/${ticket.issue_id}`}
                    className="ml-3 text-xs text-muted-foreground underline underline-offset-4"
                  >
                    View guide
                  </Link>
                )}
              </td>
              <td className="px-4 py-4 align-top">
                <Link
                  href={`/tickets/${ticket.id}#progress`}
                  aria-label={`View progress for ticket ${ticket.id}`}
                  className="glass-pill inline-block px-3 py-1 text-xs hover:bg-muted"
                >
                  {ticket.status}
                </Link>
              </td>
              <td className="max-w-md whitespace-pre-wrap px-4 py-4 align-top">
                {ticket.message}
                {secureAttachmentsEnabled ? (
                  ticket.attachmentCount ? (
                    <Link
                      href={`/tickets/${ticket.id}`}
                      className="mt-1 inline-flex text-sm underline underline-offset-4"
                    >
                      {ticket.attachmentCount} attachment
                      {ticket.attachmentCount === 1 ? "" : "s"}
                    </Link>
                  ) : null
                ) : ticket.attachment_path ? (
                  <AttachmentLink path={ticket.attachment_path} />
                ) : null}
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

function PortalTicketSection({
  heading,
  tickets,
  secureAttachmentsEnabled,
  testId,
}: {
  heading: string;
  tickets: TicketWithAttachments[];
  secureAttachmentsEnabled: boolean;
  testId: string;
}) {
  return (
    <section data-testid={testId} className="glass-strong p-5">
      <h2 className="text-xl font-semibold">{heading}</h2>
      {tickets.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          No {heading.toLowerCase()}
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {tickets.map((ticket) => {
            const status = describeTicketStatus(ticket.status, {
              resolverType: ticket.resolver_type,
            });
            const issue = getIssueBySlug(ticket.issue_id);
            return (
              <li key={ticket.id} className="glass p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={`/tickets/${ticket.id}`}
                      className="font-medium underline underline-offset-4"
                    >
                      {ticket.issue_title}
                    </Link>
                    {issue && (
                      <Link
                        href={`/issues/${ticket.issue_id}`}
                        className="ml-3 text-xs text-muted-foreground underline underline-offset-4"
                      >
                        View guide
                      </Link>
                    )}
                    <p className="font-mono text-xs text-muted-foreground">
                      {ticketReference(ticket.id)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/tickets/${ticket.id}#progress`}
                      aria-label={`View progress for ticket ${ticket.id}`}
                      title={ticket.status}
                      className="glass-pill inline-flex items-center gap-1 px-3 py-1 text-xs hover:bg-muted"
                    >
                      <StatusIcon label={status.label} />
                      {status.label}
                    </Link>
                    {status.attention && (
                      <span className="glass-pill inline-flex items-center gap-1 bg-[var(--status-warning)]/15 px-3 py-1 text-xs text-[var(--status-warning-foreground)]">
                        <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                        Action needed
                      </span>
                    )}
                  </div>
                </div>
                <p className="mt-3 line-clamp-2 whitespace-pre-wrap text-sm text-muted-foreground">
                  {ticket.message}
                </p>
                {secureAttachmentsEnabled && ticket.attachmentCount ? (
                  <Link
                    href={`/tickets/${ticket.id}`}
                    className="mt-1 inline-flex text-sm underline underline-offset-4"
                  >
                    {ticket.attachmentCount} attachment
                    {ticket.attachmentCount === 1 ? "" : "s"}
                  </Link>
                ) : ticket.attachment_path ? (
                  <AttachmentLink path={ticket.attachment_path} />
                ) : null}
                <p className="mt-3 text-xs text-muted-foreground">
                  {new Date(ticket.created_at).toLocaleDateString()}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
