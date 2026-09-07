"use client";

import { useState, useTransition } from "react";
import { adminUpdateAttachmentPolicy } from "@/app/actions/admin-attachments";
import type { AttachmentPolicy } from "@/lib/attachments/policy";

export function AttachmentPolicyForm({
  organizationId,
  policy,
}: {
  organizationId: string;
  policy: AttachmentPolicy;
}) {
  const [values, setValues] = useState(policy);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const result = await adminUpdateAttachmentPolicy(organizationId, values);
      setNotice("error" in result ? result.error : "Attachment policy saved.");
    });
  }

  return (
    <form
      onSubmit={save}
      className="glass-strong grid gap-4 p-5 sm:grid-cols-2"
    >
      <label className="grid gap-1 text-sm">
        Max files per ticket
        <input
          type="number"
          min={1}
          max={50}
          value={values.maxFilesPerTicket}
          onChange={(event) =>
            setValues((current) => ({
              ...current,
              maxFilesPerTicket: Number(event.target.value),
            }))
          }
          className="rounded-xl border border-border/60 bg-background/50 p-2"
        />
      </label>
      <label className="grid gap-1 text-sm">
        Max file bytes
        <input
          type="number"
          min={1}
          max={100 * 1024 * 1024}
          value={values.maxFileBytes}
          onChange={(event) =>
            setValues((current) => ({
              ...current,
              maxFileBytes: Number(event.target.value),
            }))
          }
          className="rounded-xl border border-border/60 bg-background/50 p-2"
        />
      </label>
      <label className="grid gap-1 text-sm">
        Max total bytes
        <input
          type="number"
          min={1}
          max={1024 * 1024 * 1024}
          value={values.maxTotalBytes}
          onChange={(event) =>
            setValues((current) => ({
              ...current,
              maxTotalBytes: Number(event.target.value),
            }))
          }
          className="rounded-xl border border-border/60 bg-background/50 p-2"
        />
      </label>
      <label className="grid gap-1 text-sm">
        Retention days
        <input
          type="number"
          min={1}
          max={3650}
          value={values.retentionDays}
          onChange={(event) =>
            setValues((current) => ({
              ...current,
              retentionDays: Number(event.target.value),
            }))
          }
          className="rounded-xl border border-border/60 bg-background/50 p-2"
        />
      </label>
      <div className="flex items-center gap-3 sm:col-span-2">
        <button
          type="submit"
          disabled={pending}
          className="glass-pill px-4 py-2"
        >
          {pending ? "Saving…" : "Save policy"}
        </button>
        {notice && (
          <span className="text-sm text-muted-foreground">{notice}</span>
        )}
      </div>
    </form>
  );
}
