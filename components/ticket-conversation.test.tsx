import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { TicketConversation } from "./ticket-conversation";

const mocks = vi.hoisted(() => ({
  listTicketComments: vi.fn(),
  addUserComment: vi.fn(),
  requestHuman: vi.fn(),
  verifyTicket: vi.fn(),
  createClient: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("@/app/actions/tickets", () => ({
  listTicketComments: mocks.listTicketComments,
  addUserComment: mocks.addUserComment,
  requestHuman: mocks.requestHuman,
  verifyTicket: mocks.verifyTicket,
}));
vi.mock("@/lib/supabase/client", () => ({
  createClient: mocks.createClient,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

describe("TicketConversation", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  test("refreshes comments through the authenticated server action", async () => {
    mocks.listTicketComments.mockResolvedValue([
      {
        id: 1,
        message: "Server-decrypted reply",
        author_type: "employee",
        created_at: "2025-01-01T00:00:00.000Z",
      },
    ]);
    const channel = {
      on: vi.fn((_: unknown, __: unknown, callback: () => void) => {
        callback();
        return channel;
      }),
      subscribe: vi.fn(() => channel),
    };
    mocks.createClient.mockReturnValue({
      channel: vi.fn(() => channel),
      removeChannel: vi.fn(),
    });
    render(
      <TicketConversation
        ticketId="00000000-0000-0000-0000-000000000001"
        userId="user-1"
        initialComments={[]}
        status="Open"
        workflowEnabled
      />
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(
      await screen.findByText("Server-decrypted reply")
    ).toBeInTheDocument();
    expect(mocks.listTicketComments).toHaveBeenCalledWith(
      "00000000-0000-0000-0000-000000000001"
    );
  });
});
