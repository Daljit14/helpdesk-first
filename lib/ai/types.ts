import type { Platform } from "@/lib/helpdesk-data";

export type Decision = "match" | "clarify" | "escalate";

export type DiagnosticAnswer = {
  questionId: string;
  answer: string;
};

export type AiIntakeInput = {
  message: string;
  platform?: Platform | null;
  previousAnswers?: DiagnosticAnswer[];
};

export type AiIntakeOutput = {
  decision: Decision;
  matchedIssueSlug?: string;
  detectedPlatform?: Platform | null;
  diagnosticQuestionIds?: string[];
  explanation?: string;
  escalationReason?: string;
};

export interface AiProvider {
  classify(
    input: AiIntakeInput,
    options?: { signal?: AbortSignal }
  ): Promise<AiIntakeOutput>;
}

export type DiagnosticQuestion = {
  id: string;
  text: string;
  categoryIds?: string[];
};

export const diagnosticQuestions: DiagnosticQuestion[] = [
  {
    id: "which-platform",
    text: "Which device or operating system are you using? (Windows, Mac, Mobile, or Other)",
  },
  {
    id: "where-happens",
    text: "Where does this problem happen? For example, a specific app, website, or location.",
    categoryIds: ["software", "email", "audio", "printer"],
  },
  {
    id: "when-started",
    text: "When did the problem start, and does it happen every time?",
    categoryIds: [
      "computer",
      "network",
      "printer",
      "software",
      "audio",
    ],
  },
  {
    id: "error-message",
    text: "Do you see an error message or code? If so, what does it say?",
  },
  {
    id: "network-owner",
    text: "Do you own this router or network equipment, or is it managed by your workplace, school, or someone else?",
    categoryIds: ["network"],
  },
  {
    id: "account-managed",
    text: "Is this account or email managed by an organization, school, or workplace?",
    categoryIds: ["email"],
  },
  {
    id: "already-restarted",
    text: "Have you already tried restarting the device or app?",
    categoryIds: ["computer", "software", "audio"],
  },
  {
    id: "printer-connected",
    text: "Is the printer turned on and connected to the same network or cable as the computer?",
    categoryIds: ["printer"],
  },
];
