"use client";

import { useState, useTransition } from "react";
import { Building2, CheckCircle2, Globe2 } from "lucide-react";
import { createOrganization } from "@/app/actions/organizations";
import { EmptyState, Panel } from "@/components/admin/ui/admin-kit";

const FIELD =
  "h-10 w-full min-w-0 rounded-xl border border-border bg-card px-3 text-sm font-semibold text-foreground shadow-sm transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const PRIMARY_BUTTON =
  "inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-extrabold text-primary-foreground shadow-sm transition-transform hover:-translate-y-px disabled:opacity-60";

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

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
    <div className="grid gap-5">
      <Panel
        title="Create organization"
        description="Add a new tenant and optionally invite its first owner."
        icon={Building2}
        delay={0.1}
      >
        <form
          className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
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
            className={FIELD}
            required
          />
          <input
            value={ownerEmail}
            onChange={(event) => setOwnerEmail(event.target.value)}
            type="email"
            placeholder="Owner email (optional)"
            className={FIELD}
          />
          <button disabled={pending} className={PRIMARY_BUTTON}>
            <Building2 className="h-4 w-4" aria-hidden />
            {pending ? "Creating…" : "Create organization"}
          </button>
          {notice && (
            <p
              role="status"
              className="hf-swap flex items-center gap-2 break-all rounded-2xl border border-primary/30 bg-secondary/60 p-3 text-sm font-bold sm:col-span-3"
            >
              <CheckCircle2
                className="h-4 w-4 shrink-0 text-primary"
                aria-hidden
              />
              {notice}
            </p>
          )}
        </form>
      </Panel>
      <Panel
        title="All organizations"
        description={`${organizations.length} ${organizations.length === 1 ? "organization" : "organizations"}, newest first`}
        icon={Globe2}
        delay={0.15}
        flush
      >
        {organizations.length === 0 ? (
          <EmptyState
            icon={Building2}
            title="No organizations yet"
            body="Create the first organization above."
          />
        ) : (
          <ul className="divide-y divide-border">
            {organizations.map((organization) => (
              <li
                key={organization.id}
                className="hf-adm-row flex flex-wrap items-center justify-between gap-3 px-5 py-3 sm:px-6"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-sm font-extrabold uppercase text-secondary-foreground">
                    {organization.name.slice(0, 1)}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-extrabold">
                      {organization.name}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      Created {formatDate(organization.created_at)}
                    </span>
                  </span>
                </span>
                <span className="font-mono text-xs text-muted-foreground">
                  {organization.id}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
