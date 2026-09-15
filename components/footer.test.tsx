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
  test("renders useful public columns without organization links", () => {
    render(<Footer />);

    expect(screen.getByText("Get help")).toBeInTheDocument();
    expect(screen.getByText("Popular fixes")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Browse solutions" })
    ).toHaveAttribute("href", "/browse");
    expect(
      screen.getByRole("link", { name: "Create account" })
    ).toHaveAttribute("href", "/signup");
    expect(screen.queryByText("Organization admin")).not.toBeInTheDocument();
    expect(screen.queryByText("Notifications")).not.toBeInTheDocument();
  });

  test("uses signed-in account links", () => {
    render(<Footer signedIn />);

    expect(
      screen.getByRole("link", { name: "Notification settings" })
    ).toHaveAttribute("href", "/tickets");
    expect(
      screen.queryByRole("link", { name: "Sign in" })
    ).not.toBeInTheDocument();
  });

  test("hides from admin routes", () => {
    pathname.value = "/admin/resolution";
    render(<Footer />);
    expect(screen.queryByText("Get help")).not.toBeInTheDocument();
  });
});
