"use client";

import { useState, useTransition } from "react";
import { Bell, CheckCircle2, Inbox, Mail, RotateCcw } from "lucide-react";
import { replayNotifications } from "@/app/actions/notifications";
import {
  EmptyState,
  StatusPill,
  type StatTone,
} from "@/components/admin/ui/admin-kit";

type Row = {
  id: string;
  event_type: string;
  channel: string;
  recipient_user_id: string;
  subject: string;
  body: string;
  status: string;
  attempts: number;
  last_error: string | null;
  created_at: string;
  sent_at: string | null;
};

const FIELD =
  "h-10 w-full min-w-0 rounded-xl border border-border bg-card px-3 text-sm font-semibold text-foreground shadow-sm transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const PRIMARY_BUTTON =
  "inline-flex h-10 w-fit items-center gap-2 rounded-xl bg-primary px-4 text-sm font-extrabold text-primary-foreground shadow-sm transition-transform hover:-translate-y-px disabled:opacity-60";

const STATUS_TONE: Record<string, StatTone> = {
  pending: "warn",
  sending: "info",
  sent: "good",
  failed: "danger",
  dead: "danger",
};

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString();
}

export function NotificationOutbox({
  rows,
  canReplay,
}: {
  rows: Row[];
  canReplay: boolean;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [statusFilter, setStatusFilter] = useState("all");
  const filteredRows =
    statusFilter === "all"
      ? rows
      : rows.filter((row) => row.status === statusFilter);

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  function replay() {
    if (selected.size === 0) return;
    startTransition(async () => {
      const result = await replayNotifications(Array.from(selected));
      if ("error" in result) setNotice(result.error ?? null);
      else setNotice(`Replayed ${result.replayed} notification(s).`);
      setSelected(new Set());
    });
  }

  return (
    <div className="grid gap-4">
      {notice && (
        <p
          role="status"
          className="hf-swap flex items-center gap-2 rounded-2xl border border-primary/30 bg-secondary/60 p-3 text-sm font-bold"
        >
          <CheckCircle2 className="h-4 w-4 text-primary" aria-hidden />
          {notice}
        </p>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="grid w-full max-w-xs gap-1.5 text-sm font-bold">
          Filter by status
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className={FIELD}
          >
            <option value="all">All</option>
            <option value="pending">Pending</option>
            <option value="sending">Sending</option>
            <option value="sent">Sent</option>
            <option value="failed">Failed</option>
            <option value="dead">Dead</option>
          </select>
        </label>
        {canReplay && selected.size > 0 && (
          <button
            type="button"
            disabled={pending}
            onClick={replay}
            className={PRIMARY_BUTTON}
          >
            <RotateCcw className="h-4 w-4" aria-hidden />
            Replay selected ({selected.size})
          </button>
        )}
      </div>
      {rows.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="No notifications yet"
          body="Emails and alerts queued by ticket events will show up here."
        />
      ) : filteredRows.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="Nothing with this status"
          body="Pick another status to see more notifications."
        />
      ) : (
        <ul className="grid gap-3">
          {filteredRows.map((row) => (
            <li
              key={row.id}
              className="hf-adm-row flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-border bg-card/60 p-4 transition-colors hover:border-primary/40"
            >
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
                  <Mail className="h-4 w-4" aria-hidden />
                </span>
                <div className="grid min-w-0 gap-1 text-sm">
                  <div className="flex flex-wrap items-center gap-2 font-bold">
                    <span>{row.event_type}</span>
                    <span className="text-muted-foreground">
                      · {row.channel}
                    </span>
                    <StatusPill
                      tone={STATUS_TONE[row.status] ?? "neutral"}
                      pulse={row.status === "sending"}
                    >
                      {row.status}
                    </StatusPill>
                  </div>
                  <p className="max-w-xl truncate font-semibold">
                    {row.subject}
                  </p>
                  {row.last_error && (
                    <p className="text-xs font-semibold text-status-danger">
                      {row.last_error}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Attempts {row.attempts} · {formatTimestamp(row.created_at)}
                  </p>
                </div>
              </div>
              {canReplay && row.status === "dead" && (
                <input
                  type="checkbox"
                  aria-label={`Select ${row.subject} for replay`}
                  className="mt-1 h-4 w-4 accent-primary"
                  checked={selected.has(row.id)}
                  onChange={() => toggle(row.id)}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
