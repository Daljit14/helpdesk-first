"use client";

import { useActionState, useState } from "react";
import {
  addOrgVendorDomainAction,
  removeOrgVendorDomainAction,
  type VendorDomainsActionState,
} from "@/app/actions/admin-vendor-domains";
import { VENDOR_DOMAINS } from "@/lib/research/allowlist";

type OrgVendorDomain = {
  id: string;
  domain: string;
  addedByName: string;
  createdAt: string;
};

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Unknown date"
    : date.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
}

export function VendorDomainsPanel({
  domains,
}: {
  domains: OrgVendorDomain[];
}) {
  const [addState, addAction, adding] = useActionState<
    VendorDomainsActionState | null,
    FormData
  >(addOrgVendorDomainAction, null);
  const [removeState, removeAction, removing] = useActionState<
    VendorDomainsActionState | null,
    FormData
  >(removeOrgVendorDomainAction, null);
  const [lastAction, setLastAction] = useState<"add" | "remove" | null>(null);

  return (
    <div className="space-y-6">
      <section
        aria-labelledby="add-vendor-domain-heading"
        className="space-y-3"
      >
        <h2 id="add-vendor-domain-heading" className="text-lg font-bold">
          Add an approved vendor domain
        </h2>
        <form
          action={addAction}
          onSubmit={() => setLastAction("add")}
          className="flex flex-wrap items-end gap-3"
        >
          <label className="min-w-64 flex-1 space-y-1 text-sm font-semibold">
            <span>Vendor documentation domain</span>
            <input
              className="w-full rounded-xl border border-input bg-background px-3 py-2"
              name="domain"
              type="text"
              autoComplete="off"
              maxLength={253}
              placeholder="support.example.com"
              required
            />
          </label>
          <button
            className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-60"
            type="submit"
            disabled={adding}
          >
            {adding ? "Adding…" : "Add domain"}
          </button>
        </form>
        {lastAction === "add" &&
          addState &&
          "success" in addState &&
          addState.success && (
            <p role="status" className="text-sm font-semibold text-primary">
              {addState.message ?? "Domain added."}
            </p>
          )}
        {lastAction === "add" && addState && "error" in addState && (
          <p role="alert" className="text-sm font-semibold text-destructive">
            {addState.error}
          </p>
        )}
      </section>

      <section
        aria-labelledby="org-vendor-domains-heading"
        className="space-y-3"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="org-vendor-domains-heading" className="text-lg font-bold">
            Organization-approved domains
          </h2>
          <p className="text-sm text-muted-foreground">
            {domains.length} of 25
          </p>
        </div>
        {domains.length === 0 ? (
          <p className="rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
            No organization-approved vendor domains yet.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {domains.map((domain) => (
              <li
                key={domain.id}
                className="flex flex-wrap items-center justify-between gap-3 p-4"
              >
                <div className="min-w-0">
                  <p className="break-all font-semibold">{domain.domain}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Added by {domain.addedByName} ·{" "}
                    <time dateTime={domain.createdAt}>
                      {formatDate(domain.createdAt)}
                    </time>
                  </p>
                </div>
                <form
                  action={removeAction}
                  onSubmit={() => setLastAction("remove")}
                >
                  <input type="hidden" name="id" value={domain.id} />
                  <button
                    className="rounded-lg border border-border px-3 py-2 text-sm font-semibold hover:bg-muted disabled:opacity-60"
                    type="submit"
                    disabled={removing}
                    aria-label={`Remove ${domain.domain}`}
                  >
                    Remove
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
        {lastAction === "remove" &&
          removeState &&
          "success" in removeState &&
          removeState.success && (
            <p role="status" className="text-sm font-semibold text-primary">
              {removeState.message ?? "Domain removed."}
            </p>
          )}
        {lastAction === "remove" && removeState && "error" in removeState && (
          <p role="alert" className="text-sm font-semibold text-destructive">
            {removeState.error}
          </p>
        )}
      </section>

      <section aria-labelledby="built-in-vendor-domains-heading">
        <h2 id="built-in-vendor-domains-heading" className="text-lg font-bold">
          Built-in official documentation domains
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          These fixed sources are trusted for every organization.
        </p>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {VENDOR_DOMAINS.map((domain) => (
            <li
              key={domain}
              className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm"
            >
              {domain}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
