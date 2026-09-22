"use client";

import { useActionState, useState } from "react";
import { createEnrollmentTokenAction } from "@/app/actions/admin-devices";

type State =
  | null
  | { error: string }
  | { success: true; token: string; expiresAt: string };

const initialState: State = null;
const fieldClass =
  "mt-1 block w-full rounded-2xl border border-border/70 bg-background/60 p-2 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring";

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
    <div className="glass-strong grid gap-4 p-5">
      <div>
        <h2 className="font-semibold">Enroll a device</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          The enrollment token is shown only once.
        </p>
      </div>
      <form action={action} className="grid gap-4">
        <label
          className="grid gap-2 text-sm font-medium"
          htmlFor="device-label"
        >
          Label
          <input
            id="device-label"
            name="label"
            required
            maxLength={200}
            className={fieldClass}
          />
        </label>
        <label
          className="grid gap-2 text-sm font-medium"
          htmlFor="device-class"
        >
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
          <label className="grid gap-2 text-sm font-medium" htmlFor="token-ttl">
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
          <label
            className="grid gap-2 text-sm font-medium"
            htmlFor="token-uses"
          >
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
            className="rounded-2xl bg-destructive/10 p-3 text-sm text-destructive"
          >
            {state.error}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="glass-pill w-fit px-4 py-2"
        >
          {pending ? "Creating…" : "Create enrollment token"}
        </button>
      </form>
      {state && "success" in state && (
        <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4">
          <p className="text-sm font-medium">Copy this token now</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <code className="min-w-0 flex-1 break-all rounded-xl bg-background/70 p-3 text-sm">
              {state.token}
            </code>
            <button
              type="button"
              className="glass-pill px-3 py-2"
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
