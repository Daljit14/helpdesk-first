import {
  boundedString,
  closed,
  departmentEnum,
  ticketScoped,
  uuid,
} from "./schemas";
import type { CapabilityDefinition } from "./types";

const OWNER = "platform";
const REVIEW_DATE = "2026-12-31";

const common = {
  version: 1,
  platforms: ["any"],
  owner: OWNER,
  reviewDate: REVIEW_DATE,
} satisfies Partial<CapabilityDefinition>;

export const searchApprovedKnowledge: CapabilityDefinition = {
  ...common,
  id: "search_approved_knowledge",
  department: "Knowledge Base",
  description:
    "Search the approved knowledge catalog for guides matching the ticket description.",
  inputSchema: closed({ ticketId: uuid(), query: boundedString(200) }),
  preconditions: [
    { id: "ticket_exists", description: "Ticket exists in the organisation." },
  ],
  riskLevel: "safe",
  consent: "none",
  orgPolicyRequirements: [],
  maxRuntimeMs: 5_000,
  expectedResult: "A ranked list of approved guide slugs.",
  verification: "none",
  rollback: "none",
  sideEffects: "read_only",
};

export const askDiagnosticQuestion: CapabilityDefinition = {
  ...common,
  id: "ask_diagnostic_question",
  department: "AI Investigations",
  description:
    "Ask the requester one approved diagnostic question that has not been asked before.",
  inputSchema: closed({ ticketId: uuid(), questionId: boundedString(64) }),
  preconditions: [
    {
      id: "question_not_asked",
      description: "Question id is not in the investigation asked set.",
    },
  ],
  riskLevel: "safe",
  consent: "none",
  orgPolicyRequirements: [],
  maxRuntimeMs: 5_000,
  expectedResult: "The question is recorded and the answer is captured.",
  verification: "diagnostic_answer_recorded",
  rollback: "none",
  sideEffects: "internal_write",
};

export const collectPlatformContext: CapabilityDefinition = {
  ...common,
  id: "collect_platform_context",
  department: "AI Investigations",
  description:
    "Record the requester-declared platform, OS and application context on the investigation.",
  inputSchema: ticketScoped,
  preconditions: [
    { id: "ticket_exists", description: "Ticket exists in the organisation." },
  ],
  riskLevel: "safe",
  consent: "none",
  orgPolicyRequirements: [],
  maxRuntimeMs: 5_000,
  expectedResult: "Investigation context row is present.",
  verification: "investigation_context_present",
  rollback: "none",
  sideEffects: "internal_write",
};

export const checkHelpdeskServiceStatus: CapabilityDefinition = {
  ...common,
  id: "check_helpdesk_service_status",
  department: "Operations Dashboard",
  description:
    "Read the HelpDesk First service status endpoint to rule out a platform-side outage.",
  inputSchema: ticketScoped,
  preconditions: [],
  riskLevel: "safe",
  consent: "none",
  orgPolicyRequirements: [],
  maxRuntimeMs: 10_000,
  expectedResult: "Status endpoint response captured.",
  verification: "status_response_captured",
  rollback: "none",
  sideEffects: "read_only",
};

export const resendTicketNotification: CapabilityDefinition = {
  ...common,
  id: "resend_ticket_notification",
  department: "Notifications and SLA",
  description:
    "Queue a fresh copy of an existing ticket notification through the outbox.",
  inputSchema: closed({ ticketId: uuid(), notificationId: uuid() }),
  preconditions: [
    {
      id: "notification_belongs_to_ticket",
      description: "Outbox row belongs to the ticket and organisation.",
    },
  ],
  riskLevel: "caution",
  consent: "user",
  orgPolicyRequirements: ["autonomy.notifications"],
  maxRuntimeMs: 30_000,
  expectedResult: "New outbox row reaches sent and the user confirms receipt.",
  verification: "outbox_sent_and_user_confirms",
  rollback: "none",
  sideEffects: "external_write",
};

export const retryFailedNotification: CapabilityDefinition = {
  ...common,
  id: "retry_failed_notification",
  department: "Notifications and SLA",
  description:
    "Retry a notification outbox row that is in failed or dead state.",
  inputSchema: closed({ ticketId: uuid(), notificationId: uuid() }),
  preconditions: [
    {
      id: "outbox_failed_or_dead",
      description: "Outbox row exists and status is failed or dead.",
    },
  ],
  riskLevel: "caution",
  consent: "user",
  orgPolicyRequirements: ["autonomy.notifications"],
  maxRuntimeMs: 30_000,
  expectedResult: "Outbox row moves from failed or dead to sent.",
  verification: "outbox_status_sent",
  rollback: "none",
  sideEffects: "external_write",
};

