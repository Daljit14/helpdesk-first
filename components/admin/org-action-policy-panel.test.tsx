import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  remove: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("@/app/actions/admin-org-action-policy", () => ({
  saveOrgActionPolicyAction: mocks.save,
  deleteOrgActionPolicyAction: mocks.remove,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

import { OrgActionPolicyPanel } from "./org-action-policy-panel";

const capability = { id: "account_unlock", label: "Unlock the account" };
const rule = {
  id: "00000000-0000-4000-8000-000000000003",
  capabilityId: "account_unlock",
  effect: "allow" as const,
  scopeGroups: ["group-a"],
  maxTier: "consent" as const,
  autorunWindows: [
    {
      days: [1, 2, 3, 4, 5],
      start: "09:00",
      end: "17:00",
      timeZone: "UTC",
    },
  ],
  requireStaffApproval: true,
  note: "Reviewed",
  createdAt: "2026-10-07T12:00:00Z",
};

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.save.mockResolvedValue({ success: true, message: "Policy saved." });
  mocks.remove.mockResolvedValue({ success: true, message: "Policy removed." });
});

describe("OrgActionPolicyPanel", () => {
  test("shows the policy controls and validates time-zone input inline", () => {
    render(<OrgActionPolicyPanel rules={[]} capabilities={[capability]} />);

    expect(
      screen.getByRole("heading", { name: "Add a rule" })
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Capability")).toBeInTheDocument();
    expect(screen.getByLabelText("Effect")).toBeInTheDocument();
    expect(screen.getByLabelText("Maximum tier")).toBeInTheDocument();
    expect(screen.getByLabelText(/Group IDs/)).toBeInTheDocument();
    expect(
      screen.getByLabelText("Always require staff approval")
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Time zone")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Time zone"), {
      target: { value: "Invalid/Zone" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add autorun window" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Choose a valid IANA time zone."
    );
  });

  test("creates a rule with an autorun window and refreshes the list", async () => {
    render(<OrgActionPolicyPanel rules={[]} capabilities={[capability]} />);

    fireEvent.click(screen.getByRole("button", { name: "Add autorun window" }));
    expect(await screen.findByText(/09:00–17:00 Mon–Fri/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Capability"), {
      target: { value: "account_unlock" },
    });
    fireEvent.change(screen.getByLabelText("Maximum tier"), {
      target: { value: "autorun" },
    });
    fireEvent.change(screen.getByLabelText(/Group IDs/), {
      target: { value: "group-a\n group-b " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add rule" }));

    await waitFor(() => expect(mocks.save).toHaveBeenCalledOnce());
    expect(mocks.save).toHaveBeenCalledWith(
      expect.objectContaining({
        capabilityId: "account_unlock",
        scopeGroups: ["group-a", "group-b"],
        maxTier: "autorun",
        autorunWindows: [
          expect.objectContaining({
            days: [1, 2, 3, 4, 5],
            start: "09:00",
            end: "17:00",
          }),
        ],
      })
    );
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
  });

  test("edits and deletes an existing rule", async () => {
    render(<OrgActionPolicyPanel rules={[rule]} capabilities={[capability]} />);

    expect(screen.getAllByText("Unlock the account")).not.toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(
      screen.getByRole("heading", { name: "Edit rule" })
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Group IDs/)).toHaveValue("group-a");
    expect(
      screen.getByLabelText("Always require staff approval")
    ).toBeChecked();

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith(rule.id));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
  });
});
