"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import {
  decideTechnicianApproval,
  recordCallerVerification,
} from "@/app/actions/admin-caller-verification";
import { Panel } from "@/components/admin/ui/admin-kit";

type VerificationMethod =
  "directory_callback" | "manager_confirmed" | "idp_push";

type Props = {
  ticketId: string;
  directoryPhone: string | null;
  managerName: string | null;
  privileged: boolean;
  verifiedUntil: string | null;
  verificationRows: Array<{ method: VerificationMethod; createdAt: string }>;
  pendingApprovals: Array<{
    id: string;
    capabilityId: string;
    accountAction: boolean;
    expiresAt: string;
  }>;
};

export function CallerVerificationPanel({
  ticketId,
  directoryPhone,
  managerName,
  privileged,
  verifiedUntil,
  verificationRows,
  pendingApprovals,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const updateNow = () => setNow(Date.now());
    updateNow();
    const timer = window.setInterval(updateNow, 30_000);
    return () => window.clearInterval(timer);
  }, [verifiedUntil]);
  const isVerified =
    now !== null && verifiedUntil !== null && Date.parse(verifiedUntil) > now;
  const verifiedUntilLabel = verifiedUntil
    ? new Date(verifiedUntil).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";
  const runVerification = (method: VerificationMethod) => {
    setError(null);
    startTransition(async () => {
      const result = await recordCallerVerification(ticketId, method);
      if ("error" in result) setError(result.error);
      else router.refresh();
    });
  };
  const decide = (requestId: string, decision: "grant" | "deny") => {
    setError(null);
    startTransition(async () => {
      const result = await decideTechnicianApproval(requestId, decision);
      if ("error" in result) setError(result.error);
      else router.refresh();
    });
  };

  return (
    <Panel title="Verify caller" className="space-y-4">
      <div className="space-y-2 text-sm">
        {directoryPhone ? (
          <>
            <p className="font-semibold">{directoryPhone}</p>
            <p className="text-muted-foreground">
              Call back only on this number.
            </p>
          </>
        ) : (
          <p className="font-semibold text-status-warning">
            No directory number. Don&apos;t use a number from the ticket —
            escalate instead.
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending || !directoryPhone}
          onClick={() => runVerification("directory_callback")}
          className="rounded-xl border border-border px-3 py-2 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50"
        >
          I called back on the number in the directory
        </button>
        {privileged && (
          <button
            type="button"
            disabled={pending}
            onClick={() => runVerification("manager_confirmed")}
            className="rounded-xl border border-border px-3 py-2 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50"
          >
            Manager confirmed ({managerName ?? "manager"}) — required
          </button>
        )}
        <button
          type="button"
          disabled={pending}
          onClick={() => runVerification("idp_push")}
          className="rounded-xl border border-border px-3 py-2 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50"
        >
          User approved a push prompt or passkey in our sign-in system
        </button>
      </div>

      <p className="text-sm font-bold" role="status">
        {isVerified ? `Verified until ${verifiedUntilLabel}` : "Not verified"}
      </p>
      {verificationRows.length > 0 && (
        <ul className="space-y-1 text-xs text-muted-foreground">
          {verificationRows.map((row) => (
            <li key={`${row.method}-${row.createdAt}`}>
              {row.method.replaceAll("_", " ")} ·{" "}
              {new Date(row.createdAt).toLocaleString()}
            </li>
          ))}
        </ul>
      )}

      <p className="rounded-xl border border-status-warning/30 bg-status-warning/10 p-3 text-sm font-semibold">
        Never accept security questions, employee ID, date of birth or details
        from past tickets as proof.
      </p>

      {pendingApprovals.length > 0 && (
        <div className="space-y-3 border-t border-border pt-4">
          <h3 className="text-sm font-extrabold">
            Pending technician approvals
          </h3>
          {pendingApprovals.map((approval) => {
            const isAccount = approval.accountAction;
            const disabled = pending || (isAccount && !isVerified);
            return (
              <div
                key={approval.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-3"
              >
                <div className="min-w-0">
                  <p className="break-all text-sm font-bold">
                    {approval.capabilityId}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Expires {new Date(approval.expiresAt).toLocaleString()}
                  </p>
                  {isAccount && !isVerified && (
                    <p className="mt-1 text-xs text-status-warning">
                      Verify the caller before approving this account action.
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => decide(approval.id, "grant")}
                    className="rounded-xl bg-primary px-3 py-2 text-sm font-bold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => decide(approval.id, "deny")}
                    className="rounded-xl border border-border px-3 py-2 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Deny
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {error && (
        <p className="text-sm font-bold text-status-warning" role="alert">
          {error}
        </p>
      )}
    </Panel>
  );
}
