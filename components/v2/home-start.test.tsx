import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HomeStart } from "./home-start";
import { toTicketPlatform } from "@/lib/ui-copy";

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

afterEach(() => {
  cleanup();
  sessionStorage.clear();
});

describe("HomeStart", () => {
  it("normalizes catalog devices for ticket persistence", () => {
    expect(toTicketPlatform("Mac")).toBe("macOS");
    expect(toTicketPlatform("Windows")).toBe("Windows");
    expect(toTicketPlatform("iOS")).toBe("iOS");
    expect(toTicketPlatform("Android")).toBe("Android");
    expect(toTicketPlatform("Linux")).toBe("Other");
  });

  it("renders the three platform options", () => {
    render(<HomeStart />);
    expect(
      screen.getByRole("button", { name: "General IT Support" })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mac" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Windows" })).toBeInTheDocument();
  });

  it.each([
    ["General IT Support", "Describe the IT problem you need help with."],
    ["Mac", "Tell us what problem you are having with your Mac."],
    [
      "Windows",
      "Tell us what problem you are having with your Windows computer.",
    ],
  ])("shows the %s prompt", (option, prompt) => {
    render(<HomeStart />);
    fireEvent.click(screen.getByRole("button", { name: option }));
    expect(screen.getByText(prompt)).toBeInTheDocument();
  });

  it("removes the platform chip without losing typed text", () => {
    render(<HomeStart />);
    fireEvent.click(screen.getByRole("button", { name: "Mac" }));
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "wifi keeps dropping" } });
    fireEvent.click(screen.getByRole("button", { name: "Change platform" }));
    expect(screen.getByRole("button", { name: "Mac" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Mac" }));
    expect(screen.getByRole("textbox")).toHaveValue("wifi keeps dropping");
  });

  it("navigates actions with platform, description, intent, and attachment params", () => {
    render(<HomeStart signedIn />);
    fireEvent.click(screen.getByRole("button", { name: "Mac" }));
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "wifi keeps dropping" },
    });
    const file = new File(["screenshot"], "wifi.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Upload screenshot or PDF"), {
      target: { files: [file] },
    });
    expect(
      screen.getByRole("link", { name: "Find a solution" })
    ).toHaveAttribute(
      "href",
      "/assistant?q=wifi+keeps+dropping&intent=solve&platform=Mac&attach=1"
    );
    expect(
      screen.getByRole("link", { name: "Create a support ticket" })
    ).toHaveAttribute(
      "href",
      "/assistant?q=wifi+keeps+dropping&intent=ticket&platform=Mac&attach=1"
    );
    expect(
      screen.getByRole("link", { name: "I want a person" })
    ).toHaveAttribute(
      "href",
      "/assistant?q=wifi+keeps+dropping&intent=human&platform=Mac&attach=1"
    );
  });

  it("renders the safe-use warning and attachment sign-in note", () => {
    render(<HomeStart />);
    fireEvent.click(screen.getByRole("button", { name: "General IT Support" }));
    expect(
      screen.getByText(/Do not enter passwords, security codes, recovery keys/)
    ).toBeInTheDocument();
    const file = new File(["pdf"], "evidence.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText("Upload screenshot or PDF"), {
      target: { files: [file] },
    });
    expect(
      screen.getByText("Sign in to attach files to a ticket")
    ).toBeInTheDocument();
  });
});
