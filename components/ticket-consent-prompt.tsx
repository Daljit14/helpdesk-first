"use client";

import { useState, useTransition } from "react";
import { respondToAiConsent } from "@/app/actions/resolution";

export function TicketConsentPrompt({
  request,
}: {
  request: {
    id: string;
    capabilityId: string;
    capabilityVersion: number;
    riskLevel: string;
    expiresAt: string | null;
  };
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  function respond(decision: "grant" | "deny") {
    startTransition(async () => {
      const result = await respondToAiConsent(request.id, decision);
      setMessage(
        "error" in result
          ? result.error
          : decision === "grant"
            ? "Consent granted."
            : "Consent declined."
      );
    });
  }
  return (
    <section className="glass mt-6 space-y-3 p-5">
      <h2 className="font-semibold">Your approval is needed</h2>
      <p className="text-sm text-muted-foreground">
        Allow capability {request.capabilityId}@{request.capabilityVersion}{" "}
        (risk: {request.riskLevel})?
      </p>
      {request.expiresAt && (
        <p className="text-xs text-muted-foreground">
          Expires {new Date(request.expiresAt).toLocaleString()}
        </p>
      )}
      <div className="flex gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={() => respond("grant")}
          className="rounded-xl bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
        >
          Allow
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => respond("deny")}
          className="rounded-xl border px-4 py-2 disabled:opacity-50"
        >
          Decline
        </button>
      </div>
      <p
        role="status"
        aria-live="polite"
        className="text-sm text-muted-foreground"
      >
        {message}
      </p>
    </section>
  );
}
