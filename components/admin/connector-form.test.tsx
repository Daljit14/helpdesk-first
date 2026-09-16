import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { ConnectorForm } from "./connector-form";

let actionState: { success?: true; error?: string } | null = null;

vi.mock("@/app/actions/admin-connectors", () => ({
  saveConnectorAction: vi.fn(),
  testConnectorAction: vi.fn(),
  disableConnectorAction: vi.fn(),
}));

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return {
    ...actual,
    useActionState: vi.fn(() => [actionState, vi.fn(), false]),
  };
});

describe("ConnectorForm", () => {
  afterEach(() => {
    cleanup();
    actionState = null;
  });

  test("renders an empty connector form", () => {
    render(<ConnectorForm initial={null} />);
    expect(screen.getByLabelText("Provider")).toHaveValue("entra");
    expect(screen.getByLabelText("Tenant ID")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Save connector" })
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Secret set — enter a new value to rotate")
    ).not.toBeInTheDocument();
  });

  test("renders existing connector fields and provider-specific controls", () => {
    render(
      <ConnectorForm
        initial={{
          provider: "google",
          config: { adminSubject: "admin@example.com" },
          allowedGroupIds: ["group-1"],
          resetUrl: "https://example.com/reset",
          status: "active",
        }}
      />
    );
    expect(screen.getByLabelText("Provider")).toHaveValue("google");
    expect(
      screen.getByLabelText("Google service-account JSON")
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Google admin subject")).toHaveValue(
      "admin@example.com"
    );
    expect(screen.getByLabelText("Allowed group IDs")).toHaveValue("group-1");
    expect(
      screen.getByText("Secret set — enter a new value to rotate")
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Tenant ID")).not.toBeInTheDocument();
  });

  test("renders action errors", () => {
    actionState = { error: "Connector could not be saved." };
    render(<ConnectorForm initial={null} />);
    expect(screen.getAllByRole("alert")).toHaveLength(3);
    expect(screen.getAllByRole("alert")[0]).toHaveTextContent(
      "Connector could not be saved."
    );
  });
});
