"use client";

import { FormEvent, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  addInternalNote,
  addPublicComment,
  assignTicket,
  changeStatus,
  claimTicket,
  recordAction,
  reopenTicket,
  requestInformation,
  requestVerification,
  submitResolution,
} from "@/app/actions/admin-workflow";

type Member = {
  userId: string;
  email?: string;
  displayName?: string;
  role: "org_admin" | "support_agent" | "platform_admin";
};

type ResolutionValues = {
  rootCause: string;
  actionsPerformed: string;
  toolsUsed: string;
  result: string;
  verificationMethod:
    "user_confirmed" | "screen_shared" | "remote_test" | "other";
  userExplanation: string;
  preventiveRecommendation: string;
  verificationReason: string;
  verificationEvidence: string;
};

const initialResolution: ResolutionValues = {
  rootCause: "",
  actionsPerformed: "",
  toolsUsed: "",
  result: "",
  verificationMethod: "user_confirmed",
  userExplanation: "",
  preventiveRecommendation: "",
  verificationReason: "",
  verificationEvidence: "",
};

const fieldClass =
  "w-full rounded-2xl border border-border/70 bg-background/60 p-3 text-foreground backdrop-blur";
const buttonClass =
  "glass-pill px-4 py-2 disabled:cursor-not-allowed disabled:opacity-60";

