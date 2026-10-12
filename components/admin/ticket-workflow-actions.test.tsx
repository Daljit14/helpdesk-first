import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
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

  test("omits capture fields from the resolution payload when capture is off", async () => {
    render(<TicketWorkflowActions {...props} />);
    const form = screen
      .getByRole("button", { name: "Submit resolution" })
      .closest("form")!;
    for (const [label, value] of [
      ["Root cause", "DNS cache"],
      ["Actions performed", "Flushed DNS cache"],
      ["Tools used", "Terminal"],
      ["Result", "Internet restored"],
      ["User explanation", "The connection is restored."],
      ["Preventive recommendation", "Restart the router monthly."],
    ]) {
      fireEvent.change(within(form).getByLabelText(label), {
        target: { value },
      });
    }
    fireEvent.submit(form);
    await waitFor(() => expect(mocks.submitResolution).toHaveBeenCalled());
    const [, report] = mocks.submitResolution.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(Object.keys(report)).not.toEqual(
      expect.arrayContaining([
        "reuse",
        "helpedGuideSlug",
        "helpedStep",
        "guideWasWrong",
        "guideIssue",
      ])
    );
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

  test("renders server-provided guide options when capture is enabled", () => {
    render(
      <TicketWorkflowActions
        {...props}
        knowledgeCaptureEnabled
        guideOptions={[{ id: "no-internet", title: "No internet" }]}
      />
    );
    expect(screen.getByRole("option", { name: "No internet" })).toHaveValue(
      "no-internet"
    );
  });
});
