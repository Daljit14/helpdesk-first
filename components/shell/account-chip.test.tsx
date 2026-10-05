import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccountChip } from "./account-chip";

const updateUser = vi.fn().mockResolvedValue({});

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { updateUser } }),
}));

afterEach(() => {
  cleanup();
  localStorage.clear();
  updateUser.mockReset().mockResolvedValue({});
});

describe("AccountChip", () => {
  it("writes a successful selection to the signed-in user's cache", async () => {
    const { container } = render(
      <AccountChip
        email="person@example.com"
        userId="user-1"
        avatar="char:cat"
      />
    );

    const trigger = screen.getByRole("button", {
      name: "Change avatar for person@example.com",
    });
    fireEvent.click(trigger);
    fireEvent.click(
      screen.getByRole("radio", { name: "Braids with gold hoops" })
    );

    await waitFor(() =>
      expect(localStorage.getItem("hf-avatar:user-1")).toBe("zuri")
    );
    expect(
      screen.queryByRole("radiogroup", { name: "Avatar" })
    ).not.toBeInTheDocument();
    expect(localStorage.getItem("hf-avatar")).toBeNull();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(updateUser).toHaveBeenCalledWith({ data: { avatar: "zuri" } });
    expect(container.querySelector('[data-avatar="zuri"]')).toBeInTheDocument();
  });

  it("maps a legacy animal avatar to a human one", () => {
    render(
      <AccountChip
        email="person@example.com"
        userId="user-1"
        avatar="char:cat"
      />
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Change avatar for person@example.com",
      })
    );
    expect(
      screen.getByRole("radio", { name: "Top bun with stud earrings" })
    ).toHaveAttribute("aria-checked", "true");
    expect(
      screen.getByRole("radio", { name: /Use my initial/ })
    ).toBeInTheDocument();
  });

  it("shows the display name with the email underneath", () => {
    render(
      <AccountChip
        email="person@example.com"
        userId="user-1"
        name="  Dana Rivers "
      />
    );
    expect(screen.getByText("Dana Rivers")).toBeInTheDocument();
    expect(screen.getByText("person@example.com")).toBeInTheDocument();
  });

  it("falls back to the email name when no full name is set", () => {
    render(<AccountChip email="person@example.com" userId="user-1" />);
    expect(screen.getByText("person")).toBeInTheDocument();
  });

  it("lists all 16 people in the picker and can pick a new one", async () => {
    render(<AccountChip email="person@example.com" userId="user-1" />);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Change avatar for person@example.com",
      })
    );
    const group = screen.getByRole("radiogroup", { name: "Avatar" });
    expect(group.querySelectorAll('[role="radio"]')).toHaveLength(17);
    fireEvent.click(screen.getByRole("radio", { name: "Locs with headband" }));
    await waitFor(() =>
      expect(localStorage.getItem("hf-avatar:user-1")).toBe("luca")
    );
  });

  it("restores the previous choice and offers retry when Supabase returns an error", async () => {
    localStorage.setItem("hf-avatar:user-1", "kai");
    updateUser.mockResolvedValueOnce({ error: new Error("save failed") });
    const { container } = render(
      <AccountChip email="person@example.com" userId="user-1" avatar="kai" />
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Change avatar for person@example.com",
      })
    );
    fireEvent.click(screen.getByRole("radio", { name: "Pink bob" }));

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Couldn't save your avatar."
      )
    );
    expect(container.querySelector('[data-avatar="kai"]')).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(localStorage.getItem("hf-avatar:user-1")).toBe("kai");
  });

  it("restores the previous choice when the save promise rejects", async () => {
    localStorage.setItem("hf-avatar:user-1", "kai");
    updateUser.mockRejectedValueOnce(new Error("network failed"));
    const { container } = render(
      <AccountChip email="person@example.com" userId="user-1" avatar="kai" />
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Change avatar for person@example.com",
      })
    );
    fireEvent.click(screen.getByRole("radio", { name: "Pink bob" }));

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Couldn't save your avatar."
      )
    );
    expect(container.querySelector('[data-avatar="kai"]')).toBeInTheDocument();
    expect(localStorage.getItem("hf-avatar:user-1")).toBe("kai");
  });

  it("retries a failed selection and shows the saved status", async () => {
    updateUser
      .mockRejectedValueOnce(new Error("network failed"))
      .mockResolvedValueOnce({});
    render(<AccountChip email="person@example.com" userId="user-1" />);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Change avatar for person@example.com",
      })
    );
    fireEvent.click(screen.getByRole("radio", { name: "Pink bob" }));

    fireEvent.click(await screen.findByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Avatar saved")).toBeInTheDocument();
    expect(localStorage.getItem("hf-avatar:user-1")).toBe("ines");
    expect(updateUser).toHaveBeenCalledTimes(2);
  });

  it("does not reuse one user's cached avatar for another user", async () => {
    localStorage.setItem("hf-avatar:user-a", "ada");
    localStorage.setItem("hf-avatar:user-b", "remy");
    const { container, rerender } = render(
      <AccountChip email="person@example.com" userId="user-a" />
    );
    await waitFor(() =>
      expect(container.querySelector('[data-avatar="ada"]')).toBeInTheDocument()
    );

    rerender(<AccountChip email="person@example.com" userId="user-b" />);
    await waitFor(() =>
      expect(
        container.querySelector('[data-avatar="remy"]')
      ).toBeInTheDocument()
    );
    expect(
      container.querySelector('[data-avatar="ada"]')
    ).not.toBeInTheDocument();
  });

  it("ignores and removes the legacy unscoped avatar cache", async () => {
    localStorage.setItem("hf-avatar", "zuri");
    localStorage.setItem("hf-avatar:user-1", "mei");
    const { container } = render(
      <AccountChip email="person@example.com" userId="user-1" />
    );

    await waitFor(() =>
      expect(container.querySelector('[data-avatar="mei"]')).toBeInTheDocument()
    );
    expect(
      container.querySelector('[data-avatar="zuri"]')
    ).not.toBeInTheDocument();
    expect(localStorage.getItem("hf-avatar")).toBeNull();
  });
});
