import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HomeStart } from "./home-start";

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  sessionStorage.clear();
});

describe("HomeStart", () => {
  it("renders the problem form and device links", () => {
    render(<HomeStart />);
    expect(
      screen.getByRole("heading", { name: "What can we help you fix?" })
    ).toBeInTheDocument();
    expect(screen.getByLabelText("What's the problem?")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "iOS" })).toHaveAttribute(
      "href",
      "/browse?platform=ios"
    );
    expect(screen.getByRole("link", { name: "Android" })).toHaveAttribute(
      "href",
      "/browse?platform=android"
    );
  });

  it("keeps the primary action disabled until three characters", () => {
    render(<HomeStart />);
    const problem = screen.getByLabelText("What's the problem?");
    const button = screen.getByRole("button", { name: "Find a solution" });
    expect(button).toBeDisabled();
    fireEvent.change(problem, { target: { value: "Wi" } });
    expect(button).toBeDisabled();
    fireEvent.change(problem, { target: { value: "Wifi" } });
    expect(button).toBeEnabled();
  });
});