export const validateAttachmentScanStatus: CapabilityDefinition = {
  ...common,
  id: "validate_attachment_scan_status",
  department: "Attachments",
  description:
    "Read an attachment's processing status and scan verdict without touching its bytes.",
  inputSchema: closed({ ticketId: uuid(), attachmentId: uuid() }),
  preconditions: [
    {
      id: "attachment_belongs_to_ticket",
      description: "Attachment belongs to the ticket and organisation.",
    },
  ],
  riskLevel: "safe",
  consent: "none",
  orgPolicyRequirements: [],
  maxRuntimeMs: 5_000,
  expectedResult: "Attachment status and scan verdict read.",
  verification: "attachment_status_read",
  rollback: "none",
  sideEffects: "read_only",
};

export const generateDiagnosisPackage: CapabilityDefinition = {
  ...common,
  id: "generate_diagnosis_package",
  department: "AI Investigations",
  description:
    "Snapshot the structured Diagnosis package and evidence record for IT staff.",
  inputSchema: ticketScoped,
  preconditions: [
    {
      id: "investigation_exists",
      description: "Ticket has an investigation row.",
    },
  ],
  riskLevel: "safe",
  consent: "none",
  orgPolicyRequirements: [],
  maxRuntimeMs: 15_000,
  expectedResult: "escalation_package snapshot present.",
  verification: "escalation_package_present",
  rollback: "none",
  sideEffects: "internal_write",
};

export const requestUserVerification: CapabilityDefinition = {
  ...common,
  id: "request_user_verification",
  department: "Ticket Queue",
  description:
    "Move the ticket to Pending Verification and ask the requester to confirm the outcome.",
  inputSchema: ticketScoped,
  preconditions: [
    {
      id: "ticket_not_terminal",
      description: "Ticket is not already resolved or closed.",
    },
  ],
  riskLevel: "safe",
  consent: "none",
  orgPolicyRequirements: [],
  maxRuntimeMs: 10_000,
  expectedResult: "Ticket is Pending Verification and the user answers.",
  verification: "user_verification_answer",
  rollback: "none",
  sideEffects: "internal_write",
};

export const routeToDepartment: CapabilityDefinition = {
  ...common,
  id: "route_to_department",
  department: "Ticket Queue",
  description:
    "Assign the ticket to an approved Admin department queue for human follow-up.",
  inputSchema: closed({ ticketId: uuid(), department: departmentEnum }),
  preconditions: [
    {
      id: "department_available",
      description: "Target department is available to the organisation.",
    },
  ],
  riskLevel: "caution",
  consent: "user",
  orgPolicyRequirements: ["autonomy.routing"],
  maxRuntimeMs: 10_000,
  expectedResult: "Assignment or department updated.",
  verification: "assignment_updated",
  rollback: "compensating",
  sideEffects: "internal_write",
};

export const escalateWithEvidence: CapabilityDefinition = {
  ...common,
  id: "escalate_with_evidence",
  department: "Ticket Queue",
  description:
    "Hand the ticket to a human with the Diagnosis package and evidence attached.",
  inputSchema: closed({ ticketId: uuid(), reason: boundedString(200) }),
  preconditions: [
    {
      id: "ticket_not_terminal",
      description: "Ticket is not already resolved or closed.",
    },
  ],
  riskLevel: "safe",
  consent: "none",
  orgPolicyRequirements: [],
  maxRuntimeMs: 15_000,
  expectedResult: "Ticket is Needs Human with a package snapshot.",
  verification: "needs_human_with_package",
  rollback: "none",
  sideEffects: "internal_write",
};

export const CAPABILITY_DEFINITIONS: readonly CapabilityDefinition[] =
  Object.freeze([
    searchApprovedKnowledge,
    askDiagnosticQuestion,
    collectPlatformContext,
    checkHelpdeskServiceStatus,
    resendTicketNotification,
    retryFailedNotification,
    validateAttachmentScanStatus,
    generateDiagnosisPackage,
    requestUserVerification,
    routeToDepartment,
    escalateWithEvidence,
  ]);
