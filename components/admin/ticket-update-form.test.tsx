import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { TicketUpdateForm } from "./ticket-update-form";

let actionState: { success?: string } | null = null;

vi.mock("@/app/actions/admin-tickets", () => ({
  updateTicket: vi.fn(),
}));

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return {
    ...actual,
    useActionState: vi.fn(() => [actionState, vi.fn(), false]),
  };
});

describe("TicketUpdateForm", () => {
  afterEach(() => {
    cleanup();
    actionState = null;
  });

  test("renders current values and labelled controls", () => {
    render(
      <TicketUpdateForm
        ticketId="00000000-0000-4000-8000-000000000001"
        status="In Progress"
        priority="High"
        assignedAgent="Agent One"
      />
    );
    expect(screen.getByLabelText("Status")).toHaveValue("In Progress");
    expect(screen.getByLabelText("Priority")).toHaveValue("High");
    expect(screen.getByLabelText("Assigned agent")).toHaveValue("Agent One");
    expect(
      screen.getByRole("button", { name: "Save changes" })
    ).toBeInTheDocument();
  });

  test("keeps selected values after a successful action state", () => {
    const view = render(
      <TicketUpdateForm
        ticketId="00000000-0000-4000-8000-000000000001"
        status="New"
        priority="Normal"
        assignedAgent=""
      />
    );

    fireEvent.change(screen.getByLabelText("Status"), {
      target: { value: "Resolved" },
    });
    fireEvent.change(screen.getByLabelText("Priority"), {
      target: { value: "Urgent" },
    });
    fireEvent.change(screen.getByLabelText("Assigned agent"), {
      target: { value: "Agent Two" },
    });
    actionState = { success: "Ticket updated." };
    act(() => {
      view.rerender(
        <TicketUpdateForm
          ticketId="00000000-0000-4000-8000-000000000001"
          status="New"
          priority="Normal"
          assignedAgent=""
        />
      );
    });

    expect(screen.getByLabelText("Status")).toHaveValue("Resolved");
    expect(screen.getByLabelText("Priority")).toHaveValue("Urgent");
    expect(screen.getByLabelText("Assigned agent")).toHaveValue("Agent Two");
    expect(screen.getByRole("status")).toHaveTextContent("Ticket updated.");
  });
});
