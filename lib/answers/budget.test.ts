import type { createAdminClient } from "@/lib/supabase/admin";
import { describe, expect, test, vi } from "vitest";
import { consumeAnswerEngineBudget } from "./budget";

function adminWithRpc(rpc: ReturnType<typeof vi.fn>) {
  return { rpc } as unknown as ReturnType<typeof createAdminClient>;
}

describe("answer-engine budget reservations", () => {
  test("reserves exact organization and global units through the RPC", async () => {
    const rpc = vi.fn(async () => ({ data: true, error: null }));
    const result = await consumeAnswerEngineBudget(adminWithRpc(rpc), {
      organizationId: "org-1",
      units: 1,
      organizationLimit: 20,
      globalLimit: 1000,
    });
    expect(result).toBe(true);
    expect(rpc).toHaveBeenCalledWith("answer_engine_consume_budget", {
      p_organization_id: "org-1",
      p_units: 1,
      p_org_limit: 20,
      p_global_limit: 1000,
    });
  });

  test("fails closed on exhaustion, RPC errors, zero global cap, and throws", async () => {
    const exhausted = vi.fn(async () => ({ data: false, error: null }));
    const errored = vi.fn(async () => ({
      data: true,
      error: { message: "reservation unavailable" },
    }));
    const throws = vi.fn(async () => {
      throw new Error("reservation unavailable");
    });
    expect(
      await consumeAnswerEngineBudget(adminWithRpc(exhausted), {
        organizationId: null,
        units: 1,
        organizationLimit: 0,
        globalLimit: 10,
      })
    ).toBe(false);
    expect(
      await consumeAnswerEngineBudget(adminWithRpc(errored), {
        organizationId: null,
        units: 1,
        organizationLimit: 0,
        globalLimit: 10,
      })
    ).toBe(false);
    expect(
      await consumeAnswerEngineBudget(adminWithRpc(throws), {
        organizationId: null,
        units: 1,
        organizationLimit: 0,
        globalLimit: 10,
      })
    ).toBe(false);
    expect(
      await consumeAnswerEngineBudget(adminWithRpc(vi.fn()), {
        organizationId: null,
        units: 1,
        organizationLimit: 0,
        globalLimit: 0,
      })
    ).toBe(false);
  });
});
