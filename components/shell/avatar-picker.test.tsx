import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
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
    expect(await screen.findByText("Avatar saved")).toBeInTheDocument();
  });

  it("saves a selected character and renders its portrait image", async () => {
    render(<AvatarPicker email="person@example.com" />);
    fireEvent.click(screen.getByRole("button", { name: "Choose avatar" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Top bun with stud earrings" })
    );

    expect(updateUser).toHaveBeenCalledWith({ data: { avatar: "char:mei" } });
    expect(
      document.querySelector('[data-character="mei"] img')
    ).toHaveAttribute("src", "/avatars/mei-96.webp");
    expect(await screen.findByText("Avatar saved")).toBeInTheDocument();
  });

  it("upgrades a legacy animal character to a human avatar", () => {
    render(<AvatarPicker email="person@example.com" avatar="char:cat" />);
    expect(
      document.querySelector('[data-character="mei"]')
    ).toBeInTheDocument();
  });

  it("offers the new people and saves one of them", async () => {
    render(<AvatarPicker email="person@example.com" />);
    fireEvent.click(screen.getByRole("button", { name: "Choose avatar" }));
    for (const label of [
      "Bald with grey beard",
      "Patterned head wrap",
      "Cap with freckles",
      "Locs with headband",
    ]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
    fireEvent.click(screen.getByRole("button", { name: "Cap with freckles" }));
    expect(updateUser).toHaveBeenCalledWith({ data: { avatar: "char:finn" } });
    expect(await screen.findByText("Avatar saved")).toBeInTheDocument();
  });

  it("restores the previous choice and retries failed saves", async () => {
    updateUser
      .mockResolvedValueOnce({ error: new Error("save failed") })
      .mockResolvedValueOnce({});
    render(<AvatarPicker email="person@example.com" avatar="char:mei" />);
    fireEvent.click(screen.getByRole("button", { name: "Choose avatar" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Short dark hair with earbuds" })
    );
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Couldn't save your avatar."
      )
    );
    expect(document.querySelector('[data-avatar="mei"]')).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Avatar saved")).toBeInTheDocument();
    expect(updateUser).toHaveBeenCalledTimes(2);
  });
});
