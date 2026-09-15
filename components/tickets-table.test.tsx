import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { TicketsTable } from "./tickets-table";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  removeChannel: vi.fn(),
  replace: vi.fn(),
  search: "",
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: mocks.createClient,
}));
vi.mock("@/lib/supabase/storage", () => ({
  getTicketAttachmentUrl: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/tickets",
  useRouter: () => ({ replace: mocks.replace }),
  useSearchParams: () => new URLSearchParams(mocks.search),
}));

const initialTicket = {
  id: "ticket-1",
  issue_id: "no-internet",
  issue_title: "No internet connection",
  message: "Cannot connect.",
  status: "Open",
  created_at: "2025-01-01T00:00:00.000Z",
  attachment_path: null,
  resolver_type: "unassigned",
};

function setupClient() {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    order: vi.fn().mockResolvedValue({
      data: [{ ...initialTicket, status: "Resolved" }],
      error: null,
    }),
  };
  const channel = {
    on: vi.fn(() => channel),
    subscribe: vi.fn((callback: (status: string) => void) => {
      callback("CHANNEL_ERROR");
      return channel;
    }),
  };
  const client = {
    from: vi.fn(() => builder),
    channel: vi.fn(() => channel),
    removeChannel: mocks.removeChannel,
  };
  mocks.createClient.mockReturnValue(client);
  return { builder, channel };
}

describe("TicketsTable", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setupClient();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.clearAllMocks();
    mocks.search = "";
  });

  test("refreshes tickets on the polling interval after realtime failure", async () => {
    const { builder } = setupClient();
    render(<TicketsTable initialTickets={[initialTicket]} userId="user-1" />);

    await act(async () => {
      vi.advanceTimersByTime(30_000);
      await Promise.resolve();
    });

    expect(builder.order).toHaveBeenCalledWith("created_at", {
      ascending: false,
    });
    expect(screen.getByText("Resolved")).toBeInTheDocument();
  });

  test("refreshes tickets when the page becomes visible", async () => {
    const { builder } = setupClient();
    render(<TicketsTable initialTickets={[initialTicket]} userId="user-1" />);

    await act(async () => {
      fireEvent(document, new Event("visibilitychange"));
      await Promise.resolve();
    });

    expect(builder.order).toHaveBeenCalled();
  });

  test("renders open and previous portal sections with action-needed status", () => {
    render(
      <TicketsTable
        initialTickets={[
          initialTicket,
          {
            ...initialTicket,
            id: "ticket-2",
            status: "AI Resolving",
            issue_title: "VPN issue",
          },
          {
            ...initialTicket,
            id: "ticket-3",
            status: "Resolved",
            issue_title: "Printer issue",
          },
        ]}
        userId="user-1"
        portalEnabled
      />
    );
    expect(screen.getByTestId("tickets-open")).toBeInTheDocument();
    expect(screen.getByTestId("tickets-previous")).toBeInTheDocument();
    expect(screen.getByText("Action needed")).toBeInTheDocument();
    expect(screen.getByText("Suggested fix ready")).toBeInTheDocument();
  });

  test("renders filter chips with counts and filters to resolved tickets", () => {
    render(
      <TicketsTable
        initialTickets={[
          initialTicket,
          {
            ...initialTicket,
            id: "ticket-2",
            status: "Resolved",
            issue_title: "Resolved printer issue",
          },
          {
            ...initialTicket,
            id: "ticket-3",
            status: "Closed",
            issue_title: "Closed VPN issue",
          },
        ]}
        userId="user-1"
        portalEnabled
      />
    );

    expect(screen.getByRole("button", { name: "All 3" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Resolved 1" })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Resolved 1" }));

    expect(screen.queryByTestId("tickets-open")).not.toBeInTheDocument();
    expect(screen.getByText("Resolved printer issue")).toBeInTheDocument();
    expect(screen.queryByText("Closed VPN issue")).not.toBeInTheDocument();
    expect(mocks.replace).toHaveBeenCalledWith("/tickets?filter=resolved", {
      scroll: false,
    });
  });

  test("collapses previous tickets and reveals the remainder", () => {
    render(
      <TicketsTable
        initialTickets={[
          initialTicket,
          ...[1, 2, 3, 4].map((index) => ({
            ...initialTicket,
            id: `ticket-${index + 1}`,
            status: "Resolved",
            issue_title: `Resolved issue ${index}`,
          })),
        ]}
        userId="user-1"
        portalEnabled
      />
    );

    expect(screen.getByText("Resolved issue 1")).toBeInTheDocument();
    expect(screen.getByText("Resolved issue 3")).toBeInTheDocument();
    expect(screen.queryByText("Resolved issue 4")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show 1 more" }));
    expect(screen.getByText("Resolved issue 4")).toBeInTheDocument();
  });

  test("links tickets to their detail page and keeps a guide link", () => {
    render(<TicketsTable initialTickets={[initialTicket]} userId="user-1" />);
    expect(
      screen.getByRole("link", { name: "No internet connection" })
    ).toHaveAttribute("href", "/tickets/ticket-1");
    expect(screen.getByRole("link", { name: "View guide" })).toHaveAttribute(
      "href",
      "/issues/no-internet"
    );
    expect(
      screen.getByRole("link", { name: "View progress for ticket ticket-1" })
    ).toHaveAttribute("href", "/tickets/ticket-1#progress");
  });
});
