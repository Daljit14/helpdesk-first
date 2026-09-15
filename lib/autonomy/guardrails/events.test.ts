import { beforeEach, describe, expect, test, vi } from "vitest";
import type { createAdminClient } from "@/lib/supabase/admin";
import type { ResolutionRun } from "../orchestrator";

const writeRunEvent = vi.hoisted(() => vi.fn());

vi.mock("../orchestrator", () => ({ writeRunEvent }));

import { writeGuardrailEvent } from "./events";

describe("guardrail events", () => {
  beforeEach(() => vi.clearAllMocks());

  test("writes versioned, reasoned, redacted details", async () => {
    await writeGuardrailEvent({} as ReturnType<typeof createAdminClient>, {
      run: {
        id: "run-1",
        organization_id: "org-1",
        ticket_id: "ticket-1",
      } as ResolutionRun,
      kind: "guardrail.output_rejected",
      reasonCode: "unsafe",
      actor: "ai",
      detail: {
        password: "password=super-secret",
        jwt: "token=eyJhbGciOiJIUzI1NiJ9.payload.signature",
        card: "4111 1111 1111 1111",
      },
    });
    const detail = writeRunEvent.mock.calls[0]?.[1].detail as Record<
      string,
      unknown
    >;
    expect(detail).toMatchObject({
      guardrailVersion: expect.any(String),
      policyVersion: expect.any(String),
      reasonCode: "unsafe",
    });
    expect(JSON.stringify(detail)).not.toContain("super-secret");
    expect(JSON.stringify(detail)).not.toContain("4111 1111 1111 1111");
  });
});
