"use client";

import { useActionState } from "react";
import {
  addStatusSourceAction,
  removeStatusSourceAction,
} from "@/app/actions/admin-status-sources";
import type { StatusSource } from "@/lib/service-health/types";

const initialState = null;
const fieldClass =
  "block h-10 w-full min-w-0 rounded-xl border border-border bg-card px-3 text-sm font-semibold text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const buttonClass =
  "inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-extrabold text-primary-foreground shadow-sm transition-transform hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-60";

function ActionMessage({
  state,
}: {
  state: { success: true } | { error: string } | null;
}) {
  if (!state) return null;
  const success = "success" in state;
  return (
    <p
      role={success ? "status" : "alert"}
      className={
        success
          ? "text-sm font-bold text-status-success"
          : "text-sm font-bold text-status-danger"
      }
    >
      {success ? "Saved." : state.error}
    </p>
  );
}

export function StatusSourcesPanel({
  sources,
  loadError = false,
}: {
  sources: StatusSource[];
  loadError?: boolean;
}) {
  const [addState, addAction, addPending] = useActionState(
    addStatusSourceAction,
    initialState
  );
  const [removeState, removeAction, removePending] = useActionState(
    removeStatusSourceAction,
    initialState
  );

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Add up to 10 public HTTPS Statuspage origins for this organization.
      </p>
      {loadError ? (
        <p role="status" className="text-sm font-bold text-status-warning">
          Status-page storage is unavailable. Apply the D3 migration before
          adding sources.
        </p>
      ) : (
        <>
          <ul className="divide-y divide-border rounded-2xl border border-border">
            {sources.length ? (
              sources.map((source) => (
                <li
                  key={source.id}
                  className="flex flex-wrap items-center justify-between gap-3 p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-extrabold">
                      {source.name}
                    </p>
                    <p className="break-all text-xs text-muted-foreground">
                      {source.base_url}
                    </p>
                  </div>
                  <form action={removeAction}>
                    <input type="hidden" name="id" value={source.id} />
                    <button
                      type="submit"
                      disabled={removePending}
                      className={`${buttonClass} bg-secondary text-secondary-foreground`}
                    >
                      Remove
                    </button>
                  </form>
                </li>
              ))
            ) : (
              <li className="p-3 text-sm text-muted-foreground">
                No status pages configured.
              </li>
            )}
          </ul>
          <form
            action={addAction}
            className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto]"
          >
            <label
              className="grid gap-1 text-sm font-bold"
              htmlFor="status-name"
            >
              Name
              <input
                id="status-name"
                name="name"
                required
                maxLength={80}
                className={fieldClass}
              />
            </label>
            <label
              className="grid gap-1 text-sm font-bold"
              htmlFor="status-url"
            >
              HTTPS status page URL
              <input
                id="status-url"
                name="baseUrl"
                required
                maxLength={2048}
                type="url"
                placeholder="https://status.example.com"
                className={fieldClass}
              />
            </label>
            <button
              type="submit"
              disabled={addPending}
              className={`${buttonClass} self-end`}
            >
              {addPending ? "Adding…" : "Add status page"}
            </button>
          </form>
          <ActionMessage state={addState} />
          <ActionMessage state={removeState} />
        </>
      )}
    </div>
  );
}
