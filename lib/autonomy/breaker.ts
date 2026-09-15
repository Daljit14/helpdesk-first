import { createAdminClient } from "@/lib/supabase/admin";
import { getAutonomyLimits } from "./config";

type BreakerAdmin = ReturnType<typeof createAdminClient>;
type BreakerState = "closed" | "open" | "half_open";

export function evaluateBreaker(
  failureTimestamps: number[],
  now: number,
  limits: { threshold: number; windowMs: number }
): { open: boolean; failuresInWindow: number } {
  const cutoff = now - limits.windowMs;
  const failuresInWindow = failureTimestamps.filter(
    (timestamp) => timestamp >= cutoff && timestamp <= now
  ).length;
  return {
    open: failuresInWindow >= limits.threshold,
    failuresInWindow,
  };
}

export async function readBreakerState(
  admin: BreakerAdmin,
  organizationId: string,
  capabilityId: string,
  now: Date
): Promise<{ state: BreakerState; open: boolean; failures: number }> {
  try {
    const result = await admin
      .from("capability_breakers")
      .select("state,failures,cooldown_until")
      .eq("organization_id", organizationId)
      .eq("capability_id", capabilityId)
      .maybeSingle();
    if (result.error) throw result.error;
    const row = result.data as {
      state: BreakerState;
      failures: number;
      cooldown_until: string | null;
    } | null;
    if (!row) return { state: "closed", open: false, failures: 0 };
    if (
      row.state === "open" &&
      row.cooldown_until &&
      new Date(row.cooldown_until).getTime() <= now.getTime()
    ) {
      await admin
        .from("capability_breakers")
        .update({
          state: "half_open",
          updated_at: now.toISOString(),
        })
        .eq("organization_id", organizationId)
        .eq("capability_id", capabilityId);
      return { state: "half_open", open: false, failures: row.failures };
    }
    return {
      state: row.state,
      open: row.state === "open",
      failures: row.failures,
    };
  } catch {
    return {
      state: "open",
      open: true,
      failures: getAutonomyLimits().breakerThreshold,
    };
  }
}

export async function recordBreakerOutcome(
  admin: BreakerAdmin,
  organizationId: string,
  capabilityId: string,
  ok: boolean,
  now: Date
): Promise<void> {
  const limits = getAutonomyLimits();
  try {
    const current = await admin
      .from("capability_breakers")
      .select("state,failures")
      .eq("organization_id", organizationId)
      .eq("capability_id", capabilityId)
      .maybeSingle();
    if (current.error) throw current.error;
    const row = current.data as {
      state: BreakerState;
      failures: number;
    } | null;
    let state: BreakerState = row?.state ?? "closed";
    let failures = row?.failures ?? 0;
    if (ok) {
      if (state === "half_open") {
        state = "closed";
        failures = 0;
      } else if (state === "closed") {
        failures = 0;
      }
    } else if (state === "half_open") {
      state = "open";
      failures = Math.max(1, failures);
    } else {
      failures += 1;
      if (failures >= limits.breakerThreshold) state = "open";
    }
    const values = {
      organization_id: organizationId,
      capability_id: capabilityId,
      state,
      failures,
      opened_at: state === "open" ? now.toISOString() : null,
      cooldown_until:
        state === "open"
          ? new Date(now.getTime() + limits.breakerCooldownMs).toISOString()
          : null,
      updated_at: now.toISOString(),
    };
    if (row) {
      await admin
        .from("capability_breakers")
        .update(values)
        .eq("organization_id", organizationId)
        .eq("capability_id", capabilityId);
    } else {
      await admin.from("capability_breakers").insert(values);
    }
  } catch {
    // Breaker persistence is fail-closed on reads; outcome writes are best effort.
  }
}
