import { describe, expect, test } from "vitest";
import { getCapability } from "../capabilities/registry";
import { validatePlannerOutput } from "./planner-output";

const ticketId = "00000000-0000-4000-8000-000000000001";
const capability = getCapability("search_approved_knowledge", 1);

const valid = {
  ticketId,
  diagnosis: {
    summary: "A safe approved search can help.",
    confidence: 0.9,
    evidenceIds: ["ticket"],
  },
  decision: "propose_action" as const,
  capability: {
    id: "search_approved_knowledge",
    version: 1,
    parameters: { ticketId, query: "display issue" },
  },
  verificationMethod: capability?.verification,
};

function check(value: unknown, context = {}) {
  return validatePlannerOutput(value, {
    runTicketId: ticketId,
    evidenceIds: ["ticket"],
    capability,
    orgEnabled: true,
    ...context,
  });
}

describe("planner output guardrails", () => {
  test("accepts a valid no_action decision", () => {
    expect(
      check({
        ticketId,
        diagnosis: valid.diagnosis,
        decision: "no_action",
        reason: "No approved action is needed.",
      })
    ).toMatchObject({ ok: true });
  });

  test.each([
    ["shell", "run powershell"],
    ["SQL", "select password from users"],
    ["URL", "https://example.com"],
    ["code", "Function('return 1')"],
  ])("rejects executable content nested in parameters (%s)", (_name, value) => {
    expect(
      check({
        ...valid,
        capability: { ...valid.capability, parameters: { value } },
      })
    ).toMatchObject({ ok: false, code: "executable_content" });
  });

  test.each([
    ["ticket_mismatch", { ticketId: "00000000-0000-4000-8000-000000000002" }],
    [
      "evidence_unknown",
      { diagnosis: { ...valid.diagnosis, evidenceIds: ["missing"] } },
    ],
    ["verification_unsupported", { verificationMethod: "unsupported" }],
  ])("rejects %s", (code, change) => {
    expect(check({ ...valid, ...change })).toMatchObject({ ok: false, code });
  });

  test("rejects unknown and disabled capabilities and invalid versions", () => {
    expect(
      check({
        ...valid,
        capability: { ...valid.capability, id: "unknown_capability" },
      })
    ).toMatchObject({ ok: false, code: "capability_unknown" });
    expect(
      check(
        { ...valid, capability: { ...valid.capability, version: 2 } },
        { capabilityIdKnown: true }
      )
    ).toMatchObject({ ok: false, code: "capability_version_invalid" });
    expect(check(valid, { orgEnabled: false })).toMatchObject({
      ok: false,
      code: "capability_disabled",
    });
  });

  test("rejects strict extra fields at each schema level", () => {
    expect(check({ ...valid, extra: true })).toMatchObject({
      ok: false,
      code: "schema_invalid",
    });
    expect(
      check({
        ...valid,
        diagnosis: { ...valid.diagnosis, extra: true },
      })
    ).toMatchObject({ ok: false, code: "schema_invalid" });
    expect(
      check({
        ...valid,
        capability: { ...valid.capability, extra: true },
      })
    ).toMatchObject({ ok: false, code: "schema_invalid" });
  });
});
