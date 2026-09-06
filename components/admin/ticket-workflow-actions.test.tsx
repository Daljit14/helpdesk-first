import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  addInternalNote: vi.fn().mockResolvedValue({ success: true }),
  addPublicComment: vi.fn().mockResolvedValue({ success: true }),
  assignTicket: vi.fn().mockResolvedValue({ success: true }),
  changeStatus: vi.fn().mockResolvedValue({ success: true }),
  claimTicket: vi.fn().mockResolvedValue({ success: true }),
  recordAction: vi.fn().mockResolvedValue({ success: true }),
  reopenTicket: vi.fn().mockResolvedValue({ success: true }),
  requestInformation: vi.fn().mockResolvedValue({ success: true }),
  requestVerification: vi.fn().mockResolvedValue({ success: true }),
  submitResolution: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("@/app/actions/admin-workflow", () => mocks);

import { TicketWorkflowActions } from "./ticket-workflow-actions";

const props = {
  ticketId: "00000000-0000-4000-8000-000000000001",
  canClaim: true,
  isAdmin: true,
  members: [
    {
      userId: "agent-1",
      displayName: "Agent One",
      role: "support_agent" as const,
    },
  ],
  status: "Needs Human",
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("TicketWorkflowActions", () => {
  test("shows a validation error without submitting an empty resolution", () => {
    render(<TicketWorkflowActions {...props} />);
    fireEvent.submit(
      screen.getByRole("button", { name: "Submit resolution" }).closest("form")!
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Complete every resolution field."
    );
    expect(mocks.submitResolution).not.toHaveBeenCalled();
  });

  test("sends internal notes to the internal action", () => {
    render(<TicketWorkflowActions {...props} />);
    fireEvent.change(screen.getByLabelText(/Internal note/), {
      target: { value: "Private note" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add internal note" }));
    expect(mocks.addInternalNote).toHaveBeenCalledWith(
      props.ticketId,
      "Private note"
    );
    expect(mocks.addPublicComment).not.toHaveBeenCalled();
  });
});
