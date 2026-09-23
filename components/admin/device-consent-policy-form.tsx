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
    <label className="flex items-center gap-2 rounded-xl border border-border/60 p-3 text-sm">
      <input
        type="checkbox"
        checked={checked}
        disabled={pending}
        onChange={(event) => {
          const value = event.target.checked;
          setChecked(value);
          startTransition(async () => {
            const result = await upsertDeviceConsentPolicyAction({
              deviceClass,
              category,
              autoApprove: value,
            });
            setMessage(
              "error" in result ? (result.error ?? "Failed") : "Saved"
            );
          });
        }}
      />
      <span className="flex-1">
        {deviceClass} · {category}
      </span>
      {message && (
        <span className="text-xs text-muted-foreground">{message}</span>
      )}
    </label>
  );
}
