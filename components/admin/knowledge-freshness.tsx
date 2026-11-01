"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { CalendarClock, CheckCircle2, ShieldCheck } from "lucide-react";
import { verifyGuideAction } from "@/app/actions/knowledge-freshness";
import type { FreshnessState, GuideFreshness } from "@/lib/knowledge/freshness";
import {
  EmptyState,
  Panel,
  StatusPill,
  type StatTone,
} from "@/components/admin/ui/admin-kit";

const SMALL_PRIMARY =
  "inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-extrabold text-primary-foreground shadow-sm transition-transform hover:-translate-y-px disabled:opacity-60";

const stateLabel: Record<FreshnessState, string> = {
  fresh: "Fresh",
  due_soon: "Due soon",
  overdue: "Overdue",
  expired: "Expired",
  at_risk: "At risk",
};
const stateTone: Record<FreshnessState, StatTone> = {
  fresh: "good",
  due_soon: "info",
  overdue: "warn",
  expired: "danger",
  at_risk: "danger",
};

export function KnowledgeFreshness({
  items,
  canWrite,
}: {
  items: GuideFreshness[];
  canWrite: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const queue = items.filter((item) => item.state !== "fresh");
  const fresh = items.length - queue.length;

  function verify(slug: string) {
    startTransition(async () => {
      const result = await verifyGuideAction(slug);
      setMessage(
        "error" in result ? result.error : `Marked "${slug}" as reviewed.`
      );
    });
  }

  return (
    <Panel
      id="needs-recheck"
      title="Needs re-check"
      description={`Approved guides that are old, failing, reported wrong or contradicted. ${fresh} of ${items.length} guides are fresh.`}
      icon={CalendarClock}
      delay={0.25}
    >
      {message && (
        <p
          className="hf-swap mb-4 flex items-center gap-2 rounded-2xl border border-primary/30 bg-secondary/60 p-3 text-sm font-bold"
          role="status"
        >
          <CheckCircle2 className="h-4 w-4 text-primary" aria-hidden />
          {message}
        </p>
      )}
      {queue.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="Every approved guide is fresh"
          body="Guides show up here when a review is due, they expire, or health findings are open."
        />
      ) : (
        <ul className="space-y-3">
          {queue.map((item) => (
            <li
              key={item.slug}
              className="hf-adm-card rounded-2xl border border-border bg-card/40 p-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill tone={stateTone[item.state]}>
                  {stateLabel[item.state]}
                </StatusPill>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-bold tabular-nums">
                  Score {item.score}/100
                </span>
                <Link
                  className="font-mono text-xs font-bold text-primary hover:underline"
                  href={`/issues/${item.slug}`}
                >
                  {item.slug}
                </Link>
              </div>
              <p className="mt-2 text-sm font-semibold">{item.title}</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                {item.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-muted-foreground">
                {item.reviewDueAt ? (
                  <>
                    Review due{" "}
                    <time dateTime={item.reviewDueAt}>
                      {new Date(item.reviewDueAt).toLocaleDateString()}
                    </time>
                  </>
                ) : (
                  "No review date"
                )}
                {item.lastVerifiedAt && (
                  <>
                    {" · Last reviewed "}
                    <time dateTime={item.lastVerifiedAt}>
                      {new Date(item.lastVerifiedAt).toLocaleDateString()}
                    </time>
                  </>
                )}
              </p>
              {canWrite && (
                <button
                  type="button"
                  className={`${SMALL_PRIMARY} mt-3`}
                  disabled={pending}
                  onClick={() => verify(item.slug)}
                >
                  <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
                  Mark reviewed
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
