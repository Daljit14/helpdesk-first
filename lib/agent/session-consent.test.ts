import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isCapabilityEnabled: vi.fn(),
  isDenylisted: vi.fn(),
  isSnapshotReversible: vi.fn(),
  readTier: vi.fn(),
  listCapabilities: vi.fn(),
  updateSession: vi.fn(),
  writeStep: vi.fn(),
}));

vi.mock("@/lib/autonomy/capabilities/enablement", () => ({
  isCapabilityEnabled: mocks.isCapabilityEnabled,
}));
vi.mock("./denylist", () => ({
  isDenylisted: mocks.isDenylisted,
}));
vi.mock("@/lib/autonomy/ladder", () => ({
  isSnapshotReversible: mocks.isSnapshotReversible,
  readTier: mocks.readTier,
}));
vi.mock("@/lib/autonomy/capabilities/registry", () => ({
  getCapability: vi.fn(),
  listCapabilities: mocks.listCapabilities,
}));
vi.mock("./session", () => ({
  updateSession: mocks.updateSession,
  writeStep: mocks.writeStep,
}));

import {
  autorunCoveredCapabilities,
  grantSessionConsent,
  sessionConsentActive,
} from "./session-consent";
import type { AgentSession } from "./types";

const baseSession: AgentSession = {
  id: "session-1",
  organization_id: "org-1",
  requester_id: "user-1",
  status: "active",
  started_at: new Date().toISOString(),
  ended_at: null,
  last_user_message: null,
  resolution_summary: null,
  escalation_ticket_id: null,
  action_count: 0,
  tool_call_count: 0,
  model_turn_count: 0,
  token_count: 0,
  halt_reason: null,
  security_flag: false,
  updated_at: new Date().toISOString(),
};

const capabilities = [
  {
    id: "device_flush_dns",
    version: 1,
    sideEffects: "internal_write",
  },
  { id: "read_status", version: 1, sideEffects: "read_only" },
  { id: "denylisted", version: 1, sideEffects: "internal_write" },
  { id: "non_reversible", version: 1, sideEffects: "internal_write" },
  { id: "consent_tier", version: 1, sideEffects: "internal_write" },
  { id: "kill_switched", version: 1, sideEffects: "internal_write" },
];

describe("session autorun consent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listCapabilities.mockReturnValue(capabilities);
    mocks.isCapabilityEnabled.mockResolvedValue(true);
    mocks.isDenylisted.mockImplementation((id: string) => id === "denylisted");
    mocks.isSnapshotReversible.mockImplementation(
      (capability: { id: string }) => capability.id === "device_flush_dns"
    );
    mocks.readTier.mockImplementation(
      async (_admin: unknown, _organizationId: string, capabilityId: string) =>
        capabilityId === "device_flush_dns" ? "autorun" : "consent"
    );
    mocks.updateSession.mockResolvedValue(undefined);
    mocks.writeStep.mockResolvedValue(undefined);
  });

  test("covers only enabled, reversible, non-denylisted autorun capabilities", async () => {
    mocks.isCapabilityEnabled.mockImplementation(
      async (_admin: unknown, input: { id: string }) =>
        input.id !== "kill_switched"
    );

    await expect(
      autorunCoveredCapabilities({} as never, "org-1")
    ).resolves.toEqual(["device_flush_dns"]);
    expect(mocks.isCapabilityEnabled).toHaveBeenCalled();
  });

  test.each([
    ["null grant", { autorun_consent_granted_at: null }],
    [
      "revoked",
      {
        autorun_consent_granted_at: new Date().toISOString(),
        autorun_consent_revoked_at: new Date().toISOString(),
        autorun_consent_expires_at: new Date(Date.now() + 60_000).toISOString(),
      },
    ],
    [
      "expired",
      {
        autorun_consent_granted_at: new Date().toISOString(),
        autorun_consent_revoked_at: null,
        autorun_consent_expires_at: new Date(Date.now() - 1_000).toISOString(),
      },
    ],
  ])("is inactive for %s consent", (_label, fields) => {
    expect(
      sessionConsentActive({ ...baseSession, ...fields } as AgentSession)
    ).toBe(false);
  });

  test("clamps grant TTL to four hours and writes the grant step", async () => {
    vi.stubEnv(
      "HELP_DESK_REQUESTER_AGENT_SESSION_CONSENT_TTL_MS",
      String(24 * 60 * 60_000)
    );
    const target = { ...baseSession };
    const before = Date.now();

    const result = await grantSessionConsent({} as never, target, "user-1");

    const grantedAt = Date.parse(target.autorun_consent_granted_at!);
    const expiresAt = Date.parse(target.autorun_consent_expires_at!);
    expect(result.capabilityIds).toEqual(["device_flush_dns"]);
    expect(expiresAt - grantedAt).toBeLessThanOrEqual(4 * 60 * 60_000);
    expect(grantedAt).toBeGreaterThanOrEqual(before);
    expect(mocks.writeStep).toHaveBeenCalledWith(
      {},
      target,
      expect.objectContaining({ kind: "session_consent_granted" })
    );
    vi.unstubAllEnvs();
  });
});