export function TicketWorkflowActions({
  ticketId,
  canClaim,
  isAdmin,
  members,
  status,
  assignedAgentId,
  allowVerificationException = false,
}: {
  ticketId: string;
  canClaim: boolean;
  isAdmin: boolean;
  members: Member[];
  status: string;
  assignedAgentId?: string | null;
  allowVerificationException?: boolean;
}) {
  const [publicMessage, setPublicMessage] = useState("");
  const [internalMessage, setInternalMessage] = useState("");
  const [requestMessage, setRequestMessage] = useState("");
  const [verificationMessage, setVerificationMessage] = useState("");
  const [selectedAgent, setSelectedAgent] = useState(assignedAgentId ?? "");
  const [nextStatus, setNextStatus] = useState(
    ["In Progress", "Waiting for User", "Needs Human"].includes(status)
      ? status
      : "In Progress"
  );
  const [action, setAction] = useState({
    toolName: "",
    actionSummary: "",
    resultSummary: "",
    consentRequired: false,
    consentReceived: false,
    toolVersion: "",
    reason: "",
    parametersText: "",
    approvalType: "none" as const,
    startedAt: "",
    endedAt: "",
    verificationResult: "not_verified" as const,
    rollbackResult: "not_applicable" as const,
  });
  const [resolution, setResolution] = useState(initialResolution);
  const [resolutionError, setResolutionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{
    type: "error" | "success";
    text: string;
  } | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (
    operation: () => Promise<{ error: string } | { success: true }>
  ) => {
    startTransition(async () => {
      const result = await operation();
      setNotice(
        "error" in result
          ? { type: "error", text: result.error }
          : { type: "success", text: "Saved." }
      );
    });
  };

  const submitMessage = (
    event: FormEvent<HTMLFormElement>,
    operation: () => Promise<{ error: string } | { success: true }>,
    clear: () => void
  ) => {
    event.preventDefault();
    run(async () => {
      const result = await operation();
      if (!("error" in result)) clear();
      return result;
    });
  };

  const updateResolution = (key: keyof ResolutionValues, value: string) =>
    setResolution((current) => ({ ...current, [key]: value }));

  const submitResolutionForm = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setResolutionError(null);
    const missing = Object.entries(resolution).some(
      ([key, value]) =>
        ![
          "verificationMethod",
          "verificationReason",
          "verificationEvidence",
        ].includes(key) && !value.trim()
    );
    if (missing) {
      setResolutionError("Complete every resolution field.");
      return;
    }
    const report =
      resolution.verificationMethod === "user_confirmed"
        ? {
            ...resolution,
            verificationReason: undefined,
            verificationEvidence: undefined,
          }
        : resolution;
    run(() => submitResolution(ticketId, report));
  };

  return (
    <section className="glass mt-6 p-5">
      <h2 className="font-semibold">Employee actions</h2>
      {notice && (
        <p
          className="mt-3 rounded-2xl bg-muted/60 p-3 text-sm"
          role={notice.type === "error" ? "alert" : "status"}
        >
          {notice.text}
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-3">
        {canClaim && (
          <button
            type="button"
            onClick={() => run(() => claimTicket(ticketId))}
            disabled={pending}
            aria-busy={pending}
            className={buttonClass}
          >
            Claim ticket
          </button>
        )}
        {isAdmin && (
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (selectedAgent)
                run(() => assignTicket(ticketId, selectedAgent));
            }}
          >
            <label className="grid gap-1 text-sm" htmlFor="assign-agent">
              Assign employee
              <select
                id="assign-agent"
                value={selectedAgent}
                onChange={(event) => setSelectedAgent(event.target.value)}
                className={fieldClass}
              >
                <option value="">Select employee</option>
                {members.map((member) => (
                  <option key={member.userId} value={member.userId}>
                    {member.email ?? member.displayName ?? member.userId} —{" "}
                    {member.role === "org_admin"
                      ? "Org admin"
                      : member.role === "platform_admin"
                        ? "Platform admin"
                        : "Support agent"}
                  </option>
                ))}
              </select>
              {members.length === 0 && (
                <span className="text-xs text-muted-foreground">
                  No support staff yet. Invite them from the{" "}
                  <a
                    href="/admin/organization"
                    className="underline underline-offset-2"
                  >
                    Organization page
                  </a>
                  .
                </span>
              )}
            </label>
            <button
              type="submit"
              disabled={pending || !selectedAgent}
              aria-busy={pending}
              className={buttonClass}
            >
              Assign
            </button>
          </form>
        )}
        {(status === "Resolved" || status === "Closed") && (
          <button
            type="button"
            onClick={() => run(() => reopenTicket(ticketId))}
            disabled={pending}
            aria-busy={pending}
            className={buttonClass}
          >
            Reopen ticket
          </button>
        )}
      </div>

      <form
        className="mt-6 grid gap-3 border-t border-border pt-5"
        onSubmit={(event) =>
          submitMessage(
            event,
            () => addPublicComment(ticketId, publicMessage),
            () => setPublicMessage("")
          )
        }
      >
        <label htmlFor="public-comment" className="font-medium">
          Public comment — shown to the user
        </label>
        <textarea
          id="public-comment"
          value={publicMessage}
          onChange={(event) => setPublicMessage(event.target.value)}
          rows={3}
          className={fieldClass}
          required
        />
        <button
          type="submit"
          disabled={pending || !publicMessage.trim()}
          aria-busy={pending}
          className={buttonClass}
        >
          Add public comment
        </button>
      </form>

      <form
        className="mt-6 grid gap-3 border-t border-border pt-5"
        onSubmit={(event) =>
          submitMessage(
            event,
            () => addInternalNote(ticketId, internalMessage),
            () => setInternalMessage("")
          )
        }
      >
        <label htmlFor="internal-note" className="font-medium">
          Internal note — never shown to the user
        </label>
        <textarea
          id="internal-note"
          value={internalMessage}
          onChange={(event) => setInternalMessage(event.target.value)}
          rows={3}
          className={fieldClass}
          required
        />
        <Button
          type="submit"
          variant="secondary"
          disabled={pending || !internalMessage.trim()}
          aria-busy={pending}
        >
          Add internal note
        </Button>
      </form>

      <div className="mt-6 grid gap-6 border-t border-border pt-5">
        <form
          className="grid gap-3"
          onSubmit={(event) =>
            submitMessage(
              event,
              () => requestInformation(ticketId, requestMessage),
              () => setRequestMessage("")
            )
          }
        >
          <label htmlFor="request-information" className="font-medium">
            Request information
          </label>
          <textarea
            id="request-information"
            value={requestMessage}
            onChange={(event) => setRequestMessage(event.target.value)}
            rows={3}
            className={fieldClass}
            required
          />
          <button
            type="submit"
            disabled={pending || !requestMessage.trim()}
            aria-busy={pending}
            className={buttonClass}
          >
            Request information
          </button>
        </form>
        <form
          className="grid gap-3"
          onSubmit={(event) =>
            submitMessage(
              event,
              () => requestVerification(ticketId, verificationMessage),
              () => setVerificationMessage("")
            )
          }
        >
          <label htmlFor="request-verification" className="font-medium">
            Request verification
          </label>
          <textarea
            id="request-verification"
            value={verificationMessage}
            onChange={(event) => setVerificationMessage(event.target.value)}
            rows={3}
            className={fieldClass}
            required
          />
          <button
            type="submit"
            disabled={pending || !verificationMessage.trim()}
            aria-busy={pending}
            className={buttonClass}
          >
            Request verification
          </button>
        </form>
      </div>

      <form
        className="mt-6 grid gap-3 border-t border-border pt-5"
        onSubmit={(event) => {
          event.preventDefault();
          run(() => changeStatus(ticketId, nextStatus));
        }}
      >
        <label htmlFor="workflow-status" className="font-medium">
          Change status
        </label>
        <div className="flex flex-wrap gap-3">
          <select
            id="workflow-status"
            value={nextStatus}
            onChange={(event) => setNextStatus(event.target.value)}
            className={fieldClass}
          >
            <option>In Progress</option>
            <option>Waiting for User</option>
            <option>Needs Human</option>
          </select>
          <button
            type="submit"
            disabled={pending}
            aria-busy={pending}
            className={buttonClass}
          >
            Change status
          </button>
        </div>
      </form>

      <form
        className="mt-6 grid gap-3 border-t border-border pt-5"
        onSubmit={(event) => {
          event.preventDefault();
          run(async () => {
            const parameters = Object.fromEntries(
              action.parametersText
                .split("\n")
                .map((line) => line.split("="))
                .filter(([key, value]) => key?.trim() && value !== undefined)
                .map(([key, ...value]) => [key.trim(), value.join("=").trim()])
            );
            const result = await recordAction({
              ticketId,
              toolName: action.toolName,
              actionSummary: action.actionSummary,
              resultSummary: action.resultSummary,
              consentRequired: action.consentRequired,
              consentReceived: action.consentReceived,
              toolVersion: action.toolVersion || undefined,
              reason: action.reason || undefined,
              parameters,
              approvalType: action.approvalType,
              startedAt: action.startedAt
                ? new Date(action.startedAt).toISOString()
                : undefined,
              endedAt: action.endedAt
                ? new Date(action.endedAt).toISOString()
                : undefined,
              verificationResult: action.verificationResult,
              rollbackResult: action.rollbackResult,
            });
            if (!("error" in result)) {
              setAction({
                toolName: "",
                actionSummary: "",
                resultSummary: "",
                consentRequired: false,
                consentReceived: false,
                toolVersion: "",
                reason: "",
                parametersText: "",
                approvalType: "none",
                startedAt: "",
                endedAt: "",
                verificationResult: "not_verified",
                rollbackResult: "not_applicable",
              });
            }
            return result;
          });
        }}
      >
        <h3 className="font-medium">Record tool or action</h3>
        <label htmlFor="tool-name">Tool name</label>
        <input
          id="tool-name"
          value={action.toolName}
          onChange={(event) =>
            setAction({ ...action, toolName: event.target.value })
          }
          placeholder="Microsoft 365 Service Health"
          className={fieldClass}
          required
        />
        <label htmlFor="action-summary">Action performed</label>
        <textarea
          id="action-summary"
          value={action.actionSummary}
          onChange={(event) =>
            setAction({ ...action, actionSummary: event.target.value })
          }
          placeholder="Checked Outlook service availability."
          className={fieldClass}
          required
        />
        <label htmlFor="result-summary">Result</label>
        <textarea
          id="result-summary"
          value={action.resultSummary}
          onChange={(event) =>
            setAction({ ...action, resultSummary: event.target.value })
          }
          placeholder="No organization-wide outage found."
          className={fieldClass}
          required
        />
        <label className="flex items-center gap-2" htmlFor="consent-required">
          <input
            id="consent-required"
            type="checkbox"
            checked={action.consentRequired}
            onChange={(event) =>
              setAction({ ...action, consentRequired: event.target.checked })
            }
          />
          Consent required
        </label>
        <label className="flex items-center gap-2" htmlFor="consent-received">
          <input
            id="consent-received"
            type="checkbox"
            checked={action.consentReceived}
            onChange={(event) =>
              setAction({ ...action, consentReceived: event.target.checked })
            }
          />
          Consent received
        </label>
        <details className="rounded-2xl border border-border/70 p-3">
          <summary className="cursor-pointer font-medium">Details</summary>
          <div className="mt-3 grid gap-3">
            <label htmlFor="tool-version">Tool version</label>
            <input
              id="tool-version"
              value={action.toolVersion}
              onChange={(event) =>
                setAction({ ...action, toolVersion: event.target.value })
              }
              className={fieldClass}
            />
            <label htmlFor="action-reason">Reason</label>
            <textarea
              id="action-reason"
              value={action.reason}
              onChange={(event) =>
                setAction({ ...action, reason: event.target.value })
              }
              className={fieldClass}
            />
            <label htmlFor="approval-type">Approval type</label>
            <select
              id="approval-type"
              value={action.approvalType}
              onChange={(event) =>
                setAction({
                  ...action,
                  approvalType: event.target
                    .value as typeof action.approvalType,
                })
              }
              className={fieldClass}
            >
              <option value="none">None</option>
              <option value="user_consent">User consent</option>
              <option value="employee_approval">Employee approval</option>
            </select>
            <label htmlFor="action-parameters">
              Parameters (one key=value per line)
            </label>
            <textarea
              id="action-parameters"
              value={action.parametersText}
              onChange={(event) =>
                setAction({ ...action, parametersText: event.target.value })
              }
              className={fieldClass}
            />
            <label htmlFor="started-at">Started at</label>
            <input
              id="started-at"
              type="datetime-local"
              value={action.startedAt}
              onChange={(event) =>
                setAction({ ...action, startedAt: event.target.value })
              }
              className={fieldClass}
            />
            <label htmlFor="ended-at">Ended at</label>
            <input
              id="ended-at"
              type="datetime-local"
              value={action.endedAt}
              onChange={(event) =>
                setAction({ ...action, endedAt: event.target.value })
              }
              className={fieldClass}
            />
            <label htmlFor="verification-result">Verification result</label>
            <select
              id="verification-result"
              value={action.verificationResult}
              onChange={(event) =>
                setAction({
                  ...action,
                  verificationResult: event.target
                    .value as typeof action.verificationResult,
                })
              }
              className={fieldClass}
            >
              <option value="not_verified">Not verified</option>
              <option value="passed">Passed</option>
              <option value="failed">Failed</option>
            </select>
            <label htmlFor="rollback-result">Rollback result</label>
            <select
              id="rollback-result"
              value={action.rollbackResult}
              onChange={(event) =>
                setAction({
                  ...action,
                  rollbackResult: event.target
                    .value as typeof action.rollbackResult,
                })
              }
              className={fieldClass}
            >
              <option value="not_applicable">Not applicable</option>
              <option value="succeeded">Succeeded</option>
              <option value="failed">Failed</option>
            </select>
          </div>
        </details>
        <button
          type="submit"
          disabled={pending}
          aria-busy={pending}
          className={buttonClass}
        >
          Record action
        </button>
      </form>

      <form
        className="mt-6 grid gap-3 border-t border-border pt-5"
        onSubmit={submitResolutionForm}
      >
        <h3 className="font-medium">Resolution report</h3>
        {resolutionError && (
          <p role="alert" className="rounded-md bg-red-50 p-3 text-red-800">
            {resolutionError}
          </p>
        )}
        <label htmlFor="root-cause">Root cause</label>
        <textarea
          id="root-cause"
          value={resolution.rootCause}
          onChange={(event) =>
            updateResolution("rootCause", event.target.value)
          }
          className={fieldClass}
          required
        />
        <label htmlFor="actions-performed">Actions performed</label>
        <textarea
          id="actions-performed"
          value={resolution.actionsPerformed}
          onChange={(event) =>
            updateResolution("actionsPerformed", event.target.value)
          }
          className={fieldClass}
          required
        />
        <label htmlFor="tools-used">Tools used</label>
        <textarea
          id="tools-used"
          value={resolution.toolsUsed}
          onChange={(event) =>
            updateResolution("toolsUsed", event.target.value)
          }
          className={fieldClass}
          required
        />
        <label htmlFor="resolution-result">Result</label>
        <textarea
          id="resolution-result"
          value={resolution.result}
          onChange={(event) => updateResolution("result", event.target.value)}
          className={fieldClass}
          required
        />
        <label htmlFor="verification-method">Verification method</label>
        <select
          id="verification-method"
          value={resolution.verificationMethod}
          onChange={(event) =>
            updateResolution("verificationMethod", event.target.value)
          }
          className={fieldClass}
        >
          <option value="user_confirmed">User confirmed</option>
          <option value="screen_shared">Screen shared</option>
          <option value="remote_test">Remote test</option>
          <option value="other">Other</option>
        </select>
        {resolution.verificationMethod !== "user_confirmed" && (
          <>
            <p className="rounded-2xl bg-amber-500/10 p-3 text-sm">
              Allowed only when your organization permits verification
              exceptions
            </p>
            <label htmlFor="verification-reason">Verification reason</label>
            <textarea
              id="verification-reason"
              value={resolution.verificationReason}
              onChange={(event) =>
                updateResolution("verificationReason", event.target.value)
              }
              className={fieldClass}
              required={allowVerificationException}
            />
            <label htmlFor="verification-evidence">Verification evidence</label>
            <textarea
              id="verification-evidence"
              value={resolution.verificationEvidence}
              onChange={(event) =>
                updateResolution("verificationEvidence", event.target.value)
              }
              className={fieldClass}
              required={allowVerificationException}
            />
          </>
        )}
        <label htmlFor="user-explanation">User explanation</label>
        <textarea
          id="user-explanation"
          value={resolution.userExplanation}
          onChange={(event) =>
            updateResolution("userExplanation", event.target.value)
          }
          className={fieldClass}
          required
        />
        <label htmlFor="preventive-recommendation">
          Preventive recommendation
        </label>
        <textarea
          id="preventive-recommendation"
          value={resolution.preventiveRecommendation}
          onChange={(event) =>
            updateResolution("preventiveRecommendation", event.target.value)
          }
          className={fieldClass}
          required
        />
        <button
          type="submit"
          disabled={pending}
          aria-busy={pending}
          className={buttonClass}
        >
          Submit resolution
        </button>
      </form>
    </section>
  );
}
