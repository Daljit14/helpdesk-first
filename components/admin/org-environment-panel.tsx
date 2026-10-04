"use client";

import { useActionState, useState } from "react";
import {
  confirmOrgEnvironmentAction,
  saveOrgEnvironmentAction,
  type OrgEnvironmentActionState,
} from "@/app/actions/admin-org-environment";
import type {
  OrgEnvironmentInput,
  OrgEnvironmentProfile,
} from "@/lib/org-environment/types";
import { standardPlatforms } from "@/lib/org-environment/constants";
import type { InventorySuggestions } from "@/lib/org-environment/inventory";

const EMPTY_PROFILE: OrgEnvironmentInput = {
  vpnClient: null,
  mdmProvider: null,
  emailStack: null,
  chatStack: null,
  ssoProvider: null,
  standardPlatforms: [],
  standardOsVersions: [],
  printerFleet: [],
  approvedSoftware: [],
};

const MDM_OPTIONS = [
  ["intune", "Microsoft Intune"],
  ["jamf", "Jamf"],
  ["kandji", "Kandji"],
  ["workspace_one", "VMware Workspace ONE"],
  ["google_endpoint", "Google Endpoint Management"],
  ["none", "None"],
  ["other", "Other"],
] as const;
const EMAIL_OPTIONS = [
  ["microsoft365", "Microsoft 365"],
  ["google_workspace", "Google Workspace"],
  ["other", "Other"],
] as const;
const CHAT_OPTIONS = [
  ["teams", "Microsoft Teams"],
  ["slack", "Slack"],
  ["google_chat", "Google Chat"],
  ["zoom", "Zoom"],
  ["other", "Other"],
] as const;
const SSO_OPTIONS = [
  ["entra", "Microsoft Entra ID"],
  ["google", "Google"],
  ["okta", "Okta"],
  ["none", "None"],
  ["other", "Other"],
] as const;

