"use client";

import { useState, useTransition } from "react";
import { adminUpdateAttachmentPolicy } from "@/app/actions/admin-attachments";
import type { AttachmentPolicy } from "@/lib/attachments/policy";
import { ShieldCheck } from "lucide-react";

const FIELD =
  "h-10 w-full min-w-0 rounded-xl border border-border bg-card px-3 text-sm font-semibold text-foreground shadow-sm transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const PRIMARY_BUTTON =
  "inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-extrabold text-primary-foreground shadow-sm transition-transform hover:-translate-y-px disabled:opacity-60";

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
    <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
      <label className="grid gap-1.5 text-sm font-bold">
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
          className={FIELD}
        />
      </label>
      <label className="grid gap-1.5 text-sm font-bold">
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
          className={FIELD}
        />
      </label>
      <label className="grid gap-1.5 text-sm font-bold">
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
          className={FIELD}
        />
      </label>
      <label className="grid gap-1.5 text-sm font-bold">
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
          className={FIELD}
        />
      </label>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <button type="submit" disabled={pending} className={PRIMARY_BUTTON}>
          <ShieldCheck className="h-4 w-4" aria-hidden />
          {pending ? "Saving…" : "Save policy"}
        </button>
        {notice && (
          <span
            role="status"
            className="hf-swap text-sm font-bold text-muted-foreground"
          >
            {notice}
          </span>
        )}
      </div>
    </form>
  );
}
