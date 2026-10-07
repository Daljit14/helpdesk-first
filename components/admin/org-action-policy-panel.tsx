"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  deleteOrgActionPolicyAction,
  saveOrgActionPolicyAction,
} from "@/app/actions/admin-org-action-policy";
import {
  orgActionPolicyInputSchema,
  type AutorunWindow,
  type OrgActionPolicyRule,
  type OrgPolicyEffect,
  type OrgPolicyTier,
} from "@/lib/autonomy/policy/org-policy";

type PolicyRow = OrgActionPolicyRule & {
  note: string;
  createdAt: string;
};

type CapabilityOption = { id: string; label: string };

const DAYS = [
  ["Sunday", 0],
  ["Monday", 1],
  ["Tuesday", 2],
  ["Wednesday", 3],
  ["Thursday", 4],
  ["Friday", 5],
  ["Saturday", 6],
] as const;
const COMMON_TIME_ZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Paris",
  "Asia/Kolkata",
  "Asia/Tokyo",
  "Australia/Sydney",
];

function emptyForm() {
  return {
    capabilityId: "*",
    effect: "allow" as OrgPolicyEffect,
    scopeGroups: "",
    maxTier: "consent" as OrgPolicyTier,
    autorunWindows: [] as AutorunWindow[],
    requireStaffApproval: false,
    note: "",
  };
}

function dayLabel(days: number[]): string {
  if (days.length === 7) return "every day";
  if ([1, 2, 3, 4, 5].every((day) => days.includes(day)) && days.length === 5)
    return "Mon–Fri";
  return [...days]
    .sort((left, right) => left - right)
    .map((day) => DAYS[day]?.[0].slice(0, 3))
    .join(", ");
}

function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function subscribeToTimeZone() {
  return () => undefined;
}

function getBrowserTimeZone(): string {
  const local = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return local && isTimeZone(local) ? local : "UTC";
}

function getServerTimeZone(): string {
  return "UTC";
}

