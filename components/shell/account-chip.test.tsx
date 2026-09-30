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
    fireEvent.click(
      screen.getByRole("radio", { name: "Braids with gold hoops" })
    );

    expect(
      screen.queryByRole("radiogroup", { name: "Avatar" })
    ).not.toBeInTheDocument();
    expect(localStorage.getItem("hf-avatar")).toBe("zuri");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(updateUser).toHaveBeenCalledWith({ data: { avatar: "zuri" } });
  });

  it("maps a legacy animal avatar to a human one", () => {
    render(<AccountChip email="person@example.com" avatar="char:cat" />);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Change avatar for person@example.com",
      })
    );
    expect(
      screen.getByRole("radio", { name: "Top bun with earrings" })
    ).toHaveAttribute("aria-checked", "true");
    expect(
      screen.getByRole("radio", { name: /Use my initial/ })
    ).toBeInTheDocument();
  });

  it("shows the display name with the email underneath", () => {
    render(<AccountChip email="person@example.com" name="  Dana Rivers " />);
    expect(screen.getByText("Dana Rivers")).toBeInTheDocument();
    expect(screen.getByText("person@example.com")).toBeInTheDocument();
  });

  it("falls back to the email name when no full name is set", () => {
    render(<AccountChip email="person@example.com" />);
    expect(screen.getByText("person")).toBeInTheDocument();
  });
});
