import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { AgentEvent } from "@/lib/agent/types";
import { AgentChat } from "./agent-chat";

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

function streamResponse(events: AgentEvent[]) {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const event of events) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
        );
      }
      controller.close();
    },
  });
  return new Response(body, {
    headers: { "Content-Type": "text/event-stream" },
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AgentChat", () => {
  test("keeps the composer enabled after a final answer", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      streamResponse([
        {
          type: "final_answer",
          text: "Try restarting the adapter.",
          confidence: 0.9,
          evidence: [],
        },
      ])
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<AgentChat initialProblem="Wi-Fi is down" />);

    fireEvent.click(screen.getByRole("button", { name: "Ask the assistant" }));

    await screen.findByText("Try restarting the adapter.");
    expect(
      screen.getByLabelText("Describe your IT problem")
    ).not.toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Ask the assistant" })
    ).not.toBeDisabled();
  });

  test("disables consent buttons after the card is answered", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        streamResponse([
          {
            type: "consent_required",
            card: {
              approvalRequestId: "approval-1",
              capabilityId: "device_flush_dns",
              title: "Flush DNS",
              whatHappens: "Flush the device DNS cache.",
              target: { kind: "device", label: "Work laptop" },
              reversible: true,
              expiresAt: new Date(Date.now() + 60_000).toISOString(),
            },
          },
        ])
      )
      .mockResolvedValueOnce(streamResponse([]));
    vi.stubGlobal("fetch", fetchMock);
    render(<AgentChat initialProblem="Wi-Fi is down" />);

    fireEvent.click(screen.getByRole("button", { name: "Ask the assistant" }));
    const approve = await screen.findByRole("button", { name: "Approve" });
    const decline = screen.getByRole("button", { name: "Decline" });

    fireEvent.click(approve);

    expect(approve).toBeDisabled();
    expect(decline).toBeDisabled();
  });

  test("appends the human escalation card without clearing the transcript", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        streamResponse([
          {
            type: "final_answer",
            text: "Try restarting the adapter.",
            confidence: 0.9,
            evidence: [],
          },
        ])
      )
      .mockResolvedValueOnce(
        streamResponse([
          {
            type: "escalated",
            ticketId: "ticket-1",
            reason: "human_requested",
          },
        ])
      );
    vi.stubGlobal("fetch", fetchMock);
    render(<AgentChat initialProblem="Wi-Fi is down" />);

    fireEvent.click(screen.getByRole("button", { name: "Ask the assistant" }));
    await screen.findByText("Try restarting the adapter.");

    fireEvent.click(screen.getByRole("button", { name: "Talk to a human" }));

    await waitFor(() =>
      expect(screen.getByRole("link", { name: "Open ticket" })).toHaveAttribute(
        "href",
        "/tickets/ticket-1"
      )
    );
    expect(screen.getByText("Try restarting the adapter.")).toBeInTheDocument();
  });
});
