import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppShell } from "./app-shell";
import { ThemeProvider } from "@/components/theme-provider";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
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
vi.mock("@/app/actions/auth", () => ({ logoutAction: vi.fn() }));

describe("AppShell", () => {
  it("exposes navigation and only the signed-in email", () => {
    render(
      <ThemeProvider>
        <AppShell email="person@example.com" aiEnabled>
          <p>Content</p>
        </AppShell>
      </ThemeProvider>
    );
    expect(
      screen.getAllByRole("link", { name: "Start" }).length
    ).toBeGreaterThan(0);
    expect(screen.getAllByText("person@example.com").length).toBeGreaterThan(0);
    expect(
      screen.queryByText(/user_metadata|supabase/i)
    ).not.toBeInTheDocument();
  });
});
