"use client";

import { useState, useTransition } from "react";
import { acceptInvitationAction } from "@/app/actions/organizations";

export function AcceptInvitation({ token }: { token: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="glass-strong grid gap-4 p-8">
      <h1 className="text-2xl font-semibold">Join your organization</h1>
      <p className="text-sm text-muted-foreground">
        Accept this invitation to join HelpDesk First.
      </p>
      <button
        type="button"
        disabled={pending}
        className="glass-pill px-4 py-2"
        onClick={() =>
          startTransition(async () => {
            const result = await acceptInvitationAction(token);
            if ("error" in result && typeof result.error === "string") {
              setError(result.error);
              return;
            }
            const role = "role" in result ? result.role : null;
            window.location.assign(
              role === "requester" ? "/tickets" : "/admin"
            );
          })
        }
      >
        {pending ? "Joining…" : "Accept invitation"}
      </button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
