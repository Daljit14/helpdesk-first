import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TicketInvestigation } from "./ticket-investigation";
import type {
  InvestigationRow,
  InvestigationTurnRow,
} from "@/lib/investigation/types";

const investigation = {
  ticket_id: "ticket",
  organization_id: null,
  user_id: "user",
  context: {},
  hypotheses: [],
  excluded_steps: [],
  status: "open",
  escalation_package: null,
  escalation_package_at: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
} as unknown as InvestigationRow;

describe("TicketInvestigation", () => {
  it("renders resolved instruction text for persisted step references", () => {
    const turn = {
      id: 1,
      ticket_id: "ticket",
      organization_id: null,
      decision: "match",
      confidence: 0.9,
      matched_issue_slug: "lost-stolen-device",
      question_ids: [],
      hypotheses: [],
      next_steps: Array.from({ length: 5 }, (_, stepIndex) => ({
        guideSlug: "lost-stolen-device",
        stepIndex,
        risk: "safe",
      })),
      withheld_steps: [],
      provider: "test",
      model: null,
      created_at: "2026-01-01T00:00:00.000Z",
    } as unknown as InvestigationTurnRow;

    render(
      <TicketInvestigation investigation={investigation} turns={[turn]} />
    );

    expect(
      screen.getByText(/Report the loss to your IT or security team/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Instruction unavailable for this step/)
    ).toBeInTheDocument();
  });
});
