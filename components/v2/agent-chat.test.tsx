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

const { uploadMock } = vi.hoisted(() => ({ uploadMock: vi.fn() }));
vi.mock("@/lib/attachments/client", () => ({
  uploadSecureAttachment: uploadMock,
}));

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
  test("hides screenshot input when vision is disabled", () => {
    render(<AgentChat initialProblem="Wi-Fi is down" />);
    expect(screen.queryByText("Screenshot")).not.toBeInTheDocument();
  });

  test("uploads a ready screenshot and sends its attachment id", async () => {
    uploadMock.mockResolvedValue({
      attachmentId: "00000000-0000-4000-8000-000000000010",
      status: "ready",
    });
    const fetchMock = vi.fn().mockResolvedValue(streamResponse([]));
    vi.stubGlobal("fetch", fetchMock);
    render(<AgentChat visionEnabled />);
    const input = document.querySelector(
      'input[accept="image/png,image/jpeg,image/webp"]'
    );
    if (!input) throw new Error("screenshot input missing");
    fireEvent.change(input, {
      target: {
        files: [new File(["image"], "error.png", { type: "image/png" })],
      },
    });
    await screen.findByText(/Screenshot: error.png · ready/);
    fireEvent.click(screen.getByRole("button", { name: "Ask the assistant" }));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      attachmentIds: ["00000000-0000-4000-8000-000000000010"],
      message: "I shared a screenshot of the problem.",
    });
  });

  test("renders screenshot received timeline entries", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        streamResponse([
          {
            type: "screenshot_received",
            attachmentId: "attachment-1",
            summary: "Wi-Fi error visible.",
          },
        ])
      )
    );
    render(<AgentChat initialProblem="Inspect this" />);
    fireEvent.click(screen.getByRole("button", { name: "Ask the assistant" }));
    expect(
      await screen.findByText("Screenshot received — Wi-Fi error visible.")
    ).toBeInTheDocument();
  });

  test("shows feedback under a resolved event only when enabled", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        streamResponse([
          { type: "session", sessionId: "session-123" },
          { type: "resolved", text: "Your connection is fixed." },
        ])
      )
    );
    render(<AgentChat initialProblem="Wi-Fi is down" feedbackEnabled />);
    fireEvent.click(screen.getByRole("button", { name: "Ask the assistant" }));
    expect(
      await screen.findByRole("button", { name: "That wasn't right" })
    ).toBeInTheDocument();
  });

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

  test("keeps the composer enabled after a recoverable screenshot error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        streamResponse([
          {
            type: "error",
            message: "That screenshot is not ready for analysis.",
            recoverable: true,
          },
        ])
      )
    );
    render(<AgentChat visionEnabled initialProblem="Wi-Fi is down" />);

    fireEvent.click(screen.getByRole("button", { name: "Ask the assistant" }));

    expect(
      await screen.findByText("That screenshot is not ready for analysis.")
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("Describe your IT problem")
    ).not.toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Ask the assistant" })
    ).not.toBeDisabled();
    expect(screen.queryByText(/Screenshot:/)).not.toBeInTheDocument();
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

  test("keeps a consent card enabled after a session consent event", async () => {
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
          {
            type: "session_consent",
            state: "granted",
            capabilityIds: ["device_flush_dns"],
          },
        ])
      )
      .mockResolvedValueOnce(streamResponse([]));
    vi.stubGlobal("fetch", fetchMock);
    render(<AgentChat initialProblem="Wi-Fi is down" />);

    fireEvent.click(screen.getByRole("button", { name: "Ask the assistant" }));
    const approve = await screen.findByRole("button", { name: "Approve" });

    expect(approve).not.toBeDisabled();
    fireEvent.click(approve);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({
      consent: { approvalRequestId: "approval-1", decision: "approve" },
    });
  });

  test("keeps pending consent enabled through session events only", async () => {
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
          { type: "session", sessionId: "session-1" },
          {
            type: "session_consent",
            state: "revoked",
            capabilityIds: [],
          },
        ])
      )
      .mockResolvedValueOnce(
        streamResponse([
          { type: "thinking_summary", text: "Checking the device." },
        ])
      );
    vi.stubGlobal("fetch", fetchMock);
    render(<AgentChat initialProblem="Wi-Fi is down" />);

    fireEvent.click(screen.getByRole("button", { name: "Ask the assistant" }));
    const approve = await screen.findByRole("button", { name: "Approve" });

    await waitFor(() => expect(approve).not.toBeDisabled());

    fireEvent.click(screen.getByRole("button", { name: "Talk to a human" }));
    await waitFor(() => expect(approve).toBeDisabled());
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

  test("keeps human escalation available after a terminal error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        streamResponse([
          {
            type: "error",
            message: "The assistant could not continue safely.",
          },
        ])
      )
    );
    render(<AgentChat initialProblem="Printer is offline" />);

    fireEvent.click(screen.getByRole("button", { name: "Ask the assistant" }));

    expect(
      await screen.findByText("The assistant could not continue safely.")
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Describe your IT problem")).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Ask the assistant" })
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Talk to a human" })
    ).not.toBeDisabled();
  });

  test("renders session consent offer and sends grant body", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        streamResponse([
          {
            type: "session_consent_offer",
            card: {
              title:
                "Allow the assistant to apply safe, reversible fixes during this session?",
              capabilities: [
                {
                  id: "device_flush_dns",
                  title: "Flush DNS",
                  whatHappens: "Flush the device DNS cache.",
                  reversible: true,
                },
              ],
              expiresInMs: 3_600_000,
            },
          },
          {
            type: "final_answer",
            text: "I can check a few safe causes while you decide.",
            confidence: 0.9,
            evidence: [],
          },
        ])
      )
      .mockResolvedValueOnce(streamResponse([]));
    vi.stubGlobal("fetch", fetchMock);
    render(<AgentChat initialProblem="Wi-Fi is down" />);
    fireEvent.click(screen.getByRole("button", { name: "Ask the assistant" }));
    expect(
      await screen.findByText("I can check a few safe causes while you decide.")
    ).toBeInTheDocument();
    fireEvent.click(
      await screen.findByRole("button", { name: "Allow for this session" })
    );
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({
      sessionConsent: "grant",
    });
  });

  test("shows the revoke chip and sends revoke body", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        streamResponse([
          {
            type: "session_consent",
            state: "granted",
            capabilityIds: ["device_flush_dns"],
          },
        ])
      )
      .mockResolvedValueOnce(streamResponse([]));
    vi.stubGlobal("fetch", fetchMock);
    render(<AgentChat initialProblem="Wi-Fi is down" />);
    fireEvent.click(screen.getByRole("button", { name: "Ask the assistant" }));
    fireEvent.click(await screen.findByRole("button", { name: "Revoke" }));
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({
      sessionConsent: "revoke",
    });
  });

  test("labels autorun execution", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      streamResponse([
        {
          type: "action_executing",
          capabilityId: "device_flush_dns",
          text: "Applied automatically (you allowed safe fixes this session).",
          autorun: true,
        },
      ])
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<AgentChat initialProblem="Wi-Fi is down" />);
    fireEvent.click(screen.getByRole("button", { name: "Ask the assistant" }));
    expect(
      await screen.findByText(
        "Applied automatically (you allowed safe fixes this session)."
      )
    ).toBeInTheDocument();
  });

  test("answers greetings and mashing locally without calling the agent", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<AgentChat initialProblem="hello" />);
    fireEvent.click(screen.getByRole("button", { name: "Ask the assistant" }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(
      screen.getByText(/Hi there! I’m the HelpDesk First assistant/)
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Describe your IT problem"), {
      target: { value: "dikncjkdbcjb ajbdkajbd" },
    });
    expect(
      screen.getByText("That doesn’t look like a problem description yet.")
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ask the assistant" }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Hmm, I couldn’t understand that."
    );
  });

  test("clears pasted secrets instead of sending them", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<AgentChat initialProblem="password: Hunter2!" />);
    fireEvent.click(screen.getByRole("button", { name: "Ask the assistant" }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Describe your IT problem")).toHaveValue("");
    expect(screen.getByRole("alert")).toHaveTextContent("Don’t share secrets");
  });

  test("sends an example problem chip", async () => {
    const fetchMock = vi.fn().mockResolvedValue(streamResponse([]));
    vi.stubGlobal("fetch", fetchMock);
    render(<AgentChat initialProblem="thanks" />);
    fireEvent.click(screen.getByRole("button", { name: "Ask the assistant" }));
    fireEvent.click(screen.getByRole("button", { name: "Printer is offline" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      message: "Printer is offline",
    });
  });
});
