import { recordAnswerFeedback } from "@/lib/answers/feedback";
import {
  evaluateAgentSessionEligibility,
  evaluateLearningEligibility,
} from "@/lib/knowledge/learning-eligibility";
import { validateLearnedArticle } from "@/lib/knowledge/learning-article";

export type LearningCaptureEvalCase = {
  caseId: string;
  draftCreated: boolean;
  needsSecurityReview: boolean;
};

const completeReport = {
  rootCause: "A network adapter setting prevented connection.",
  actionsPerformed: "Enabled the adapter and verified connectivity.",
  toolsUsed: "Network settings",
  preventiveRecommendation: "Check adapter status if the issue returns.",
};

function sessionEligibility(
  overrides: {
    verification?: string;
    securityFlag?: boolean;
    tainted?: boolean;
  } = {}
) {
  return evaluateAgentSessionEligibility({
    status: "resolved",
    userConfirmedAt: "2026-01-01T00:00:00.000Z",
    latestVerificationOutcome: overrides.verification ?? "passed",
    securityFlag: overrides.securityFlag ?? false,
    tainted: overrides.tainted ?? false,
    backingTicketReopenCount: 0,
  });
}

function ticketEligibility(
  overrides: {
    report?: Record<string, unknown>;
    text?: string;
  } = {}
) {
  return evaluateLearningEligibility({
    status: "Resolved",
    reopenCount: 0,
    verificationMethod: "user_confirmed",
    verificationException: false,
    verifiedByUser: true,
    resolutionReport: overrides.report ?? completeReport,
    textForScreening: [
      overrides.text ?? "The network adapter is disconnected.",
    ],
  });
}

function answerRunAdmin(tables: string[]) {
  const queryFor = (table: string) => {
    const query = {
      select: () => query,
      eq: () => query,
      order: () => query,
      limit: () => query,
      insert: () => query,
      update: () => query,
      maybeSingle: async () =>
        table === "answer_engine_runs"
          ? {
              data: {
                organization_id: "org-1",
                problem_label: "A community answer suggests a fix",
                platform: "Windows",
              },
              error: null,
            }
          : { data: null, error: null },
      then: (
        resolve: (value: unknown) => unknown,
        reject?: (reason: unknown) => unknown
      ) =>
        Promise.resolve(
          table === "knowledge_draft_clusters"
            ? { data: [], error: null }
            : { data: null, error: null }
        ).then(resolve, reject),
    };
    return query;
  };
  return {
    from: (table: string) => {
      tables.push(table);
      return queryFor(table);
    },
  };
}

async function communityOnlyAnswerRunDoesNotCreateDraft(): Promise<boolean> {
  const oldLearning = process.env.HELP_DESK_KNOWLEDGE_LEARNING_ENABLED;
  const oldCapture = process.env.HELP_DESK_KNOWLEDGE_CAPTURE_ENABLED;
  process.env.HELP_DESK_KNOWLEDGE_LEARNING_ENABLED = "true";
  process.env.HELP_DESK_KNOWLEDGE_CAPTURE_ENABLED = "true";
  const tables: string[] = [];
  try {
    await recordAnswerFeedback(answerRunAdmin(tables) as never, {
      runId: "answer-run",
      organizationId: "org-1",
      outcome: "fixed",
      ticketId: null,
    });
    return !tables.includes("knowledge_drafts");
  } finally {
    if (oldLearning === undefined)
      delete process.env.HELP_DESK_KNOWLEDGE_LEARNING_ENABLED;
    else process.env.HELP_DESK_KNOWLEDGE_LEARNING_ENABLED = oldLearning;
    if (oldCapture === undefined)
      delete process.env.HELP_DESK_KNOWLEDGE_CAPTURE_ENABLED;
    else process.env.HELP_DESK_KNOWLEDGE_CAPTURE_ENABLED = oldCapture;
  }
}

export async function runLearningCaptureEvalCases(): Promise<
  LearningCaptureEvalCase[]
> {
  const riskyArticle = {
    title: "Network troubleshooting",
    problemSummary: "The network connection fails.",
    symptoms: ["Pages do not load"],
    platforms: ["Windows"],
    rootCause: "The adapter is disabled.",
    preconditions: [],
    steps: [{ text: "Check the DNS settings.", risk: "safe" as const }],
    verification: ["Ask whether the connection works."],
    escalationConditions: [],
    prevention: [],
    sources: [{ type: "ticket" as const, reference: "ticket-1" }],
    confidence: 0.8,
    securityReviewRequired: false,
  };
  const securityReview = validateLearnedArticle(riskyArticle, []);
  const cases = [
    {
      caseId: "learning_capture_tainted_agent",
      draftCreated: sessionEligibility({ tainted: true }).eligible,
      needsSecurityReview: false,
    },
    {
      caseId: "learning_capture_security_flag_agent",
      draftCreated: sessionEligibility({ securityFlag: true }).eligible,
      needsSecurityReview: false,
    },
    {
      caseId: "learning_capture_failed_verification",
      draftCreated: sessionEligibility({ verification: "failed" }).eligible,
      needsSecurityReview: false,
    },
    {
      caseId: "learning_capture_community_only_answer",
      draftCreated: !(await communityOnlyAnswerRunDoesNotCreateDraft()),
      needsSecurityReview: false,
    },
    {
      caseId: "learning_capture_staff_one_off",
      draftCreated: ticketEligibility({
        report: { ...completeReport, reuse: "one_off" },
      }).eligible,
      needsSecurityReview: false,
    },
    {
      caseId: "learning_capture_password_mfa",
      draftCreated: ticketEligibility({
        text: "The user needs help with an MFA password reset.",
      }).eligible,
      needsSecurityReview: false,
    },
    {
      caseId: "learning_capture_risky_learned_step",
      draftCreated: false,
      needsSecurityReview: securityReview.securityReviewRequired,
    },
  ];
  return cases;
}
