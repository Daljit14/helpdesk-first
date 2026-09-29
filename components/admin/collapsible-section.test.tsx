import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import { CollapsibleSection } from "./collapsible-section";

afterEach(() => {
  window.localStorage.clear();
});

describe("CollapsibleSection", () => {
  test("persists open and closed state by section id", async () => {
    const { unmount } = render(
      <CollapsibleSection id="workflow" title="Workflow">
        <p>Workflow content</p>
      </CollapsibleSection>
    );
    const details = screen.getByText("Workflow").parentElement?.parentElement;
    expect(details).not.toHaveAttribute("open");

    fireEvent.click(screen.getByText("Workflow"));
    expect(window.localStorage.getItem("hf-admin-section:workflow")).toBe(
      "open"
    );
    unmount();

    render(
      <CollapsibleSection id="workflow" title="Workflow">
        <p>Workflow content</p>
      </CollapsibleSection>
    );
    await waitFor(() =>
      expect(
        screen.getByText("Workflow").parentElement?.parentElement
      ).toHaveAttribute("open")
    );
  });
});
