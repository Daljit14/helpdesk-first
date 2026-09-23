import { afterEach, describe, expect, test, vi } from "vitest";
import { countPlaintextRowsDetailed } from "@/lib/security/backfill";
import { computePilotReadiness } from "./pilot-readiness";

vi.mock("@/lib/security/backfill", () => ({
  countPlaintextRowsDetailed: vi.fn(),
}));

function admin(open = false, deviceCount: number | null = 0) {
  type QueryResult = {
    data: never[];
    error: null;
    count: number | null;
  };
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    then: (resolve: (value: QueryResult) => unknown) =>
      Promise.resolve(
        resolve({
          data: open ? ([{ state: "open" }] as never[]) : [],
          error: null,
          count: deviceCount,
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

  test("blocks without throwing when plaintext counting fails", async () => {
    vi.stubEnv("HELP_DESK_GUARDRAILS_ENFORCED", "true");
    vi.stubEnv("HELP_DESK_AUTONOMY_ORG_ALLOWLIST", "org-1");
    vi.stubEnv("HELP_DESK_ORG_ENCRYPTION_ENABLED", "true");
    vi.stubEnv("HELP_DESK_MASTER_KEY", Buffer.alloc(32, 1).toString("base64"));
    vi.mocked(countPlaintextRowsDetailed).mockRejectedValueOnce(
      new Error("42703 missing column")
    );

    const result = await computePilotReadiness(admin(), "org-1");
    const dataProtection = result.items.find(
      (item) => item.label === "Data protection"
    );

    expect(dataProtection).toEqual({
      label: "Data protection",
      ready: false,
      reason: "plaintext count failed: 42703 missing column",
    });
    expect(
      result.items.some((item) => item.label === "Guardrails enforced")
    ).toBe(true);
  });

  test("blocks when the device count is unavailable", async () => {
    vi.stubEnv("HELP_DESK_GUARDRAILS_ENFORCED", "true");
    vi.stubEnv("HELP_DESK_AUTONOMY_ORG_ALLOWLIST", "org-1");
    vi.stubEnv("HELP_DESK_DEVICE_AGENT_ENABLED", "true");

    const result = await computePilotReadiness(admin(false, null), "org-1");
    expect(result.items.find((item) => item.label === "Device agent")).toEqual({
      label: "Device agent",
      ready: false,
      reason:
        "active device count unavailable (apply supabase/device-agent.sql) " +
        "(execution: shadow)",
    });
  });

  test("reports shadow execution when the device agent is disabled", async () => {
    vi.stubEnv("HELP_DESK_GUARDRAILS_ENFORCED", "true");
    vi.stubEnv("HELP_DESK_AUTONOMY_ORG_ALLOWLIST", "org-1");

    const result = await computePilotReadiness(admin(), "org-1");
    expect(result.items.find((item) => item.label === "Device agent")).toEqual({
      label: "Device agent",
      ready: true,
      reason: "disabled (execution: shadow)",
    });
  });

  test("reports live execution when device execution is enabled", async () => {
    vi.stubEnv("HELP_DESK_GUARDRAILS_ENFORCED", "true");
    vi.stubEnv("HELP_DESK_AUTONOMY_ORG_ALLOWLIST", "org-1");
    vi.stubEnv("HELP_DESK_DEVICE_AGENT_ENABLED", "true");
    vi.stubEnv("HELP_DESK_DEVICE_EXECUTION_ENABLED", "true");

    const result = await computePilotReadiness(admin(), "org-1");
    expect(result.items.find((item) => item.label === "Device agent")).toEqual({
      label: "Device agent",
      ready: false,
      reason: "device execution is not available before B3 (execution: live)",
    });
  });
});
