"use client";

import { useState, useTransition } from "react";
import {
  addDomain,
  inviteMember,
  removeMember,
  revokeInvitation,
  updateMemberRole,
  verifyDomain,
} from "@/app/actions/organizations";
import { updateOrganizationPolicy } from "@/app/actions/admin-workflow";
import type { SlaTargets } from "@/lib/tickets/sla";

type Member = { user_id: string; role: string; joined_via: string | null };
type Domain = {
  id: string;
  domain: string;
  verified: boolean;
  verification_token: string;
};
type Invitation = {
  id: string;
  email: string;
  role: string;
  expires_at: string;
};

export function OrganizationPanel({
  organizationName,
  allowVerificationException,
  slaTargets,
  timezone,
  members,
  domains,
  invitations,
}: {
  organizationName: string;
  allowVerificationException: boolean;
  slaTargets: SlaTargets;
  timezone: string;
  members: Member[];
  domains: Domain[];
  invitations: Invitation[];
}) {
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);
  const [domain, setDomain] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("requester");
  const [allowExceptions, setAllowExceptions] = useState(
    allowVerificationException
  );
  const [targets, setTargets] = useState(slaTargets);
  const [policyTimezone, setPolicyTimezone] = useState(timezone);

  function run(
    action: () => Promise<
      { error: string } | { success: true; [key: string]: unknown }
    >
  ) {
    startTransition(async () => {
      const result = await action();
      if ("error" in result && typeof result.error === "string")
        setNotice(result.error);
      else {
        const inviteUrl = "inviteUrl" in result ? result.inviteUrl : null;
        setNotice(
          typeof inviteUrl === "string" ? `Invite link: ${inviteUrl}` : "Saved."
        );
      }
    });
  }

  function savePolicy() {
    run(() =>
      updateOrganizationPolicy(allowExceptions, targets, policyTimezone)
    );
  }

  return (
    <div className="grid gap-6">
      {notice && <p className="rounded-2xl bg-muted p-3 text-sm">{notice}</p>}
      <section className="glass-strong grid gap-2 p-5">
        <h2 className="text-xl font-semibold">{organizationName}</h2>
        <p className="text-sm text-muted-foreground">
          Organization admins manage members and verified email domains. Shared
          staff credentials are prohibited.
        </p>
        <p className="text-sm text-muted-foreground">
          Requesters submit tickets. Support agents work assigned tickets.
          Organization admins manage this organization.
        </p>
        <label className="mt-3 flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={allowExceptions}
            onChange={(event) => setAllowExceptions(event.target.checked)}
          />
          Allow verification exceptions
        </label>
      </section>

      <section className="glass-strong grid gap-4 p-5">
        <div>
          <h2 className="text-xl font-semibold">SLA policy</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Targets are measured in minutes from the ticket or handoff anchor.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {(["Urgent", "High", "Normal", "Low"] as const).map((priority) => (
            <div
              key={priority}
              className="grid gap-2 rounded-xl border border-border/50 p-3"
            >
              <h3 className="font-medium">{priority}</h3>
              <label className="grid gap-1 text-sm">
                First response (minutes)
                <input
                  type="number"
                  min="1"
                  value={targets.first_response[priority]}
                  onChange={(event) =>
                    setTargets((current) => ({
                      ...current,
                      first_response: {
                        ...current.first_response,
                        [priority]: Number(event.target.value),
                      },
                    }))
                  }
                  className="rounded-xl border border-border/60 bg-background/50 p-2"
                />
              </label>
              <label className="grid gap-1 text-sm">
                Resolution (minutes)
                <input
                  type="number"
                  min="1"
                  value={targets.resolution[priority]}
                  onChange={(event) =>
                    setTargets((current) => ({
                      ...current,
                      resolution: {
                        ...current.resolution,
                        [priority]: Number(event.target.value),
                      },
                    }))
                  }
                  className="rounded-xl border border-border/60 bg-background/50 p-2"
                />
              </label>
            </div>
          ))}
        </div>
        <label className="grid max-w-sm gap-1 text-sm">
          Timezone
          <select
            value={policyTimezone}
            onChange={(event) => setPolicyTimezone(event.target.value)}
            className="rounded-xl border border-border/60 bg-background/50 p-2"
          >
            {[
              ["America/New_York", "Eastern Time"],
              ["America/Chicago", "Central Time"],
              ["America/Denver", "Mountain Time"],
              ["America/Los_Angeles", "Pacific Time"],
              ["UTC", "UTC"],
              ["Europe/London", "London"],
            ].map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={pending}
          className="glass-pill justify-self-start px-4 py-2"
          onClick={savePolicy}
        >
          Save SLA policy
        </button>
      </section>

      <section className="glass-strong grid gap-4 p-5">
        <h2 className="text-xl font-semibold">Domains</h2>
        <div className="flex flex-wrap gap-2">
          <input
            value={domain}
            onChange={(event) => setDomain(event.target.value)}
            placeholder="school.example"
            className="rounded-xl border border-border/60 bg-background/50 p-2"
          />
          <button
            type="button"
            disabled={pending}
            className="glass-pill px-4 py-2"
            onClick={() => run(() => addDomain({ domain }))}
          >
            Add domain
          </button>
        </div>
        <ul className="grid gap-2 text-sm">
          {domains.map((item) => (
            <li
              key={item.id}
              className="rounded-xl border border-border/50 p-3"
            >
              <div className="flex flex-wrap justify-between gap-2">
                <span>{item.domain}</span>
                {item.verified ? (
                  <span>Verified</span>
                ) : (
                  <button
                    type="button"
                    className="underline"
                    onClick={() => run(() => verifyDomain(item.id))}
                  >
                    Verify
                  </button>
                )}
              </div>
              {!item.verified && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Add TXT{" "}
                  <code>helpdesk-first-verify={item.verification_token}</code>{" "}
                  at <code>_helpdesk-first.{item.domain}</code>.
                </p>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="glass-strong grid gap-4 p-5">
        <h2 className="text-xl font-semibold">Members</h2>
        <ul className="grid gap-2 text-sm">
          {members.map((member) => (
            <li
              key={member.user_id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/50 p-3"
            >
              <span>{member.user_id}</span>
              <div className="flex gap-2">
                <select
                  value={member.role === "admin" ? "org_admin" : member.role}
                  onChange={(event) =>
                    run(() =>
                      updateMemberRole(member.user_id, event.target.value)
                    )
                  }
                  className="rounded-xl border border-border/60 bg-background/50 p-2"
                >
                  <option value="requester">Requester</option>
                  <option value="support_agent">Support agent</option>
                  <option value="org_admin">Organization admin</option>
                </select>
                <button
                  type="button"
                  className="rounded-xl border border-destructive/40 px-3 py-2 text-destructive"
                  onClick={() => run(() => removeMember(member.user_id))}
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="glass-strong grid gap-4 p-5">
        <h2 className="text-xl font-semibold">Invitations</h2>
        <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            type="email"
            placeholder="person@example.com"
            className="rounded-xl border border-border/60 bg-background/50 p-2"
          />
          <select
            value={role}
            onChange={(event) => setRole(event.target.value)}
            className="rounded-xl border border-border/60 bg-background/50 p-2"
          >
            <option value="requester">Requester</option>
            <option value="support_agent">Support agent</option>
            <option value="org_admin">Organization admin</option>
          </select>
          <button
            type="button"
            className="glass-pill px-4 py-2"
            onClick={() => run(() => inviteMember({ email, role }))}
          >
            Create invite
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          Wave 7 owns email delivery. Copy the generated link to share it.
        </p>
        <ul className="grid gap-2 text-sm">
          {invitations.map((item) => (
            <li key={item.id} className="flex flex-wrap justify-between gap-2">
              <span>
                {item.email} · {item.role}
              </span>
              <button
                type="button"
                className="underline"
                onClick={() => run(() => revokeInvitation(item.id))}
              >
                Revoke
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