export function OrgActionPolicyPanel({
  rules,
  capabilities,
}: {
  rules: PolicyRow[];
  capabilities: CapabilityOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [groupText, setGroupText] = useState("");
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("17:00");
  const [timeZoneOverride, setTimeZoneOverride] = useState<string | null>(null);
  const browserTimeZone = useSyncExternalStore(
    subscribeToTimeZone,
    getBrowserTimeZone,
    getServerTimeZone
  );
  const timeZone = timeZoneOverride ?? browserTimeZone;
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const timeZones = [
    ...new Set([timeZone, browserTimeZone, ...COMMON_TIME_ZONES]),
  ].filter(isTimeZone);
  const errorFor = (field: string) =>
    fieldErrors[field] ??
    Object.entries(fieldErrors).find(([key]) =>
      key.startsWith(`${field}.`)
    )?.[1];

  function resetForm() {
    setForm(emptyForm());
    setGroupText("");
    setEditingId(null);
    setDays([1, 2, 3, 4, 5]);
    setStart("09:00");
    setEnd("17:00");
    setError(null);
    setFieldErrors({});
  }

  function editRule(rule: PolicyRow) {
    setEditingId(rule.id);
    setForm({
      capabilityId: rule.capabilityId,
      effect: rule.effect,
      scopeGroups: "",
      maxTier: rule.maxTier,
      autorunWindows: rule.autorunWindows,
      requireStaffApproval: rule.requireStaffApproval,
      note: rule.note,
    });
    setGroupText(rule.scopeGroups.join("\n"));
    const firstWindow = rule.autorunWindows[0];
    if (firstWindow) {
      setDays(firstWindow.days);
      setStart(firstWindow.start);
      setEnd(firstWindow.end);
      setTimeZoneOverride(firstWindow.timeZone);
    }
    setError(null);
    setFieldErrors({});
  }

  function addWindow() {
    const parsedDays = [...new Set(days)].filter(
      (day) => Number.isInteger(day) && day >= 0 && day <= 6
    );
    if (parsedDays.length === 0) {
      setFieldErrors({ autorunWindows: "Choose at least one day." });
      return;
    }
    if (!isTimeZone(timeZone)) {
      setFieldErrors({ autorunWindows: "Choose a valid IANA time zone." });
      return;
    }
    if (
      !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(start) ||
      !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(end)
    ) {
      setFieldErrors({
        autorunWindows: "Enter valid 24-hour start and end times.",
      });
      return;
    }
    setForm((current) => ({
      ...current,
      autorunWindows: [
        ...current.autorunWindows,
        { days: parsedDays, start, end, timeZone },
      ],
    }));
    setFieldErrors({});
  }

  function toggleDay(day: number, checked: boolean) {
    setDays((current) =>
      checked
        ? [...new Set([...current, day])]
        : current.filter((value) => value !== day)
    );
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const groups = [
      ...new Set(
        groupText
          .split(/[,\n]/)
          .map((group) => group.trim())
          .filter(Boolean)
      ),
    ];
    const candidate = {
      ...(editingId ? { id: editingId } : {}),
      ...form,
      scopeGroups: groups,
      ...(editingId ? {} : {}),
    };
    const parsed = orgActionPolicyInputSchema.safeParse(candidate);
    if (groups.some((group) => group.length > 200) || groups.length > 20) {
      setFieldErrors({
        scopeGroups:
          "Enter no more than 20 group IDs, each at most 200 characters.",
      });
      return;
    }
    if (!parsed.success) {
      setFieldErrors(
        Object.fromEntries(
          parsed.error.issues.map((issue) => [
            issue.path.join(".") || "form",
            issue.message,
          ])
        )
      );
      setError("Review the highlighted policy fields.");
      return;
    }
    setError(null);
    setFieldErrors({});
    startTransition(async () => {
      const result = await saveOrgActionPolicyAction(parsed.data);
      if ("error" in result) {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }
      resetForm();
      router.refresh();
    });
  }

  function removeRule(id: string) {
    setError(null);
    startTransition(async () => {
      const result = await deleteOrgActionPolicyAction(id);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      if (editingId === id) resetForm();
      router.refresh();
    });
  }

  return (
    <div className="space-y-8">
      <section aria-labelledby="org-policy-rules-heading" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="org-policy-rules-heading" className="text-lg font-bold">
            Organization rules
          </h2>
          <p className="text-sm text-muted-foreground">{rules.length} of 100</p>
        </div>
        {rules.length === 0 ? (
          <p className="rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
            No organization rules yet.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table
              className="w-full min-w-[720px] text-left text-sm"
              aria-label="Organization AI action policies"
            >
              <thead className="bg-muted/40">
                <tr>
                  <th className="p-3">Capability</th>
                  <th className="p-3">Effect</th>
                  <th className="p-3">Groups</th>
                  <th className="p-3">Maximum tier</th>
                  <th className="p-3">Autorun hours</th>
                  <th className="p-3">Staff approval</th>
                  <th className="p-3">Note</th>
                  <th className="p-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((rule) => (
                  <tr key={rule.id} className="border-t border-border">
                    <td className="p-3">
                      {rule.capabilityId === "*"
                        ? "All fixes"
                        : (capabilities.find(
                            (capability) => capability.id === rule.capabilityId
                          )?.label ?? rule.capabilityId)}
                    </td>
                    <td className="p-3 capitalize">{rule.effect}</td>
                    <td className="max-w-40 truncate p-3">
                      {rule.scopeGroups.length === 0
                        ? "Everyone"
                        : rule.scopeGroups.join(", ")}
                    </td>
                    <td className="p-3 capitalize">{rule.maxTier}</td>
                    <td className="max-w-48 p-3">
                      {rule.autorunWindows.length === 0
                        ? "Any time"
                        : rule.autorunWindows
                            .map(
                              (window) =>
                                `${window.start}–${window.end} ${dayLabel(window.days)} (${window.timeZone})`
                            )
                            .join("; ")}
                    </td>
                    <td className="p-3">
                      {rule.requireStaffApproval ? "Required" : "No"}
                    </td>
                    <td className="max-w-40 truncate p-3">{rule.note}</td>
                    <td className="p-3">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="rounded-lg border border-border px-2.5 py-1.5 font-semibold hover:bg-muted"
                          onClick={() => editRule(rule)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="rounded-lg border border-destructive/40 px-2.5 py-1.5 font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-60"
                          onClick={() => removeRule(rule.id)}
                          disabled={pending}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="org-policy-form-heading" className="space-y-4">
        <div>
          <h2 id="org-policy-form-heading" className="text-lg font-bold">
            {editingId ? "Edit rule" : "Add a rule"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Deny rules take precedence over every allow rule.
          </p>
        </div>
        <form className="grid gap-4 md:grid-cols-2" onSubmit={submit}>
          <label className="space-y-1 text-sm font-semibold">
            <span>Capability</span>
            <select
              className="w-full rounded-xl border border-input bg-background px-3 py-2"
              value={form.capabilityId}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  capabilityId: event.target.value,
                }))
              }
            >
              <option value="*">All fixes</option>
              {capabilities.map((capability) => (
                <option key={capability.id} value={capability.id}>
                  {capability.label}
                </option>
              ))}
            </select>
            {errorFor("capabilityId") && (
              <span className="block text-xs text-destructive">
                {errorFor("capabilityId")}
              </span>
            )}
          </label>
          <label className="space-y-1 text-sm font-semibold">
            <span>Effect</span>
            <select
              className="w-full rounded-xl border border-input bg-background px-3 py-2"
              value={form.effect}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  effect: event.target.value as "allow" | "deny",
                }))
              }
            >
              <option value="allow">Allow</option>
              <option value="deny">Deny</option>
            </select>
          </label>
          <label className="space-y-1 text-sm font-semibold md:col-span-2">
            <span>
              Group IDs (comma or newline separated; blank means everyone)
            </span>
            <textarea
              className="min-h-20 w-full rounded-xl border border-input bg-background px-3 py-2 font-mono text-sm"
              value={groupText}
              maxLength={4020}
              onChange={(event) => setGroupText(event.target.value)}
            />
            {errorFor("scopeGroups") && (
              <span className="block text-xs text-destructive">
                {errorFor("scopeGroups")}
              </span>
            )}
          </label>
          <label className="space-y-1 text-sm font-semibold">
            <span>Maximum tier</span>
            <select
              className="w-full rounded-xl border border-input bg-background px-3 py-2"
              value={form.maxTier}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  maxTier: event.target.value as OrgPolicyTier,
                }))
              }
            >
              <option value="shadow">Shadow</option>
              <option value="consent">Consent</option>
              <option value="autorun">Autorun</option>
            </select>
          </label>
          <label className="flex items-center gap-2 self-end pb-2 text-sm font-semibold">
            <input
              type="checkbox"
              checked={form.requireStaffApproval}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  requireStaffApproval: event.target.checked,
                }))
              }
            />
            Always require staff approval
          </label>

          <fieldset className="space-y-3 rounded-xl border border-border p-4 md:col-span-2">
            <legend className="px-1 text-sm font-bold">
              Autorun windows (optional)
            </legend>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {DAYS.map(([label, day]) => (
                <label
                  key={day}
                  className="inline-flex items-center gap-1.5 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={days.includes(day)}
                    onChange={(event) => toggleDay(day, event.target.checked)}
                  />
                  {label.slice(0, 3)}
                </label>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="space-y-1 text-sm font-semibold">
                <span>Start</span>
                <input
                  className="w-full rounded-xl border border-input bg-background px-3 py-2"
                  type="time"
                  value={start}
                  onChange={(event) => setStart(event.target.value)}
                />
              </label>
              <label className="space-y-1 text-sm font-semibold">
                <span>End</span>
                <input
                  className="w-full rounded-xl border border-input bg-background px-3 py-2"
                  type="time"
                  value={end}
                  onChange={(event) => setEnd(event.target.value)}
                />
              </label>
              <label className="space-y-1 text-sm font-semibold">
                <span>Time zone</span>
                <select
                  className="w-full rounded-xl border border-input bg-background px-3 py-2"
                  value={timeZone}
                  onChange={(event) => setTimeZoneOverride(event.target.value)}
                >
                  {timeZones.map((zone) => (
                    <option key={zone} value={zone}>
                      {zone}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button
              type="button"
              className="rounded-lg border border-border px-3 py-2 text-sm font-semibold hover:bg-muted"
              onClick={addWindow}
            >
              Add autorun window
            </button>
            {errorFor("autorunWindows") && (
              <p role="alert" className="text-xs text-destructive">
                {errorFor("autorunWindows")}
              </p>
            )}
            {form.autorunWindows.length > 0 && (
              <ul className="space-y-1 text-sm">
                {form.autorunWindows.map((window, index) => (
                  <li
                    key={`${window.timeZone}-${window.start}-${index}`}
                    className="flex flex-wrap items-center justify-between gap-2"
                  >
                    <span>
                      {window.start}–{window.end} {dayLabel(window.days)} (
                      {window.timeZone})
                    </span>
                    <button
                      type="button"
                      className="text-destructive underline"
                      onClick={() =>
                        setForm((current) => ({
                          ...current,
                          autorunWindows: current.autorunWindows.filter(
                            (_, itemIndex) => itemIndex !== index
                          ),
                        }))
                      }
                    >
                      Remove window
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </fieldset>

          <label className="space-y-1 text-sm font-semibold md:col-span-2">
            <span>Admin note (optional)</span>
            <textarea
              className="min-h-16 w-full rounded-xl border border-input bg-background px-3 py-2"
              value={form.note}
              maxLength={500}
              onChange={(event) =>
                setForm((current) => ({ ...current, note: event.target.value }))
              }
            />
            {errorFor("note") && (
              <span className="block text-xs text-destructive">
                {errorFor("note")}
              </span>
            )}
          </label>

          <div className="flex flex-wrap items-center gap-2 md:col-span-2">
            <button
              className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-60"
              type="submit"
              disabled={pending}
            >
              {pending ? "Saving…" : editingId ? "Save changes" : "Add rule"}
            </button>
            {editingId && (
              <button
                className="rounded-xl border border-border px-4 py-2 text-sm font-semibold hover:bg-muted"
                type="button"
                onClick={resetForm}
                disabled={pending}
              >
                Cancel edit
              </button>
            )}
            {error && (
              <p
                role="alert"
                className="text-sm font-semibold text-destructive"
              >
                {error}
              </p>
            )}
          </div>
        </form>
      </section>
    </div>
  );
}
