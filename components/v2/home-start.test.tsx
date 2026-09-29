import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { saveSession } from "@/lib/session";
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
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe("HomeStart", () => {
  it("fills the textarea from a quick-search chip", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          ok: true,
          checks: {
            app: { ok: true, ms: 1 },
            database: { ok: true, ms: 2 },
            auth: { ok: true, ms: 3 },
            storage: { ok: true, ms: 4 },
            ai: { ok: true, ms: 5 },
            notifications: { ok: true, ms: 6 },
            rateLimiter: { ok: true, ms: 7 },
          },
          timestamp: new Date().toISOString(),
        }),
      })
    );
    render(<HomeStart />);
    fireEvent.click(screen.getByRole("button", { name: "Wi-Fi" }));

    expect(screen.getByLabelText("What's the problem?")).toHaveValue("Wi-Fi");
    expect(
      screen.getByRole("button", { name: "Find a solution" })
    ).toBeEnabled();
  });

  it("renders category and dashboard discovery sections", () => {
    render(<HomeStart />);

    expect(
      screen.getByRole("heading", { name: "Browse by category" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "How HelpDesk First works" })
    ).toBeInTheDocument();
  });

  it("renders a resume card for an active troubleshooting session", async () => {
    saveSession({
      issueSlug: "slow-computer",
      issueTitle: "Slow computer",
      platform: "Windows",
      currentStepIndex: 1,
      attemptedSteps: [],
      status: "in-progress",
      updatedAt: Date.now(),
    });

    render(<HomeStart />);

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Slow computer" })
      ).toBeInTheDocument()
    );
    expect(screen.getByRole("link", { name: /Resume/ })).toHaveAttribute(
      "href",
      "/issues/slow-computer/guide?platform=windows"
    );
  });

  it("renders the problem form and device links", () => {
    render(<HomeStart />);
    expect(
      screen.getByRole("heading", { name: "What can we fix today?" })
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
