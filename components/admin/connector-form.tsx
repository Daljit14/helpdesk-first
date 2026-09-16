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
  "mt-1 block w-full rounded-2xl border border-border/70 bg-background/60 p-2 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring";

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
        className="rounded-2xl bg-destructive/10 p-3 text-sm text-destructive"
      >
        {state.error}
      </p>
    );
  if (state && "success" in state)
    return (
      <p
        role="status"
        className="rounded-2xl border border-border bg-muted p-3 text-sm"
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
    <div className="mt-6 space-y-4">
      <form action={saveAction} className="glass-strong grid gap-4 p-5">
        <label
          className="grid gap-2 text-sm font-medium"
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
            <label
              className="grid gap-2 text-sm font-medium"
              htmlFor="connector-tenant"
            >
              Tenant ID
              <input
                id="connector-tenant"
                name="tenantId"
                defaultValue={config.tenantId}
                className={fieldClass}
              />
            </label>
            <label
              className="grid gap-2 text-sm font-medium"
              htmlFor="connector-client"
            >
              Client ID
              <input
                id="connector-client"
                name="clientId"
                defaultValue={config.clientId}
                className={fieldClass}
              />
            </label>
            <label
              className="grid gap-2 text-sm font-medium"
              htmlFor="connector-secret"
            >
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
              className="grid gap-2 text-sm font-medium"
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
            <label
              className="grid gap-2 text-sm font-medium"
              htmlFor="connector-admin-subject"
            >
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
        <label
          className="grid gap-2 text-sm font-medium"
          htmlFor="connector-groups"
        >
          Allowed group IDs
          <input
            id="connector-groups"
            name="allowedGroupIds"
            defaultValue={initial?.allowedGroupIds.join(",")}
            className={fieldClass}
          />
        </label>
        <label
          className="grid gap-2 text-sm font-medium"
          htmlFor="connector-reset-url"
        >
          Recovery URL
          <input
            id="connector-reset-url"
            name="resetUrl"
            type="url"
            defaultValue={initial?.resetUrl ?? ""}
            className={fieldClass}
          />
        </label>
        {hasSecret && (
          <p className="text-xs text-muted-foreground">
            Secret set — enter a new value to rotate
          </p>
        )}
        <ActionMessage state={saveState} success="Connector saved." />
        <button
          type="submit"
          disabled={savePending}
          className="glass-pill w-fit px-4 py-2"
        >
          {savePending ? "Saving…" : "Save connector"}
        </button>
      </form>
      <div className="flex flex-wrap gap-3">
        <form action={testAction}>
          <ActionMessage state={testState} success="Connector test passed." />
          <button
            type="submit"
            disabled={testPending}
            className="glass-pill px-4 py-2"
          >
            {testPending ? "Testing…" : "Test connector"}
          </button>
        </form>
        <form action={disableAction}>
          <ActionMessage state={disableState} success="Connector disabled." />
          <button
            type="submit"
            disabled={disablePending}
            className="glass-pill px-4 py-2"
          >
            {disablePending ? "Disabling…" : "Disable"}
          </button>
        </form>
      </div>
      {initial?.status && (
        <p className="text-xs text-muted-foreground">
          Current status: {initial.status}
        </p>
      )}
    </div>
  );
}
