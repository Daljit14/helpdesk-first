import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("@/app/actions/admin-org-environment", () => ({
  saveOrgEnvironmentAction: vi.fn(),
  confirmOrgEnvironmentAction: vi.fn(),
}));

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return {
    ...actual,
    useActionState: vi.fn(() => [null, vi.fn(), false]),
  };
});

import { OrgEnvironmentPanel } from "./org-environment-panel";

const suggestions = {
  platforms: [
    { platform: "Windows" as const, count: 6 },
    { platform: "Mac" as const, count: 2 },
  ],
  printers: ["Office printer"],
  deviceCount: 8,
};

describe("OrgEnvironmentPanel", () => {
  afterEach(() => cleanup());

  test("fills inventory suggestions into the form without saving", () => {
    render(
      <OrgEnvironmentPanel
        profile={null}
        confirmedBy={null}
        idpEnforcesMfa={false}
        suggestions={suggestions}
      />
    );

    expect(
      screen.getByText(
        "From 8 enrolled devices: Windows (6), Mac (2) · printers: Office printer"
      )
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Use suggestions" }));

    const platforms = screen.getByLabelText(
      "Standard platforms"
    ) as HTMLSelectElement;
    expect(Array.from(platforms.selectedOptions, ({ value }) => value)).toEqual(
      ["Windows", "Mac"]
    );
    expect(screen.getByLabelText(/Printer fleet/)).toHaveValue(
      "Office printer"
    );
    expect(
      screen.getByRole("button", { name: "Save draft" })
    ).toBeInTheDocument();
  });

  test("shows confirmed status, prescribed copy, and the confirm action for a draft", () => {
    render(
      <OrgEnvironmentPanel
        profile={{
          vpnClient: null,
          mdmProvider: null,
          emailStack: "microsoft365",
          chatStack: null,
          ssoProvider: null,
          standardPlatforms: [],
          standardOsVersions: [],
          printerFleet: [],
          approvedSoftware: [],
          status: "draft",
          confirmedAt: null,
        }}
        confirmedBy={null}
        idpEnforcesMfa={false}
        suggestions={{ ...suggestions, printers: [] }}
      />
    );

    expect(screen.getByTestId("environment-profile-status")).toHaveTextContent(
      "Draft"
    );
    expect(
      screen.getByText(
        "The assistant only uses this profile after you confirm it. Saving changes returns it to draft."
      )
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Confirm profile" })
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(
        "Our identity provider requires MFA for every sign-in"
      )
    ).not.toBeChecked();
  });
});
