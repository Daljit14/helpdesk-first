import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CategoryGrid } from "./category-grid";

describe("CategoryGrid", () => {
  it("exposes selected state on compact category buttons", () => {
    const onSelect = vi.fn();

    const { rerender } = render(
      <CategoryGrid selected={null} onSelect={onSelect} />
    );

    const computer = screen.getByRole("button", { name: "Computer" });
    expect(computer).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(computer);
    expect(onSelect).toHaveBeenCalledWith("computer");

    rerender(<CategoryGrid selected="computer" onSelect={onSelect} />);
    expect(screen.getByRole("button", { name: "Computer" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });
});
