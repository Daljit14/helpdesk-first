import { describe, expect, test } from "vitest";
import { z } from "zod";
import {
  CAPABILITIES,
  capabilityChecksum,
  capabilityEnvFlag,
  getCapability,
  validateCapabilityInput,
  validateRegistry,
} from "./registry";
import type { CapabilityDefinition } from "./types";

const ticketId = "00000000-0000-4000-8000-000000000001";

function validInput(id: string): Record<string, unknown> {
  if (id === "search_approved_knowledge") {
    return { ticketId, query: "wifi" };
  }
  if (
    id === "resend_ticket_notification" ||
    id === "retry_failed_notification"
  ) {
    return { ticketId, notificationId: ticketId };
  }
  if (id === "validate_attachment_scan_status") {
    return { ticketId, attachmentId: ticketId };
  }
  if (id === "ask_diagnostic_question") {
    return { ticketId, questionId: "which-platform" };
  }
  if (id === "route_to_department") {
    return { ticketId, department: "Ticket Queue" };
  }
  if (id === "escalate_with_evidence") {
    return { ticketId, reason: "Needs human review" };
  }
  if (id === "verify_group_access" || id === "grant_group_access") {
    return { ticketId, groupId: "group-1" };
  }
  return { ticketId };
}

function fixture(
  changes: Partial<CapabilityDefinition> = {}
): CapabilityDefinition {
  return {
    ...CAPABILITIES[0],
    ...changes,
  };
}

describe("approved capability registry", () => {
  test("contains all unique versioned definitions", () => {
    expect(CAPABILITIES.length).toBeGreaterThanOrEqual(11);
    expect(
      new Set(
        CAPABILITIES.map(
          (definition) => `${definition.id}:${definition.version}`
        )
      )
    ).toHaveLength(CAPABILITIES.length);
    expect(validateRegistry(CAPABILITIES)).toEqual([]);
  });

  test("requires every input schema to reject unknown keys", () => {
    for (const definition of CAPABILITIES) {
      const input = validInput(definition.id);
      expect(definition.inputSchema.safeParse(input).success).toBe(true);
      expect(
        definition.inputSchema.safeParse({ ...input, extra: 1 }).success
      ).toBe(false);
    }
  });

  test.each([
    ["duplicate id/version", () => [CAPABILITIES[0], CAPABILITIES[0]]],
    [
      "prohibited description",
      () => [fixture({ description: "Run powershell to repair the ticket." })],
    ],
    [
      "non-strict schema",
      () => [
        fixture({
          inputSchema: z.object({ ticketId: z.uuid() }),
        }),
      ],
    ],
    ["denied risk", () => [fixture({ riskLevel: "denied" as never })]],
    ["specialist risk", () => [fixture({ riskLevel: "specialist" as never })]],
    ["runtime below minimum", () => [fixture({ maxRuntimeMs: 100 })]],
    ["runtime above maximum", () => [fixture({ maxRuntimeMs: 700000 })]],
    ["past review date", () => [fixture({ reviewDate: "2020-01-01" })]],
  ])("%s produces a validation error", (_name, makeDefinitions) => {
    expect(validateRegistry(makeDefinitions())).not.toEqual([]);
  });

  test("validates capability inputs and unknown capabilities", () => {
    expect(
      validateCapabilityInput("collect_platform_context", 1, {
        ticketId: "not-a-uuid",
      })
    ).toMatchObject({ ok: false });
    expect(
      validateCapabilityInput("search_approved_knowledge", 1, {
        ticketId,
        query: "x".repeat(201),
      })
    ).toMatchObject({ ok: false });
    expect(
      validateCapabilityInput("collect_platform_context", 1, { ticketId })
    ).toEqual({ ok: true, value: { ticketId } });
    expect(validateCapabilityInput("nope", 1, {})).toEqual({
      ok: false,
      issues: ["unknown capability"],
    });
  });

  test("creates deterministic checksums that change with the definition", () => {
    const checksum = capabilityChecksum(CAPABILITIES[0]);
    expect(capabilityChecksum(CAPABILITIES[0])).toBe(checksum);
    expect(
      capabilityChecksum({
        ...CAPABILITIES[0],
        description: `${CAPABILITIES[0].description} Updated`,
      })
    ).not.toBe(checksum);
  });

  test("resolves capabilities and environment switches", () => {
    expect(getCapability("nope", 1)).toBeNull();
    expect(capabilityEnvFlag("route_to_department")).toBe(
      "HELP_DESK_CAP_ROUTE_TO_DEPARTMENT_ENABLED"
    );
  });
});
