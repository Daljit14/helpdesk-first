import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { TicketUpdateForm } from "./ticket-update-form";

vi.mock("@/app/actions/admin-tickets", () => ({
  updateTicket: vi.fn(),
}));

describe("TicketUpdateForm", () => {
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
});
