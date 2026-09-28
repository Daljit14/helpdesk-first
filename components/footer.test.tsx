import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { Footer } from "./footer";

const pathname = vi.hoisted(() => ({ value: "/" }));

vi.mock("next/navigation", () => ({
  usePathname: () => pathname.value,
}));

afterEach(() => {
  cleanup();
  pathname.value = "/";
});

describe("Footer", () => {
  test("renders public navigation links", () => {
    render(<Footer />);

    expect(
      screen.getByRole("link", { name: "Browse solutions" })
    ).toHaveAttribute("href", "/browse");
    expect(screen.getByRole("link", { name: "Sign up" })).toHaveAttribute(
      "href",
      "/signup"
    );
    expect(
      screen.queryByRole("link", { name: "Staff log in" })
    ).not.toBeInTheDocument();
  });

  test("uses signed-in account links", () => {
    render(<Footer signedIn />);

    expect(
      screen.queryByRole("link", { name: "New ticket" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Log in" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Staff log in" })
    ).not.toBeInTheDocument();
  });

  test("shows staff log-in only for staff", () => {
    render(<Footer signedIn staff />);

    expect(screen.getByRole("link", { name: "Staff log in" })).toHaveAttribute(
      "href",
      "/admin/login"
    );
  });
});
