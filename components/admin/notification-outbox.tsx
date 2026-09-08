"use client";

import { useState, useTransition } from "react";
import { replayNotifications } from "@/app/actions/notifications";

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
      {notice && <p className="rounded-2xl bg-muted p-3 text-sm">{notice}</p>}
      {canReplay && selected.size > 0 && (
        <button
          type="button"
          disabled={pending}
          onClick={replay}
          className="glass-pill w-fit px-4 py-2"
        >
          Replay selected ({selected.size})
        </button>
      )}
      <ul className="grid gap-3">
        {rows.map((row) => (
          <li
            key={row.id}
            className="glass-strong flex flex-wrap items-start justify-between gap-4 rounded-2xl p-4"
          >
            <div className="grid gap-1 text-sm">
              <div className="flex flex-wrap gap-2 font-medium">
                <span>{row.event_type}</span>
                <span className="text-muted-foreground">· {row.channel}</span>
                <span
                  className={
                    row.status === "sent"
                      ? "text-emerald-600"
                      : row.status === "dead"
                        ? "text-destructive"
                        : "text-amber-600"
                  }
                >
                  {row.status}
                </span>
              </div>
              <p className="max-w-xl truncate">{row.subject}</p>
              {row.last_error && (
                <p className="text-destructive text-xs">{row.last_error}</p>
              )}
              <p className="text-xs text-muted-foreground">
                Attempts {row.attempts} ·{" "}
                {new Date(row.created_at).toLocaleString()}
              </p>
            </div>
            {canReplay && row.status === "dead" && (
              <input
                type="checkbox"
                checked={selected.has(row.id)}
                onChange={() => toggle(row.id)}
              />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
