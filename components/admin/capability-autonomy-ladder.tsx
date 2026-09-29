"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Layers, TrendingUp } from "lucide-react";
import { setCapabilityTierAction } from "@/app/actions/admin-autonomy-ladder";
import type { LadderCapability, LadderRow } from "@/lib/autonomy/ladder";
import {
  EmptyState,
  StatusPill,
  type StatTone,
} from "@/components/admin/ui/admin-kit";

type SerializableLadderRow = Omit<LadderRow, "capability"> & {
  capability: LadderCapability;
};

const tones: Record<string, StatTone> = {
  disabled: "neutral",
  shadow: "info",
  consent: "warn",
  autorun: "good",
};

const FIELD =
  "h-10 min-w-0 rounded-xl border border-border bg-card px-3 text-sm font-semibold text-foreground shadow-sm transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60";
const OUTLINE_BUTTON =
  "inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-extrabold text-foreground shadow-sm transition-all hover:-translate-y-px hover:border-primary/40 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0";
const PRIMARY_BUTTON =
  "inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-extrabold text-primary-foreground shadow-sm transition-transform hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0";

export function CapabilityAutonomyLadder({
  rows,
}: {
  rows: SerializableLadderRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [drafts, setDrafts] = useState<
    Record<string, { tier: string; reason: string }>
  >({});
  const updateDraft = (
    id: string,
    values: Partial<{ tier: string; reason: string }>
  ) =>
    setDrafts((current) => ({
      ...current,
      [id]: {
        tier: current[id]?.tier ?? "consent",
        reason: current[id]?.reason ?? "",
        ...values,
      },
    }));
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {rows.map((row, index) => {
        const draft = drafts[row.capability.id] ?? {
          tier: row.tier,
          reason: "",
        };
        const percent = row.live_runs
          ? Math.round((row.verified_successes / row.live_runs) * 100)
          : 0;
        return (
          <article
            className="hf-adm-card hf-rise rounded-2xl border border-border bg-card/60 p-4"
            style={{ animationDelay: `${Math.min(index, 12) * 0.05}s` }}
            key={row.capability.id}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-extrabold">{row.capability.description}</h3>
                <p className="font-mono text-xs text-muted-foreground">
                  {row.capability.id}
                </p>
              </div>
              <StatusPill
                tone={tones[row.tier] ?? "neutral"}
                pulse={row.tier === "autorun"}
              >
                {row.tier}
              </StatusPill>
            </div>
            <div className="mt-3 space-y-1.5">
              <div className="flex justify-between text-xs font-bold text-muted-foreground">
                <span>Verified: {percent}%</span>
                <span>Live runs: {row.live_runs}</span>
              </div>
              <span className="block h-2 overflow-hidden rounded-full bg-muted">
                <span
                  className="hf-adm-grow block h-full rounded-full bg-status-success"
                  style={{
                    width: `${percent}%`,
                    animationDelay: `${0.2 + Math.min(index, 12) * 0.05}s`,
                  }}
                />
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5 text-xs font-bold">
              <span
                className={`rounded-full px-2.5 py-1 ${
                  row.rollback_failures > 0
                    ? "bg-status-warning/15 text-status-warning"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                Rollback failures: {row.rollback_failures}
              </span>
              <span
                className={`rounded-full px-2.5 py-1 ${
                  row.security_incidents > 0
                    ? "bg-status-danger/15 text-status-danger"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                Security incidents: {row.security_incidents}
              </span>
              <span className="rounded-full bg-muted px-2.5 py-1 text-muted-foreground">
                Reversible: {row.reversible ? "yes" : "no"}
              </span>
            </div>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <select
                aria-label={`Tier for ${row.capability.id}`}
                value={draft.tier}
                disabled={pending}
                onChange={(event) =>
                  updateDraft(row.capability.id, { tier: event.target.value })
                }
                className={FIELD}
              >
                {(["disabled", "shadow", "consent"] as const).map((tier) => (
                  <option key={tier}>{tier}</option>
                ))}
              </select>
              <input
                aria-label={`Reason for ${row.capability.id}`}
                value={draft.reason}
                onChange={(event) =>
                  updateDraft(row.capability.id, { reason: event.target.value })
                }
                placeholder="Reason (required)"
                className={`${FIELD} flex-1`}
              />
              <button
                type="button"
                disabled={pending || draft.reason.trim().length < 3}
                onClick={() =>
                  startTransition(async () => {
                    const result = await setCapabilityTierAction({
                      capabilityId: row.capability.id,
                      toTier: draft.tier,
                      reason: draft.reason,
                    });
                    if (!("error" in result)) router.refresh();
                  })
                }
                className={OUTLINE_BUTTON}
              >
                Save
              </button>
            </div>
            <button
              type="button"
              disabled={pending || !row.promotion.eligible}
              title={row.promotion.reasons.join(" ")}
              onClick={() =>
                startTransition(async () => {
                  const result = await setCapabilityTierAction({
                    capabilityId: row.capability.id,
                    toTier: "autorun",
                    reason: draft.reason || "Promoted after ladder review.",
                  });
                  if (!("error" in result)) router.refresh();
                })
              }
              className={`${PRIMARY_BUTTON} mt-3`}
            >
              <TrendingUp className="h-4 w-4" aria-hidden />
              Promote to autorun
            </button>
            {!row.promotion.eligible && (
              <ul className="mt-2 list-disc pl-5 text-xs text-muted-foreground">
                {row.promotion.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            )}
          </article>
        );
      })}
      {rows.length === 0 && (
        <div className="xl:col-span-2">
          <EmptyState
            icon={Layers}
            title="No capabilities on the ladder"
            body="No enabled write capabilities are configured."
          />
        </div>
      )}
    </div>
  );
}
