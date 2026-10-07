import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("@/app/actions/admin-caller-verification", () => ({
  decideTechnicianApproval: vi.fn(),
  recordCallerVerification: vi.fn(),
}));

import { CallerVerificationPanel } from "./caller-verification-panel";

afterEach(() => cleanup());

describe("CallerVerificationPanel", () => {
  test("shows the directory callback number, required manager tick, and safety note", () => {
    render(
      <CallerVerificationPanel
        ticketId="ticket-1"
        directoryPhone="+1 555 0100"
        managerName="Jordan Lee"
        privileged
        verifiedUntil={null}
        verificationRows={[]}
        pendingApprovals={[]}
      />
    );

    expect(screen.getByText("+1 555 0100")).toBeInTheDocument();
    expect(
      screen.getByText("Call back only on this number.")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Manager confirmed (Jordan Lee) — required",
      })
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Never accept security questions, employee ID, date of birth or details from past tickets as proof."
      )
    ).toBeInTheDocument();
  });

  test("shows no-number guidance and disables account approval before verification", () => {
    render(
      <CallerVerificationPanel
        ticketId="ticket-1"
        directoryPhone={null}
        managerName={null}
        privileged={false}
        verifiedUntil={null}
        verificationRows={[]}
        pendingApprovals={[
          {
            id: "approval-1",
            capabilityId: "send_password_reset_link",
            accountAction: true,
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
          },
          {
            id: "approval-2",
            capabilityId: "search_approved_knowledge",
            accountAction: false,
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
          },
        ]}
      />
    );

    expect(
      screen.getByText(
        "No directory number. Don't use a number from the ticket — escalate instead."
      )
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "I called back on the number in the directory",
      })
    ).toBeDisabled();
    expect(screen.getByText("Not verified")).toBeInTheDocument();
    const approveButtons = screen.getAllByRole("button", { name: "Approve" });
    expect(approveButtons[0]).toBeDisabled();
    expect(approveButtons[1]).toBeEnabled();
  });
});
