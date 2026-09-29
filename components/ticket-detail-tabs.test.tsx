import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { TicketDetailTabs } from "./ticket-detail-tabs";

const replace = vi.fn();
let query = "";

vi.mock("next/navigation", () => ({
  usePathname: () => "/tickets/ticket-1",
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams(query),
}));

const tabs = [
  { id: "overview", label: "Overview", content: <p>Overview content</p> },
  {
    id: "conversation",
    label: "Conversation",
    badge: 2,
    content: <p>Conversation content</p>,
  },
];

describe("TicketDetailTabs", () => {
  afterEach(() => {
    cleanup();
    replace.mockClear();
    query = "";
  });

  test("renders every panel and only shows the active panel", () => {
    render(<TicketDetailTabs tabs={tabs} defaultTab="conversation" />);

    expect(screen.getAllByRole("tabpanel", { hidden: true })).toHaveLength(2);
    expect(screen.getByText("Overview content").parentElement).toHaveAttribute(
      "hidden"
    );
    expect(
      screen.getByText("Conversation content").parentElement
    ).not.toHaveAttribute("hidden");
  });

  test("switches tabs and updates the URL", () => {
    render(<TicketDetailTabs tabs={tabs} defaultTab="overview" />);

    fireEvent.click(
      screen.getByRole("tab", { name: /Conversation/, selected: false })
    );

    expect(
      screen.getByText("Conversation content").parentElement
    ).not.toHaveAttribute("hidden");
    expect(replace).toHaveBeenCalledWith("/tickets/ticket-1?tab=conversation", {
      scroll: false,
    });
  });

  test("honors a matching tab query parameter", () => {
    query = "tab=conversation";
    render(<TicketDetailTabs tabs={tabs} defaultTab="overview" />);
    expect(screen.getByRole("tab", { name: /Conversation/ })).toHaveAttribute(
      "aria-selected",
      "true"
    );
  });
});
