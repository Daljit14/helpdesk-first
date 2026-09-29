import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AvatarPicker } from "./avatar-picker";

const updateUser = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { updateUser } }),
}));

afterEach(() => {
  cleanup();
  updateUser.mockReset();
});

describe("AvatarPicker", () => {
  it("defaults to the logo and saves a selected emoji", async () => {
    render(<AvatarPicker email="person@example.com" />);
    expect(
      screen.getByRole("button", { name: "Choose avatar" })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Choose avatar" }));
    expect(
      screen.getByRole("dialog", { name: "Choose avatar" })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "🚀" }));
    expect(updateUser).toHaveBeenCalledWith({ data: { avatar: "🚀" } });
  });

  it("saves a selected character and renders its svg", () => {
    render(<AvatarPicker email="person@example.com" />);
    fireEvent.click(screen.getByRole("button", { name: "Choose avatar" }));
    fireEvent.click(screen.getByRole("button", { name: "Cat" }));

    expect(updateUser).toHaveBeenCalledWith({ data: { avatar: "char:cat" } });
    expect(
      document.querySelector('[data-character="cat"]')
    ).toBeInTheDocument();
  });
});
