import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { AdminLoginForm } from "./admin-login-form";

let actionState: { error?: string } | null = null;

vi.mock("@/app/actions/admin-auth", () => ({
  adminLogin: vi.fn(),
}));

vi.mock("@/app/actions/auth", () => ({
  startSso: vi.fn(),
}));

vi.mock("@/components/turnstile-widget", () => ({
  TurnstileWidget: () => null,
}));

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return {
    ...actual,
    useActionState: vi.fn(() => [actionState, vi.fn(), false]),
  };
});

describe("AdminLoginForm", () => {
  afterEach(() => {
    cleanup();
    actionState = null;
  });

  test("SSO buttons bypass required-field validation but password login does not", () => {
    render(
      <AdminLoginForm
        next="/admin/operations"
        googleSsoEnabled
        microsoftSsoEnabled
      />
    );

    expect(
      screen.getByRole("button", { name: "Continue with Google" })
    ).toHaveAttribute("formnovalidate");
    expect(
      screen.getByRole("button", { name: "Continue with Microsoft" })
    ).toHaveAttribute("formnovalidate");
    expect(screen.getByRole("button", { name: "Log in" })).not.toHaveAttribute(
      "formnovalidate"
    );
    expect(
      screen.getByRole("button", { name: "Log in" }).closest("form")
    ).not.toHaveAttribute("novalidate");
  });

  test("renders an initial SSO error in the alert", () => {
    render(
      <AdminLoginForm
        next="/admin/operations"
        initialError="That account isn't a HelpDesk First staff account."
      />
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "That account isn't a HelpDesk First staff account."
    );
  });
});
