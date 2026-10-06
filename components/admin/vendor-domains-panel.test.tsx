import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

const reactMocks = vi.hoisted(() => ({ states: [] as unknown[] }));

vi.mock("@/app/actions/admin-vendor-domains", () => ({
  addOrgVendorDomainAction: vi.fn(),
  removeOrgVendorDomainAction: vi.fn(),
}));
vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return {
    ...actual,
    useActionState: vi.fn(() => [
      reactMocks.states.shift() ?? null,
      vi.fn(),
      false,
    ]),
  };
});

import { VendorDomainsPanel } from "./vendor-domains-panel";

afterEach(() => {
  cleanup();
  reactMocks.states = [];
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
    expect(screen.getByRole("alert")).toHaveTextContent(
      "This domain is not allowed."
    );
  });
});
