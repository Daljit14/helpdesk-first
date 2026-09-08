"use client";

import { useState, useTransition } from "react";
import { createOrganization } from "@/app/actions/organizations";

export function PlatformOrganizationsPanel({
  organizations,
}: {
  organizations: { id: string; name: string; created_at: string }[];
}) {
  const [name, setName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="grid gap-6">
      <form
        className="glass-strong grid gap-3 p-5 sm:grid-cols-3"
        onSubmit={(event) => {
          event.preventDefault();
          startTransition(async () => {
            const result = await createOrganization({
              name,
              ownerEmail: ownerEmail || undefined,
            });
            const inviteUrl =
              "inviteUrl" in result && typeof result.inviteUrl === "string"
                ? result.inviteUrl
                : null;
            setNotice(
              "error" in result && typeof result.error === "string"
                ? result.error
                : inviteUrl
                  ? `Invite link: ${inviteUrl}`
                  : "Organization created."
            );
          });
        }}
      >
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Organization name"
          className="rounded-xl border border-border/60 bg-background/50 p-2"
          required
        />
        <input
          value={ownerEmail}
          onChange={(event) => setOwnerEmail(event.target.value)}
          type="email"
          placeholder="Owner email (optional)"
          className="rounded-xl border border-border/60 bg-background/50 p-2"
        />
        <button disabled={pending} className="glass-pill px-4 py-2">
          {pending ? "Creating…" : "Create organization"}
        </button>
        {notice && <p className="text-sm sm:col-span-3">{notice}</p>}
      </form>
      <ul className="glass-strong grid gap-2 p-5">
        {organizations.map((organization) => (
          <li
            key={organization.id}
            className="flex justify-between border-b border-border/50 py-2 last:border-0"
          >
            <span>{organization.name}</span>
            <span className="text-xs text-muted-foreground">
              {organization.id}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
