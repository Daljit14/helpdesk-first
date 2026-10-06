import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

const reactMocks = vi.hoisted(() => ({
  states: [] as unknown[],
  calls: 0,
}));

vi.mock("@/app/actions/admin-vendor-domains", () => ({
  addOrgVendorDomainAction: vi.fn(),
  removeOrgVendorDomainAction: vi.fn(),
}));
vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return {
    ...actual,
    useActionState: vi.fn(() => {
      const index = reactMocks.calls++ % 2;
      return [reactMocks.states[index] ?? null, vi.fn(), false];
    }),
  };
});

import { VendorDomainsPanel } from "./vendor-domains-panel";

afterEach(() => {
  cleanup();
  reactMocks.states = [];
  reactMocks.calls = 0;
});

describe("VendorDomainsPanel", () => {
  test("renders the empty state, domain limit, and built-in docs list", () => {
    render(<VendorDomainsPanel domains={[]} />);
    expect(screen.getByText("0 of 25")).toBeInTheDocument();
    expect(
      screen.getByText("No organization-approved vendor domains yet.")
    ).toBeInTheDocument();
    expect(
      screen.getByText("learn.microsoft.com", { selector: "li" })
    ).toBeInTheDocument();
  });

  test("renders organization domains, local dates, and accessible remove controls", () => {
    render(
      <VendorDomainsPanel
        domains={[
          {
            id: "domain-id",
            domain: "support.contoso-vpn.com",
            addedByName: "Casey Admin",
            createdAt: "2026-10-01T12:00:00.000Z",
          },
        ]}
      />
    );

    expect(screen.getByText("1 of 25")).toBeInTheDocument();
    expect(screen.getByText("support.contoso-vpn.com")).toBeInTheDocument();
    expect(screen.getByText(/Added by Casey Admin/)).toBeInTheDocument();
    const date = screen.getByText((_content, element) => {
      return (
        element?.tagName === "TIME" &&
        element.textContent !== "2026-10-01T12:00:00.000Z"
      );
    });
    expect(date).toHaveAttribute("datetime", "2026-10-01T12:00:00.000Z");
    expect(
      screen.getByRole("button", {
        name: "Remove support.contoso-vpn.com",
      })
    ).toBeInTheDocument();
  });

  test("renders action errors in an alert region", () => {
    reactMocks.states.push({ error: "This domain is not allowed." });
    render(<VendorDomainsPanel domains={[]} />);
    const addForm = screen
      .getByRole("button", { name: "Add domain" })
      .closest("form");
    expect(addForm).not.toBeNull();
    fireEvent.submit(addForm!);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "This domain is not allowed."
    );
  });

  test("shows only the message from the most recently submitted form", () => {
    reactMocks.states.push(
      { error: "That domain is already on the list." },
      { success: true, message: "Domain removed." }
    );
    render(
      <VendorDomainsPanel
        domains={[
          {
            id: "domain-id",
            domain: "support.contoso-vpn.com",
            addedByName: "Casey Admin",
            createdAt: "2026-10-01T12:00:00.000Z",
          },
        ]}
      />
    );

    const addForm = screen
      .getByRole("button", { name: "Add domain" })
      .closest("form");
    expect(addForm).not.toBeNull();
    fireEvent.submit(addForm!);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "That domain is already on the list."
    );

    const removeForm = screen
      .getByRole("button", { name: "Remove support.contoso-vpn.com" })
      .closest("form");
    expect(removeForm).not.toBeNull();
    fireEvent.submit(removeForm!);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Domain removed.");
  });
});
