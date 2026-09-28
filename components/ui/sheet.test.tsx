import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Sheet } from "./sheet";

describe("Sheet", () => {
  it("renders an accessible portal dialog and closes on escape", async () => {
    const onOpenChange = vi.fn();
    render(
      <Sheet open onOpenChange={onOpenChange} title="Navigation">
        <a href="/browse">Browse solutions</a>
      </Sheet>
    );
    await waitFor(() =>
      expect(
        screen.getByRole("dialog", { name: "Navigation" })
      ).toBeInTheDocument()
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
