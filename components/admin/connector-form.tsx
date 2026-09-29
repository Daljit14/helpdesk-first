"use client";

import { useActionState, useState } from "react";
import {
  disableConnectorAction,
  saveConnectorAction,
  testConnectorAction,
  type ConnectorActionState,
} from "@/app/actions/admin-connectors";

type Provider = "entra" | "google";

export type ConnectorInitial = {
  provider: Provider;
  config: Record<string, string>;
  allowedGroupIds: string[];
  resetUrl: string | null;
  status: string;
};

const initialState: ConnectorActionState | null = null;
const fieldClass =
  "block min-h-10 w-full min-w-0 rounded-xl border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground shadow-sm transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const labelClass = "grid gap-1.5 text-sm font-bold";
const PRIMARY_BUTTON =
  "inline-flex h-10 w-fit items-center gap-2 rounded-xl bg-primary px-4 text-sm font-extrabold text-primary-foreground shadow-sm transition-transform hover:-translate-y-px disabled:opacity-60";
const SECONDARY_BUTTON =
  "inline-flex h-10 w-fit items-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-extrabold text-foreground shadow-sm transition-colors hover:border-primary/40 hover:bg-muted/60 disabled:opacity-60";

function ActionMessage({
  state,
  success,
}: {
  state: ConnectorActionState | null;
  success: string;
}) {
  if (state && "error" in state)
    return (
      <p
        role="alert"
        className="hf-swap rounded-2xl border border-status-danger/30 bg-status-danger/10 p-3 text-sm font-bold text-status-danger"
      >
        {state.error}
      </p>
    );
  if (state && "success" in state)
    return (
      <p
        role="status"
        className="hf-swap rounded-2xl border border-status-success/30 bg-status-success/10 p-3 text-sm font-bold text-status-success"
      >
        {success}
      </p>
    );
  return null;
}

export function ConnectorForm({
  initial,
}: {
  initial: ConnectorInitial | null;
}) {
  const [provider, setProvider] = useState<Provider>(
    initial?.provider ?? "entra"
  );
  const [saveState, saveAction, savePending] = useActionState(
    saveConnectorAction,
    initialState
  );
  const [testState, testAction, testPending] = useActionState(
    testConnectorAction,
    initialState
  );
  const [disableState, disableAction, disablePending] = useActionState(
    disableConnectorAction,
    initialState
  );
  const config = initial?.config ?? {};
  const hasSecret = initial !== null;

  return (
    <div className="space-y-4">
      <form action={saveAction} className="grid gap-4 sm:grid-cols-2">
        <label
          className={`${labelClass} sm:col-span-2`}
          htmlFor="connector-provider"
        >
          Provider
          <select
            id="connector-provider"
            name="provider"
            value={provider}
            onChange={(event) => setProvider(event.target.value as Provider)}
            className={fieldClass}
          >
            <option value="entra">Microsoft Entra ID</option>
            <option value="google">Google Workspace</option>
          </select>
        </label>
        {provider === "entra" ? (
          <>
            <label className={labelClass} htmlFor="connector-tenant">
              Tenant ID
              <input
                id="connector-tenant"
                name="tenantId"
                defaultValue={config.tenantId}
                className={fieldClass}
              />
            </label>
            <label className={labelClass} htmlFor="connector-client">
              Client ID
              <input
                id="connector-client"
                name="clientId"
                defaultValue={config.clientId}
                className={fieldClass}
              />
            </label>
            <label className={labelClass} htmlFor="connector-secret">
              Client secret
              <input
                id="connector-secret"
                name="clientSecret"
                type="password"
                className={fieldClass}
              />
            </label>
          </>
        ) : (
          <>
            <label
              className={`${labelClass} sm:col-span-2`}
              htmlFor="connector-service-account"
            >
              Google service-account JSON
              <textarea
                id="connector-service-account"
                name="serviceAccountJson"
                rows={6}
                className={fieldClass}
              />
            </label>
            <label className={labelClass} htmlFor="connector-admin-subject">
              Google admin subject
              <input
                id="connector-admin-subject"
                name="adminSubject"
                type="email"
                defaultValue={config.adminSubject}
                className={fieldClass}
              />
            </label>
          </>
        )}
        <label className={labelClass} htmlFor="connector-groups">
          Allowed group IDs
          <input
            id="connector-groups"
            name="allowedGroupIds"
            defaultValue={initial?.allowedGroupIds.join(",")}
            className={fieldClass}
          />
        </label>
        <label className={labelClass} htmlFor="connector-reset-url">
          Recovery URL
          <input
            id="connector-reset-url"
            name="resetUrl"
            type="url"
            defaultValue={initial?.resetUrl ?? ""}
            className={fieldClass}
          />
        </label>
        <div className="grid gap-3 sm:col-span-2">
          {hasSecret && (
            <p className="text-xs font-semibold text-muted-foreground">
              Secret set — enter a new value to rotate
            </p>
          )}
          <ActionMessage state={saveState} success="Connector saved." />
          <button
            type="submit"
            disabled={savePending}
            className={PRIMARY_BUTTON}
          >
            {savePending ? "Saving…" : "Save connector"}
          </button>
        </div>
      </form>
      <div className="flex flex-wrap items-start gap-3 border-t border-border pt-4">
        <form action={testAction} className="grid gap-2">
          <ActionMessage state={testState} success="Connector test passed." />
          <button
            type="submit"
            disabled={testPending}
            className={SECONDARY_BUTTON}
          >
            {testPending ? "Testing…" : "Test connector"}
          </button>
        </form>
        <form action={disableAction} className="grid gap-2">
          <ActionMessage state={disableState} success="Connector disabled." />
          <button
            type="submit"
            disabled={disablePending}
            className={`${SECONDARY_BUTTON} hover:border-status-danger/40 hover:text-status-danger`}
          >
            {disablePending ? "Disabling…" : "Disable"}
          </button>
        </form>
      </div>
      {initial?.status && (
        <p className="text-xs font-semibold text-muted-foreground">
          Current status: {initial.status}
        </p>
      )}
    </div>
  );
}
