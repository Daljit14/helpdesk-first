"use client";

import { useState, useTransition } from "react";
import { upsertDeviceConsentPolicyAction } from "@/app/actions/admin-devices";

export function DeviceConsentPolicyForm({
  deviceClass,
  category,
  enabled,
}: {
  deviceClass: "managed" | "byod";
  category: "network" | "security" | "endpoint" | "peripheral";
  enabled: boolean;
}) {
  const [checked, setChecked] = useState(enabled);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  return (
    <label
      className={`hf-adm-row flex cursor-pointer items-center gap-3 rounded-2xl border p-3 text-sm font-bold transition-colors hover:border-primary/40 ${
        checked
          ? "border-status-success/40 bg-status-success/10"
          : "border-border bg-card/60"
      }`}
    >
      <input
        type="checkbox"
        className="h-4 w-4 accent-primary"
        checked={checked}
        disabled={pending}
        onChange={(event) => {
          const value = event.target.checked;
          const previous = checked;
          setChecked(value);
          startTransition(async () => {
            const result = await upsertDeviceConsentPolicyAction({
              deviceClass,
              category,
              autoApprove: value,
            });
            if ("error" in result) {
              setChecked(previous);
              setMessage(result.error ?? "Failed");
            } else {
              setChecked(value);
              setMessage("Saved");
            }
          });
        }}
      />
      <span className="flex-1">
        {deviceClass} · {category}
      </span>
      {message && (
        <span className="hf-swap text-xs font-semibold text-muted-foreground">
          {message}
        </span>
      )}
    </label>
  );
}
