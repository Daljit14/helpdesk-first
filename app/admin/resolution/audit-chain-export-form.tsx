"use client";

import { useState, type FormEvent } from "react";
import { Download, FileCheck2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Panel } from "@/components/admin/ui/admin-kit";
import { exportAuditChain } from "@/app/actions/admin-audit-chain";

export function AuditChainExportForm() {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    const formData = new FormData(event.currentTarget);
    try {
      const result = await exportAuditChain({
        from: String(formData.get("from") ?? ""),
        to: String(formData.get("to") ?? ""),
      });
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      const url = URL.createObjectURL(
        new Blob([result.content], { type: "application/x-ndjson" })
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = result.filename;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      setMessage("Audit record downloaded.");
    } catch {
      setMessage("Audit chain export failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Panel
      title="Download audit record"
      description="Export a verifiable JSONL record for a date range."
      icon={FileCheck2}
    >
      <form className="flex flex-wrap items-end gap-4" onSubmit={handleSubmit}>
        <div className="grid gap-2">
          <Label htmlFor="audit-chain-from">From</Label>
          <Input
            id="audit-chain-from"
            name="from"
            type="date"
            required
            className="h-10 w-44 rounded-xl"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="audit-chain-to">To</Label>
          <Input
            id="audit-chain-to"
            name="to"
            type="date"
            required
            className="h-10 w-44 rounded-xl"
          />
        </div>
        <Button type="submit" disabled={pending}>
          <Download aria-hidden="true" />
          {pending ? "Preparing…" : "Download audit record"}
        </Button>
      </form>
      {message && (
        <p className="mt-3 text-sm font-semibold" aria-live="polite">
          {message}
        </p>
      )}
    </Panel>
  );
}