export function OrgEnvironmentPanel({
  profile,
  confirmedBy,
  suggestions,
}: {
  profile: OrgEnvironmentProfile | null;
  confirmedBy: string | null;
  suggestions: InventorySuggestions;
}) {
  const [formState, setFormState] = useState<OrgEnvironmentInput>(
    () => profile ?? EMPTY_PROFILE
  );
  const [saveState, saveAction, saving] = useActionState<
    OrgEnvironmentActionState | null,
    FormData
  >(saveOrgEnvironmentAction, null);
  const [confirmState, confirmAction, confirming] = useActionState<
    OrgEnvironmentActionState | null,
    FormData
  >(confirmOrgEnvironmentAction, null);

  function update<K extends keyof OrgEnvironmentInput>(
    key: K,
    value: OrgEnvironmentInput[K]
  ) {
    setFormState((current) => ({ ...current, [key]: value }));
  }

  function chooseEnum<
    K extends "mdmProvider" | "emailStack" | "chatStack" | "ssoProvider",
  >(key: K, value: string) {
    update(key, (value || null) as OrgEnvironmentInput[K]);
  }

  function useSuggestions() {
    setFormState((current) => ({
      ...current,
      standardPlatforms: suggestions.platforms.map(({ platform }) => platform),
      printerFleet: suggestions.printers,
    }));
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className="rounded-full border border-border bg-muted px-3 py-1 text-xs font-bold"
          data-testid="environment-profile-status"
        >
          {profile?.status === "confirmed" ? "Confirmed" : "Draft"}
        </span>
        {profile?.status === "confirmed" && profile.confirmedAt && (
          <span className="text-sm text-muted-foreground">
            Confirmed by {confirmedBy ?? "organization admin"} at{" "}
            {profile.confirmedAt}
          </span>
        )}
      </div>

      <section
        aria-label="Inventory suggestions"
        className="rounded-2xl border border-border bg-muted/40 p-4"
      >
        <h3 className="font-bold">Inventory suggestions</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          From {suggestions.deviceCount} enrolled devices:{" "}
          {suggestions.platforms.length
            ? suggestions.platforms
                .map(({ platform, count }) => `${platform} (${count})`)
                .join(", ")
            : "no standard platforms detected"}
          {" · "}
          printers:{" "}
          {suggestions.printers.length
            ? suggestions.printers.join(", ")
            : "none detected"}
        </p>
        <button
          className="mt-3 rounded-lg border border-border px-3 py-2 text-sm font-bold hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={useSuggestions}
          type="button"
        >
          Use suggestions
        </button>
      </section>

      <form action={saveAction} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1 text-sm font-semibold">
            <span>VPN client</span>
            <input
              className="w-full rounded-lg border border-input bg-background px-3 py-2"
              name="vpnClient"
              maxLength={80}
              value={formState.vpnClient ?? ""}
              onChange={(event) =>
                update("vpnClient", event.currentTarget.value || null)
              }
            />
          </label>
          <EnumSelect
            label="MDM provider"
            name="mdmProvider"
            options={MDM_OPTIONS}
            value={formState.mdmProvider}
            onChange={(value) => chooseEnum("mdmProvider", value)}
          />
          <EnumSelect
            label="Email stack"
            name="emailStack"
            options={EMAIL_OPTIONS}
            value={formState.emailStack}
            onChange={(value) => chooseEnum("emailStack", value)}
          />
          <EnumSelect
            label="Chat stack"
            name="chatStack"
            options={CHAT_OPTIONS}
            value={formState.chatStack}
            onChange={(value) => chooseEnum("chatStack", value)}
          />
          <EnumSelect
            label="Single sign-on provider"
            name="ssoProvider"
            options={SSO_OPTIONS}
            value={formState.ssoProvider}
            onChange={(value) => chooseEnum("ssoProvider", value)}
          />
        </div>

        <label className="block space-y-1 text-sm font-semibold">
          <span>Standard platforms</span>
          <select
            aria-label="Standard platforms"
            className="min-h-28 w-full rounded-lg border border-input bg-background px-3 py-2"
            multiple
            name="standardPlatforms"
            value={formState.standardPlatforms}
            onChange={(event) =>
              update(
                "standardPlatforms",
                Array.from(
                  event.currentTarget.selectedOptions,
                  (option) => option.value
                ) as OrgEnvironmentInput["standardPlatforms"]
              )
            }
          >
            {standardPlatforms.map((platform) => (
              <option key={platform} value={platform}>
                {platform}
              </option>
            ))}
          </select>
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <TextListField
            label="Standard OS versions"
            name="standardOsVersions"
            values={formState.standardOsVersions}
            onChange={(values) => update("standardOsVersions", values)}
          />
          <TextListField
            label="Printer fleet"
            name="printerFleet"
            values={formState.printerFleet}
            onChange={(values) => update("printerFleet", values)}
          />
          <TextListField
            label="Approved software"
            name="approvedSoftware"
            values={formState.approvedSoftware}
            onChange={(values) => update("approvedSoftware", values)}
          />
        </div>

        <p className="rounded-xl border border-status-info/30 bg-status-info/10 p-3 text-sm font-semibold">
          The assistant only uses this profile after you confirm it. Saving
          changes returns it to draft.
        </p>
        {saveState && "error" in saveState && (
          <p role="alert" className="text-sm font-semibold text-status-danger">
            {saveState.error}
          </p>
        )}
        {saveState && "success" in saveState && (
          <p
            role="status"
            className="text-sm font-semibold text-status-success"
          >
            Draft saved.
          </p>
        )}
        <button
          className="rounded-lg bg-primary px-4 py-2 font-bold text-primary-foreground disabled:opacity-50"
          disabled={saving}
          type="submit"
        >
          {saving ? "Saving…" : "Save draft"}
        </button>
      </form>
      {confirmState && "error" in confirmState && (
        <p role="alert" className="text-sm font-semibold text-status-danger">
          {confirmState.error}
        </p>
      )}
      {confirmState && "success" in confirmState && (
        <p role="status" className="text-sm font-semibold text-status-success">
          Profile confirmed.
        </p>
      )}
      {profile?.status === "draft" && (
        <form action={confirmAction}>
          <button
            className="rounded-lg border border-primary px-4 py-2 font-bold text-primary disabled:opacity-50"
            disabled={confirming}
            type="submit"
          >
            {confirming ? "Confirming…" : "Confirm profile"}
          </button>
        </form>
      )}
    </div>
  );
}

function EnumSelect({
  label,
  name,
  options,
  value,
  onChange,
}: {
  label: string;
  name: string;
  options: readonly (readonly [string, string])[];
  value: string | null;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-1 text-sm font-semibold">
      <span>{label}</span>
      <select
        className="w-full rounded-lg border border-input bg-background px-3 py-2"
        name={name}
        value={value ?? ""}
        onChange={(event) => onChange(event.currentTarget.value)}
      >
        <option value="">Not set</option>
        {options.map(([option, text]) => (
          <option key={option} value={option}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}

function TextListField({
  label,
  name,
  values,
  onChange,
}: {
  label: string;
  name: string;
  values: string[];
  onChange: (values: string[]) => void;
}) {
  return (
    <label className="space-y-1 text-sm font-semibold">
      <span>{label}</span>
      <textarea
        className="min-h-24 w-full rounded-lg border border-input bg-background px-3 py-2"
        name={name}
        value={values.join("\n")}
        onChange={(event) =>
          onChange(
            event.currentTarget.value
              .split(/[\r\n,]+/)
              .map((value) => value.trim())
              .filter(Boolean)
          )
        }
      />
      <span className="block text-xs font-normal text-muted-foreground">
        Separate entries with commas or new lines.
      </span>
    </label>
  );
}
