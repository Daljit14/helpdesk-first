"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setCapabilityTierAction } from "@/app/actions/admin-autonomy-ladder";
import type { LadderCapability, LadderRow } from "@/lib/autonomy/ladder";

type SerializableLadderRow = Omit<LadderRow, "capability"> & {
  capability: LadderCapability;
};

const tones = {
  disabled: "border-muted-foreground/40 text-muted-foreground",
  shadow: "border-violet-500/50 text-violet-700 dark:text-violet-300",
  consent: "border-amber-500/50 text-amber-700 dark:text-amber-300",
  autorun: "border-emerald-500/50 text-emerald-700 dark:text-emerald-300",
} as const;

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
    <div className="space-y-4">
      {rows.map((row) => {
        const draft = drafts[row.capability.id] ?? {
          tier: row.tier,
          reason: "",
        };
        const percent = row.live_runs
          ? Math.round((row.verified_successes / row.live_runs) * 100)
          : 0;
        return (
          <article
            className="glass-strong rounded-2xl p-4"
            key={row.capability.id}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold">{row.capability.description}</h3>
                <p className="text-xs text-muted-foreground">
                  {row.capability.id}
                </p>
              </div>
              <span
                className={`rounded-full border px-2 py-1 text-xs font-medium ${tones[row.tier]}`}
              >
                {row.tier}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground sm:grid-cols-5">
              <span>Live runs: {row.live_runs}</span>
              <span>Verified: {percent}%</span>
              <span>Rollback failures: {row.rollback_failures}</span>
              <span>Security incidents: {row.security_incidents}</span>
              <span>Reversible: {row.reversible ? "yes" : "no"}</span>
            </div>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <select
                aria-label={`Tier for ${row.capability.id}`}
                value={draft.tier}
                disabled={pending}
                onChange={(event) =>
                  updateDraft(row.capability.id, { tier: event.target.value })
                }
                className="rounded-lg border bg-background px-2 py-2 text-sm"
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
                className="min-w-0 flex-1 rounded-lg border bg-background px-3 py-2 text-sm"
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
                className="rounded-lg border px-3 py-2 text-sm"
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
              className="mt-3 rounded-lg bg-foreground px-3 py-2 text-sm text-background disabled:cursor-not-allowed disabled:opacity-40"
            >
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
        <p className="text-sm text-muted-foreground">
          No enabled write capabilities are configured.
        </p>
      )}
    </div>
  );
}
