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
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: mocks.createClient,
}));
vi.mock("@/lib/supabase/storage", () => ({
  getTicketAttachmentUrl: vi.fn(),
}));

const initialTicket = {
  id: "ticket-1",
  issue_id: "no-internet",
  issue_title: "No internet connection",
  message: "Cannot connect.",
  status: "Open",
  created_at: "2025-01-01T00:00:00.000Z",
  attachment_path: null,
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
});
