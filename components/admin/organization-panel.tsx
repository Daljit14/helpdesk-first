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
import {
  CheckCircle2,
  Globe2,
  Link2,
  Mail,
  ShieldCheck,
  Timer,
  Trash2,
  UserPlus,
  UsersRound,
} from "lucide-react";
import { EmptyState, Panel, StatusPill } from "@/components/admin/ui/admin-kit";

const FIELD =
  "h-10 w-full min-w-0 rounded-xl border border-border bg-card px-3 text-sm font-semibold text-foreground shadow-sm transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const PRIMARY_BUTTON =
  "inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-extrabold text-primary-foreground shadow-sm transition-transform hover:-translate-y-px disabled:opacity-60";
const ROLE_LABEL: Record<string, string> = {
  requester: "Requester",
  support_agent: "Support agent",
  org_admin: "Organization admin",
  admin: "Organization admin",
};
const PRIORITY_TONE: Record<string, string> = {
  Urgent: "border-status-danger/40 bg-status-danger/5",
  High: "border-status-warning/40 bg-status-warning/5",
  Normal: "border-primary/30 bg-secondary/40",
  Low: "border-border bg-muted/40",
};

export type OrganizationPanelView = "all" | "people" | "settings";

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
  view = "all",
}: {
  view?: OrganizationPanelView;
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
  const [inviteNotice, setInviteNotice] = useState<string | null>(null);
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
    >,
    setResult: (value: string) => void = setNotice
  ) {
    startTransition(async () => {
      const result = await action();
      if ("error" in result && typeof result.error === "string")
        setResult(result.error);
      else {
        const inviteUrl = "inviteUrl" in result ? result.inviteUrl : null;
        setResult(
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

  const showPeople = view !== "settings";
  const showSettings = view !== "people";
  const roleCounts = members.reduce<Record<string, number>>((acc, member) => {
    const key = member.role === "admin" ? "org_admin" : member.role;
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="grid gap-5">
      {notice && (
        <p
          role="status"
          className="hf-swap flex items-center gap-2 rounded-2xl border border-primary/30 bg-secondary/60 p-3 text-sm font-bold"
        >
          <CheckCircle2 className="h-4 w-4 text-primary" aria-hidden />
          {notice}
        </p>
      )}

      {showPeople && (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <Panel
            title="Members"
            description={`${members.length} ${members.length === 1 ? "person" : "people"} in ${organizationName}`}
            icon={UsersRound}
            flush
          >
            <div className="flex flex-wrap gap-2 px-5 pt-4 sm:px-6">
              {Object.entries(roleCounts).map(([key, count]) => (
                <StatusPill
                  key={key}
                  tone={
                    key === "org_admin"
                      ? "primary"
                      : key === "support_agent"
                        ? "info"
                        : "neutral"
                  }
                >
                  {ROLE_LABEL[key] ?? key} · {count}
                </StatusPill>
              ))}
            </div>
            {members.length === 0 ? (
              <EmptyState
                icon={UsersRound}
                title="No members yet"
                body="Invite your first teammate from the panel on the right."
              />
            ) : (
              <ul className="divide-y divide-border p-2 sm:p-3">
                {members.map((member, index) => (
                  <li
                    key={member.user_id}
                    className="hf-adm-row flex flex-wrap items-center justify-between gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-muted/50"
                    style={{ animationDelay: `${Math.min(index, 12) * 0.03}s` }}
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span
                        aria-hidden
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-[var(--adm-accent-2)] text-xs font-extrabold text-white"
                      >
                        {member.user_id.slice(0, 2).toUpperCase()}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-mono text-sm font-bold">
                          {member.user_id}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          Joined via {member.joined_via ?? "—"}
                        </span>
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      <select
                        aria-label={`Role for ${member.user_id}`}
                        value={
                          member.role === "admin" ? "org_admin" : member.role
                        }
                        onChange={(event) =>
                          run(() =>
                            updateMemberRole(member.user_id, event.target.value)
                          )
                        }
                        className={`${FIELD} w-auto`}
                      >
                        <option value="requester">Requester</option>
                        <option value="support_agent">Support agent</option>
                        <option value="org_admin">Organization admin</option>
                      </select>
                      <button
                        type="button"
                        aria-label={`Remove ${member.user_id}`}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-status-danger/40 text-status-danger transition-colors hover:bg-status-danger/10"
                        onClick={() => run(() => removeMember(member.user_id))}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel
            title="Invitations"
            description="An email with the invite link is sent automatically. You can also copy the link."
            icon={UserPlus}
            delay={0.08}
          >
            <div className="grid gap-2">
              <label className="relative">
                <span className="sr-only">Email to invite</span>
                <Mail
                  className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground"
                  aria-hidden
                />
                <input
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  type="email"
                  placeholder="person@example.com"
                  className={`${FIELD} pl-9`}
                />
              </label>
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <select
                  aria-label="Role for new invite"
                  value={role}
                  onChange={(event) => setRole(event.target.value)}
                  className={FIELD}
                >
                  <option value="requester">Requester</option>
                  <option value="support_agent">Support agent</option>
                  <option value="org_admin">Organization admin</option>
                </select>
                <button
                  type="button"
                  disabled={pending}
                  className={PRIMARY_BUTTON}
                  onClick={() =>
                    run(() => inviteMember({ email, role }), setInviteNotice)
                  }
                >
                  <UserPlus className="h-4 w-4" aria-hidden />
                  Create invite
                </button>
              </div>
            </div>
            {inviteNotice && (
              <p className="hf-swap mt-3 flex items-start gap-2 break-all rounded-2xl bg-muted p-3 text-sm font-semibold">
                <Link2
                  className="mt-0.5 h-4 w-4 shrink-0 text-primary"
                  aria-hidden
                />
                {inviteNotice}
              </p>
            )}
            <p className="mt-4 text-xs font-extrabold uppercase tracking-wide text-muted-foreground">
              Pending · {invitations.length}
            </p>
            {invitations.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                No pending invitations.
              </p>
            ) : (
              <ul className="mt-2 grid gap-2 text-sm">
                {invitations.map((item) => (
                  <li
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-bold">
                        {item.email}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {ROLE_LABEL[item.role] ?? item.role} · expires{" "}
                        {new Date(item.expires_at).toLocaleDateString()}
                      </span>
                    </span>
                    <button
                      type="button"
                      className="rounded-lg px-2 py-1 text-xs font-bold text-status-danger hover:bg-status-danger/10"
                      onClick={() =>
                        run(() => revokeInvitation(item.id), setInviteNotice)
                      }
                    >
                      Revoke
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      )}

      {showSettings && (
        <>
          <Panel
            title={organizationName}
            description="Organization admins manage members and verified email domains. Shared staff credentials are prohibited."
            icon={ShieldCheck}
          >
            <p className="text-sm text-muted-foreground">
              Requesters submit tickets. Support agents work assigned tickets.
              Organization admins manage this organization.
            </p>
            <label className="mt-4 flex cursor-pointer items-start gap-4 rounded-2xl border border-border p-4 transition-colors hover:bg-muted/50">
              <input
                type="checkbox"
                role="switch"
                checked={allowExceptions}
                onChange={(event) => setAllowExceptions(event.target.checked)}
                className="peer sr-only"
              />
              <span
                aria-hidden
                className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-ring ${
                  allowExceptions ? "bg-primary" : "bg-input"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-card shadow transition-transform ${
                    allowExceptions ? "translate-x-5" : "translate-x-0.5"
                  }`}
                />
              </span>
              <span>
                <span className="block font-bold">
                  Allow verification exceptions
                </span>
                <span className="block text-sm text-muted-foreground">
                  Saved together with the SLA policy below.
                </span>
              </span>
            </label>
          </Panel>

          <Panel
            title="SLA policy"
            description="Targets are measured in minutes from the ticket or handoff anchor."
            icon={Timer}
            delay={0.05}
          >
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {(["Urgent", "High", "Normal", "Low"] as const).map(
                (priority, index) => (
                  <div
                    key={priority}
                    className={`hf-rise grid gap-2 rounded-2xl border p-4 ${PRIORITY_TONE[priority]}`}
                    style={{ animationDelay: `${index * 0.05}s` }}
                  >
                    <h3 className="font-extrabold">{priority}</h3>
                    <label className="grid gap-1 text-xs font-bold text-muted-foreground">
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
                        className={FIELD}
                      />
                    </label>
                    <label className="grid gap-1 text-xs font-bold text-muted-foreground">
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
                        className={FIELD}
                      />
                    </label>
                  </div>
                )
              )}
            </div>
            <div className="mt-4 flex flex-wrap items-end gap-3">
              <label className="grid w-full max-w-xs gap-1 text-xs font-bold text-muted-foreground">
                Timezone
                <select
                  value={policyTimezone}
                  onChange={(event) => setPolicyTimezone(event.target.value)}
                  className={FIELD}
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
                className={PRIMARY_BUTTON}
                onClick={savePolicy}
              >
                Save SLA policy
              </button>
            </div>
          </Panel>

          <Panel
            title="Domains"
            description="Verified domains let people from your organization join automatically."
            icon={Globe2}
            delay={0.1}
          >
            <div className="flex flex-wrap gap-2">
              <input
                aria-label="Domain"
                value={domain}
                onChange={(event) => setDomain(event.target.value)}
                placeholder="school.example"
                className={`${FIELD} max-w-sm`}
              />
              <button
                type="button"
                disabled={pending}
                className={PRIMARY_BUTTON}
                onClick={() => run(() => addDomain({ domain }))}
              >
                Add domain
              </button>
            </div>
            <ul className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
              {domains.map((item) => (
                <li
                  key={item.id}
                  className="rounded-2xl border border-border p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-2 font-bold">
                      <Globe2 className="h-4 w-4 text-primary" aria-hidden />
                      {item.domain}
                    </span>
                    {item.verified ? (
                      <StatusPill tone="good">Verified</StatusPill>
                    ) : (
                      <button
                        type="button"
                        className="rounded-lg bg-secondary px-3 py-1 text-xs font-extrabold text-secondary-foreground"
                        onClick={() => run(() => verifyDomain(item.id))}
                      >
                        Verify
                      </button>
                    )}
                  </div>
                  {!item.verified && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Add TXT{" "}
                      <code className="rounded bg-muted px-1">
                        helpdesk-first-verify={item.verification_token}
                      </code>{" "}
                      at{" "}
                      <code className="rounded bg-muted px-1">
                        _helpdesk-first.{item.domain}
                      </code>
                      .
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </Panel>
        </>
      )}
    </div>
  );
}
