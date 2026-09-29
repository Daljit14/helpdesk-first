"use client";

import { useActionState, useState } from "react";
import { KeyRound } from "lucide-react";
import { createEnrollmentTokenAction } from "@/app/actions/admin-devices";

type State =
  | null
  | { error: string }
  | { success: true; token: string; expiresAt: string };

const initialState: State = null;
const fieldClass =
  "block h-10 w-full min-w-0 rounded-xl border border-border bg-card px-3 text-sm font-semibold text-foreground shadow-sm transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const labelClass = "grid gap-1.5 text-sm font-bold";
const PRIMARY_BUTTON =
  "inline-flex h-10 w-fit items-center gap-2 rounded-xl bg-primary px-4 text-sm font-extrabold text-primary-foreground shadow-sm transition-transform hover:-translate-y-px disabled:opacity-60";

export function DeviceEnrollmentForm() {
  const [state, action, pending] = useActionState(
    async (_previous: State, formData: FormData): Promise<State> => {
      const result = await createEnrollmentTokenAction({
        deviceClass: String(formData.get("deviceClass") ?? "managed"),
        label: String(formData.get("label") ?? ""),
        ttlHours: Number(formData.get("ttlHours") ?? 24),
        maxUses: Number(formData.get("maxUses") ?? 1),
      });
      return "error" in result
        ? { error: result.error ?? "Unable to create enrollment token." }
        : {
            success: true,
            token: result.token,
            expiresAt: result.expiresAt,
          };
    },
    initialState
  );
  const [copied, setCopied] = useState(false);

  return (
    <div className="glass hf-rise grid gap-4 p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
          <KeyRound className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="text-lg font-extrabold">Enroll a device</h2>
          <p className="text-sm text-muted-foreground">
            The enrollment token is shown only once.
          </p>
        </div>
      </div>
      <form action={action} className="grid gap-4">
        <label className={labelClass} htmlFor="device-label">
          Label
          <input
            id="device-label"
            name="label"
            required
            maxLength={200}
            className={fieldClass}
          />
        </label>
        <label className={labelClass} htmlFor="device-class">
          Device class
          <select
            id="device-class"
            name="deviceClass"
            defaultValue="managed"
            className={fieldClass}
          >
            <option value="managed">Managed</option>
            <option value="byod">BYOD</option>
          </select>
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className={labelClass} htmlFor="token-ttl">
            TTL hours
            <input
              id="token-ttl"
              name="ttlHours"
              type="number"
              min={1}
              max={168}
              defaultValue={24}
              className={fieldClass}
            />
          </label>
          <label className={labelClass} htmlFor="token-uses">
            Maximum uses
            <input
              id="token-uses"
              name="maxUses"
              type="number"
              min={1}
              max={50}
              defaultValue={1}
              className={fieldClass}
            />
          </label>
        </div>
        {state && "error" in state && (
          <p
            role="alert"
            className="hf-swap rounded-2xl border border-status-danger/30 bg-status-danger/10 p-3 text-sm font-bold text-status-danger"
          >
            {state.error}
          </p>
        )}
        <button type="submit" disabled={pending} className={PRIMARY_BUTTON}>
          <KeyRound className="h-4 w-4" aria-hidden />
          {pending ? "Creating…" : "Create enrollment token"}
        </button>
      </form>
      {state && "success" in state && (
        <div className="hf-swap rounded-2xl border border-status-success/40 bg-status-success/10 p-4">
          <p className="text-sm font-extrabold text-status-success">
            Copy this token now
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <code className="min-w-0 flex-1 break-all rounded-xl border border-border bg-card p-3 font-mono text-sm">
              {state.token}
            </code>
            <button
              type="button"
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-card px-3.5 text-sm font-extrabold shadow-sm transition-colors hover:border-primary/40"
              onClick={() => {
                void navigator.clipboard.writeText(state.token);
                setCopied(true);
              }}
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Expires {new Date(state.expiresAt).toLocaleString()}
          </p>
        </div>
      )}
    </div>
  );
}
