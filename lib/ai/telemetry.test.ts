import { afterEach, describe, expect, test, vi } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAgentModelCall } from "./telemetry";

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

afterEach(() => vi.resetAllMocks());

describe("recordAgentModelCall", () => {
  test("records Anthropic usage, cache, cost, and route fields", () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(createAdminClient).mockReturnValue({
      from: () => ({ insert }),
    } as never);

    recordAgentModelCall({
      organizationId: "org-1",
      model: "claude-sonnet-5",
      route: "agent_planner",
      usage: {
        inputTokens: 10,
        outputTokens: 20,
        cacheCreationInputTokens: 30,
        cacheReadInputTokens: 40,
      },
      costMicros: 150,
    });

    expect(insert).toHaveBeenCalledWith({
      organization_id: "org-1",
      provider: "anthropic",
      model: "claude-sonnet-5",
      outcome: "ok",
      input_tokens: 10,
      output_tokens: 20,
      cache_read_tokens: 40,
      cache_write_tokens: 30,
      cost_micros: 150,
      route: "agent_planner",
    });
  });

  test("skips non-Anthropic model IDs", () => {
    const admin = vi.mocked(createAdminClient);
    admin.mockReset();

    recordAgentModelCall({
      organizationId: "org-1",
      model: "other-model",
      route: "agent_default",
      usage: {
        inputTokens: 1,
        outputTokens: 1,
        cacheCreationInputTokens: 0,
        cacheReadInputTokens: 0,
      },
      costMicros: 1,
    });

    expect(admin).not.toHaveBeenCalled();
  });
});
