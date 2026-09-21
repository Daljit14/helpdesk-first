"use client";

import { useState } from "react";
import { claimDeviceAction } from "@/app/actions/device-claim";

export function DeviceClaimForm() {
  const [message, setMessage] = useState("");
  return (
    <form
      className="mt-6 grid gap-3"
      action={async (form) => {
        const result = await claimDeviceAction(
          String(form.get("code") ?? "").toLowerCase(),
          String(form.get("shortId") ?? "").toLowerCase()
        );
        setMessage("error" in result ? result.error : "Device claimed.");
      }}
    >
      <input
        className="rounded border p-3"
        name="shortId"
        placeholder="Short device ID"
        maxLength={8}
        required
      />
      <input
        className="rounded border p-3"
        name="code"
        placeholder="Claim code"
        maxLength={8}
        required
      />
      <button className="rounded border px-3 py-2" type="submit">
        Claim device
      </button>
      {message && <p className="text-sm">{message}</p>}
    </form>
  );
}
