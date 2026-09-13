"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { platforms, type Platform } from "@/lib/helpdesk-data";
import { filterIssues, getIssueBySlug } from "@/lib/search";
import {
  diagnosticQuestions,
  type AiIntakeOutput,
  type DiagnosticAnswer,
} from "@/lib/ai/types";
import { startAiTicket } from "@/app/actions/resolution";
import { createWorkflowTicket } from "@/app/actions/tickets";

const MAX_QUESTIONS = 3;

export function useAssistantIntake({
  initialProblem = "",
  initialPlatform = null,
  autoStart = false,
}: {
  initialProblem?: string;
  initialPlatform?: Platform | null;
  autoStart?: boolean;
}) {
  const router = useRouter();
  const [problem, setProblem] = useState(initialProblem);
  const [platform, setPlatform] = useState<Platform | null>(initialPlatform);
  const [previousAnswers, setPreviousAnswers] = useState<DiagnosticAnswer[]>(
    []
  );
  const [currentOutput, setCurrentOutput] = useState<AiIntakeOutput | null>(
    null
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState(autoStart);
  const [diagnosticAnswer, setDiagnosticAnswer] = useState("");

  const submitIntake = useCallback(
    async (
      nextProblem = problem,
      nextPlatform = platform,
      nextAnswers = previousAnswers,
      isFirstSubmission = false
    ) => {
      if (isFirstSubmission) {
        void fetch("/api/analytics/event", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "assistant_start",
            path: "/assistant",
            platform: nextPlatform,
          }),
          keepalive: true,
        }).catch(() => {});
      }
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/ai/intake", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: nextProblem,
            platform: nextPlatform,
            previousAnswers: nextAnswers,
          }),
        });
        const data = (await response.json()) as {
          status: string;
          output?: AiIntakeOutput;
          reason?: string;
        };
        if (response.status === 503 || data.status === "unavailable") {
          setError(
            data.reason ?? "The support assistant is not available right now."
          );
        } else if (data.status === "escalate") {
          setCurrentOutput({
            decision: "escalate",
            escalationReason:
              data.reason ??
              "This request cannot be handled by the support assistant.",
          });
        } else if (data.status === "ok" && data.output) {
          setCurrentOutput(data.output);
        } else {
          setError("Something went wrong. Please try the search page.");
        }
      } catch {
        setError(
          "The support assistant is not responding. Please use the search page."
        );
      } finally {
        setLoading(false);
      }
    },
    [platform, previousAnswers, problem]
  );

  const handleRejectMatch = useCallback(() => {
    void fetch("/api/analytics/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "ai_recommendation_rejected",
        path: "/assistant",
      }),
      keepalive: true,
    }).catch(() => {});
    const rejectedSlug =
      currentOutput?.decision === "match"
        ? currentOutput.matchedIssueSlug
        : undefined;
    const previousSuggestions = (currentOutput?.suggestedIssueSlugs ?? [])
      .filter((slug) => slug !== rejectedSlug)
      .filter((slug) => getIssueBySlug(slug));
    const fallbackSuggestions = filterIssues({
      query: problem,
      platform,
    })
      .map((issue) => issue.id)
      .filter((slug) => slug !== rejectedSlug);
    setCurrentOutput({
      decision: "escalate",
      escalationReason:
        "That guide wasn't the right fit. Here are the closest approved guides for what you described.",
      suggestedIssueSlugs: (previousSuggestions.length
        ? previousSuggestions
        : fallbackSuggestions
      ).slice(0, 3),
    });
  }, [currentOutput, platform, problem]);

  const restart = useCallback(() => {
    setProblem("");
    setPlatform(null);
    setPreviousAnswers([]);
    setCurrentOutput(null);
    setError(null);
    setStarted(false);
    setDiagnosticAnswer("");
  }, []);

  const handleSendToSupport = useCallback(async () => {
    const result = await createWorkflowTicket({
      message: problem,
      platform: platform ?? "Other",
      diagnosticAnswers: previousAnswers,
    });
    if ("ticketId" in result && result.ticketId) {
      router.push(`/tickets/${result.ticketId}`);
      return {};
    }
    return {
      error: "error" in result ? result.error : "Unable to submit ticket.",
    };
  }, [platform, previousAnswers, problem, router]);

  const handleStart = useCallback(
    (nextProblem: string) => {
      if (!nextProblem.trim()) return;
      setProblem(nextProblem.trim());
      setStarted(true);
      void submitIntake(nextProblem.trim(), platform, [], true);
    },
    [platform, submitIntake]
  );

  const handleSubmitPlatform = useCallback(
    (nextPlatform: Platform) => {
      const answers: DiagnosticAnswer[] = [
        ...previousAnswers,
        { questionId: "which-platform", answer: nextPlatform },
      ];
      setPlatform(nextPlatform);
      setPreviousAnswers(answers);
      void submitIntake(problem, nextPlatform, answers);
    },
    [previousAnswers, problem, submitIntake]
  );

  const handleSubmitAnswer = useCallback(
    (questionId: string, answer: string) => {
      if (!answer.trim()) return;
      const answers: DiagnosticAnswer[] = [
        ...previousAnswers,
        { questionId, answer: answer.trim() },
      ];
      setPreviousAnswers(answers);
      setDiagnosticAnswer("");
      void submitIntake(problem, platform, answers);
    },
    [platform, previousAnswers, problem, submitIntake]
  );

  const searchHref = useCallback(() => {
    const params = new URLSearchParams();
    if (problem) params.set("q", problem);
    if (platform) params.set("platform", platform);
    return params.toString() ? `/?${params.toString()}` : "/";
  }, [platform, problem]);

  return {
    problem,
    setProblem,
    platform,
    setPlatform,
    previousAnswers,
    currentOutput,
    loading,
    error,
    started,
    setStarted,
    diagnosticAnswer,
    setDiagnosticAnswer,
    submitIntake,
    restart,
    handleStart,
    handleSubmitPlatform,
    handleSubmitAnswer,
    handleRejectMatch,
    handleSendToSupport,
    searchHref,
    maxQuestions: MAX_QUESTIONS,
    diagnosticQuestions,
    setCurrentOutput,
    startAiTicket,
    router,
    isPlatform: (value: string): value is Platform =>
      platforms.includes(value as Platform),
  };
}
