import { afterEach, describe, expect, test, vi } from "vitest";
import { computePilotReadiness } from "./pilot-readiness";

function admin(open = false) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    then: (resolve: (value: { data: never[]; error: null }) => unknown) =>
      Promise.resolve(
        resolve({
          data: open ? ([{ state: "open" }] as never[]) : [],
          error: null,
        })
      ),
  };
  return {
    from: vi.fn(() => builder),
  } as unknown as Parameters<typeof computePilotReadiness>[0];
}

afterEach(() => vi.unstubAllEnvs());

describe("pilot readiness", () => {
  test("fails closed when the organization is not allow-listed", async () => {
    vi.stubEnv("HELP_DESK_GUARDRAILS_ENFORCED", "true");
    vi.stubEnv("HELP_DESK_AUTONOMY_ORG_ALLOWLIST", "org-2");
    const result = await computePilotReadiness(admin(), "org-1");
    expect(result.ready).toBe(false);
    expect(result.verdict).toMatch(/Not ready/);
    expect(
      result.items.find((item) => item.label === "Organization allow-list")
        ?.ready
    ).toBe(false);
  });

  test("reports execution flag as informational", async () => {
    vi.stubEnv("HELP_DESK_GUARDRAILS_ENFORCED", "true");
    vi.stubEnv("HELP_DESK_AUTONOMY_ORG_ALLOWLIST", "org-1");
    vi.stubEnv("HELP_DESK_AUTONOMOUS_EXECUTION_ENABLED", "true");
    const result = await computePilotReadiness(admin(), "org-1");
    expect(result.executionEnabled).toBe(true);
  });

  test("fails readiness when any capability breaker is open", async () => {
    vi.stubEnv("HELP_DESK_GUARDRAILS_ENFORCED", "true");
    vi.stubEnv("HELP_DESK_AUTONOMY_ORG_ALLOWLIST", "org-1");
    const result = await computePilotReadiness(admin(true), "org-1");
    expect(
      result.items.find((item) => item.label === "Breaker closed")
    ).toMatchObject({
      ready: false,
    });
  });

  test("requires both alert credentials", async () => {
    vi.stubEnv("HELP_DESK_GUARDRAILS_ENFORCED", "true");
    vi.stubEnv("HELP_DESK_AUTONOMY_ORG_ALLOWLIST", "org-1");
    vi.stubEnv("BREVO_API_KEY", "key");
    delete process.env.NOTIFICATIONS_FROM_EMAIL;
    const missingSender = await computePilotReadiness(admin(), "org-1");
    expect(
      missingSender.items.find(
        (item) => item.label === "Alert email configured"
      )?.ready
    ).toBe(false);

    vi.stubEnv("NOTIFICATIONS_FROM_EMAIL", "alerts@example.com");
    const configured = await computePilotReadiness(admin(), "org-1");
    expect(
      configured.items.find((item) => item.label === "Alert email configured")
        ?.ready
    ).toBe(true);
  });
});
