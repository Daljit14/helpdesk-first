import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  upsert: vi.fn(),
}));

vi.mock("@/app/actions/admin-devices", () => ({
  upsertDeviceConsentPolicyAction: mocks.upsert,
}));

import { DeviceConsentPolicyForm } from "./device-consent-policy-form";

describe("DeviceConsentPolicyForm", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  test("reverts the checkbox when saving the policy fails", async () => {
    mocks.upsert.mockResolvedValue({
      error: "Too many changes. Try again in a minute.",
    });
    render(
      <DeviceConsentPolicyForm
        deviceClass="managed"
        category="network"
        enabled={false}
      />
    );

    const checkbox = screen.getByRole("checkbox") as HTMLInputElement;
    fireEvent.click(checkbox);

    await waitFor(() => expect(checkbox.checked).toBe(false));
    expect(
      screen.getByText("Too many changes. Try again in a minute.")
    ).toBeInTheDocument();
  });

  test("keeps the new checkbox state after a successful save", async () => {
    mocks.upsert.mockResolvedValue({ success: true });
    render(
      <DeviceConsentPolicyForm
        deviceClass="managed"
        category="network"
        enabled={false}
      />
    );

    const checkbox = screen.getByRole("checkbox") as HTMLInputElement;
    fireEvent.click(checkbox);

    await waitFor(() => expect(checkbox.checked).toBe(true));
    expect(screen.getByText("Saved")).toBeInTheDocument();
  });
});
