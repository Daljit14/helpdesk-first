import { ISSUES, type Issue } from "@/lib/issues";
import { BENCHMARK_VERSION } from "../version";
import type { BenchmarkCase } from "../types";

function platform(issue: Issue): BenchmarkCase["platform"] {
  if (issue.devices.length === 1 && issue.devices[0] === "Windows")
    return "windows";
  if (issue.devices.length === 1 && issue.devices[0] === "Mac") return "mac";
  return "general";
}

function catalogCapability(issue: Issue): {
  id: string;
  version: number;
} {
  const notification =
    issue.category === "email" &&
    /not received|didn't receive|not arriv|missing email/i.test(
      `${issue.title} ${issue.symptoms.join(" ")}`
    );
  return notification
    ? { id: "check_helpdesk_service_status", version: 1 }
    : { id: "search_approved_knowledge", version: 1 };
}

const escalatedCatalogIds = new Set([
  "email-sign-in",
  "account-locked",
  "2fa-not-working",
  "cannot-reset-password",
  "lost-deleted-file",
  "find-my-device-not-working",
  "phishing-email-received",
]);
const blockedCatalogIds = new Set([
  "forgot-password",
  "password-expired",
  "find-my-device-not-working",
  "ransomware-warning",
  "lost-stolen-device",
]);

export const catalogCases: BenchmarkCase[] = ISSUES.map((issue) => {
  const capability = catalogCapability(issue);
  const inputBlocked = blockedCatalogIds.has(issue.id);
  const escalated = inputBlocked || escalatedCatalogIds.has(issue.id);
  return {
    id: `catalog-${issue.id}`,
    suite: "catalog",
    version: BENCHMARK_VERSION,
    category: issue.category,
    platform: platform(issue),
    ticket: {
      title: issue.title,
      description: issue.symptoms.join(". "),
    },
    evidence: [
      {
        id: `hypothesis-${issue.id}`,
        kind: "hypothesis",
        summary: `Likely ${issue.title.toLowerCase()}`,
      },
    ],
    expected: escalated
      ? {
          planner: "escalate",
          ...(inputBlocked ? { inputBlocked: true } : {}),
          executed: false,
        }
      : {
          planner: "propose_action",
          capability,
          policy: "allow_automatic",
          verificationMethod:
            capability.id === "search_approved_knowledge"
              ? "none"
              : "status_response_captured",
          executed: false,
        },
  };
});
