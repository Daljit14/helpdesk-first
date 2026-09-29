import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { useAssistantIntake } from "./ai-assistant-logic";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));
vi.mock("@/app/actions/resolution", () => ({
  startAiTicket: vi.fn(),
}));
vi.mock("@/app/actions/tickets", () => ({
  createWorkflowTicket: vi.fn(),
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  push.mockReset();
});

function mockClarification() {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          status: "ok",
          output: {
            decision: "clarify",
            diagnosticQuestionIds: ["where-happens"],
          },
        }),
        { status: 200 }
      )
    )
  );
}

describe("useAssistantIntake", () => {
  test("passes a typed platform answer to intake", async () => {
    mockClarification();
    const { result } = renderHook(() =>
      useAssistantIntake({ initialProblem: "camera not working" })
    );

    act(() => {
      result.current.handleSubmitAnswer("which-platform", "mac");
    });

    await waitFor(() => {
      const intakeCall = vi
        .mocked(fetch)
        .mock.calls.find(([input]) => String(input).includes("/api/ai/intake"));
      expect(intakeCall).toBeDefined();
      expect(JSON.parse(String(intakeCall?.[1]?.body))).toMatchObject({
        platform: "Mac",
      });
    });
  });

  test("escalates locally instead of fetching a fourth answer", async () => {
    mockClarification();
    const { result } = renderHook(() =>
      useAssistantIntake({ initialProblem: "wifi keeps dropping" })
    );

    act(() => {
      result.current.handleSubmitAnswer("where-happens", "at home");
    });
    await waitFor(() => expect(result.current.previousAnswers).toHaveLength(1));
    act(() => {
      result.current.handleSubmitAnswer("when-started", "today");
    });
    await waitFor(() => expect(result.current.previousAnswers).toHaveLength(2));
    act(() => {
      result.current.handleSubmitAnswer("error-message", "none");
    });
    await waitFor(() => expect(result.current.previousAnswers).toHaveLength(3));

    const fetchCallsBeforeFourthAnswer = vi.mocked(fetch).mock.calls.length;
    act(() => {
      result.current.handleSubmitAnswer("network-owner", "still happening");
    });

    expect(vi.mocked(fetch).mock.calls).toHaveLength(
      fetchCallsBeforeFourthAnswer
    );
    expect(result.current.previousAnswers).toHaveLength(3);
    expect(result.current.currentOutput).toMatchObject({
      decision: "escalate",
    });
    expect(
      result.current.currentOutput?.suggestedIssueSlugs?.length
    ).toBeLessThanOrEqual(3);
  });
});
