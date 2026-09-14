import { beforeEach, describe, expect, test, vi } from "vitest";
import type { EvidenceInputs } from "./build";

const mocks = vi.hoisted(() => ({
  loadEvidenceInputs: vi.fn(),
}));

vi.mock("./load", () => ({
  loadEvidenceInputs: mocks.loadEvidenceInputs,
}));

import { snapshotEvidence } from "./snapshot";

const inputs: EvidenceInputs = {
  ticket: {
    message: "No internet",
    platform: "Windows",
    issue_id: "no-internet",
    diagnostic_answers: [],
    user_id: "user-1",
  },
  investigation: null,
  turns: [],
  stepOutcomes: [],
  attachments: [],
};

function admin() {
  const query = {
    update: vi.fn(() => query),
    insert: vi.fn(() => query),
    eq: vi.fn(() => query),
    then: (resolve: (value: unknown) => unknown) =>
      Promise.resolve({ data: null, error: null }).then(resolve),
  };
  return { from: vi.fn(() => query), query };
}

describe("snapshotEvidence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadEvidenceInputs.mockResolvedValue(inputs);
  });

  test("returns null and performs no query when the flag is off", async () => {
    vi.stubEnv("HELP_DESK_EVIDENCE_ENGINE_ENABLED", "false");
    const client = admin();
    expect(await snapshotEvidence(client as never, "ticket-1", "org-1")).toBe(
      null
    );
    expect(client.from).not.toHaveBeenCalled();
  });

  test("inserts a new evidence snapshot with organization scope", async () => {
    vi.stubEnv("HELP_DESK_EVIDENCE_ENGINE_ENABLED", "true");
    const client = admin();
    const result = await snapshotEvidence(client as never, "ticket-1", "org-1");
    expect(result?.version).toBe(1);
    expect(client.query.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        ticket_id: "ticket-1",
        organization_id: "org-1",
        user_id: "user-1",
        evidence: expect.any(Object),
      })
    );
  });

  test("updates an existing evidence snapshot with organization scope", async () => {
    vi.stubEnv("HELP_DESK_EVIDENCE_ENGINE_ENABLED", "true");
    mocks.loadEvidenceInputs.mockResolvedValue({
      ...inputs,
      investigation: {
        ticket_id: "ticket-1",
        organization_id: "org-1",
        user_id: "user-1",
        context: {},
        hypotheses: [],
        excluded_steps: [],
        status: "open",
        escalation_package: null,
        escalation_package_at: null,
        created_at: "2026-01-01",
        updated_at: "2026-01-01",
      },
    });
    const client = admin();
    await snapshotEvidence(client as never, "ticket-1", "org-1");
    expect(client.query.update).toHaveBeenCalledWith(
      expect.objectContaining({ evidence: expect.any(Object) })
    );
    expect(client.query.eq).toHaveBeenCalledWith("organization_id", "org-1");
  });
});
