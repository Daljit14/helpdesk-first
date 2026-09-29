import { act, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ThemeProvider, useTheme } from "./theme-provider";

function ThemeButton() {
  const { theme, toggleTheme } = useTheme();
  return <button onClick={toggleTheme}>{theme}</button>;
}

describe("ThemeProvider", () => {
  it("defaults to light and persists toggles", async () => {
    render(
      <ThemeProvider>
        <ThemeButton />
      </ThemeProvider>
    );
    expect(screen.getByRole("button")).toHaveTextContent("light");
    await waitFor(() =>
      expect(screen.getByRole("button")).toHaveTextContent("light")
    );
    act(() => screen.getByRole("button").click());
    await waitFor(() =>
      expect(screen.getByRole("button")).toHaveTextContent("dark")
    );
    expect(localStorage.getItem("hf-theme")).toBe("dark");
    expect(document.documentElement).toHaveClass("dark");
  });
});
