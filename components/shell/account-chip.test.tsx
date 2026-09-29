import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccountChip } from "./account-chip";

const updateUser = vi.fn().mockResolvedValue({});

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { updateUser } }),
}));

afterEach(() => {
  cleanup();
  localStorage.clear();
  updateUser.mockClear();
});

describe("AccountChip", () => {
  it("keeps a selected avatar after choosing it", () => {
    render(<AccountChip email="person@example.com" avatar="char:cat" />);

    const trigger = screen.getByRole("button", {
      name: "Change avatar for person@example.com",
    });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("radio", { name: "Owl" }));

    expect(
      screen.queryByRole("radiogroup", { name: "Avatar" })
    ).not.toBeInTheDocument();
    expect(localStorage.getItem("hf-avatar")).toBe("owl");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(updateUser).toHaveBeenCalledWith({ data: { avatar: "owl" } });
  });
});
