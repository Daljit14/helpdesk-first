import type { createAdminClient } from "@/lib/supabase/admin";
import { loadDirectoryForOrganization } from "@/lib/autonomy/connectors";
import { EntraDirectory } from "@/lib/autonomy/connectors/entra";
import { getCachedSnapshot, setCachedSnapshot } from "./cache";
import { fetchGoogleWorkspaceIncidents } from "./google-workspace";
import { mapMicrosoft365Issues } from "./microsoft365";
import { fetchStatuspageIncidents } from "./statuspage";
import type {
  ServiceHealthSnapshot,
  ServiceIncident,
  ServiceHealthSource,
  StatusSource,
} from "./types";
import { validateStatusBaseUrl } from "./url";

type Admin = ReturnType<typeof createAdminClient>;
type SourceResult = {
  source: ServiceHealthSource;
  name: string;
  incidents: ServiceIncident[];
  ok: boolean;
  sourceId?: string;
};

async function fetchMicrosoft365(
  directory: EntraDirectory,
  signal: AbortSignal
): Promise<SourceResult> {
  const result = await directory.listServiceHealthIssues(signal);
  return {
    source: "microsoft365",
    name: "Microsoft 365",
    incidents: result.ok ? mapMicrosoft365Issues(result.value) : [],
    ok: result.ok,
  };
}

async function fetchGoogleWorkspace(
  signal: AbortSignal
): Promise<SourceResult> {
  const result = await fetchGoogleWorkspaceIncidents(signal);
  return {
    source: "google_workspace",
    name: "Google Workspace",
    incidents: result.ok ? result.value : [],
    ok: result.ok,
  };
}

async function fetchStatusSource(
  source: StatusSource,
  signal: AbortSignal
): Promise<SourceResult> {
  const result = await fetchStatuspageIncidents(source, signal);
  return {
    source: "statuspage",
    name: source.name,
    incidents: result.ok ? result.value : [],
    ok: result.ok,
    sourceId: source.id,
  };
}

function rejectedSource(
  source: ServiceHealthSource,
  name: string
): SourceResult {
  return { source, name, incidents: [], ok: false };
}

export async function getServiceHealth(
  admin: Admin,
  organizationId: string,
  signal: AbortSignal,
  opts: { fresh?: boolean } = {}
): Promise<ServiceHealthSnapshot> {
  if (!opts.fresh) {
    try {
      const cached = await getCachedSnapshot(organizationId);
      if (cached) return cached;
    } catch {
      // Cache failures must not interrupt a health check.
    }
  }

  const checkedAt = new Date().toISOString();
  const results: SourceResult[] = [];
  const tasks: Array<Promise<SourceResult>> = [];

  try {
    const [directoryResult, statusSourcesResult] = await Promise.allSettled([
      loadDirectoryForOrganization(admin, organizationId),
      admin
        .from("org_status_sources")
        .select("id,name,base_url,enabled")
        .eq("organization_id", organizationId)
        .eq("enabled", true)
        .order("created_at", { ascending: true })
        .limit(10),
    ]);

    if (
      directoryResult.status === "fulfilled" &&
      directoryResult.value?.config.provider === "entra" &&
      directoryResult.value.directory instanceof EntraDirectory
    ) {
      tasks.push(
        fetchMicrosoft365(directoryResult.value.directory, signal).catch(() =>
          rejectedSource("microsoft365", "Microsoft 365")
        )
      );
    } else if (
      directoryResult.status === "fulfilled" &&
      directoryResult.value?.config.provider === "google"
    ) {
      tasks.push(
        fetchGoogleWorkspace(signal).catch(() =>
          rejectedSource("google_workspace", "Google Workspace")
        )
      );
    }

    if (
      statusSourcesResult.status === "fulfilled" &&
      !statusSourcesResult.value.error
    ) {
      const sources = (statusSourcesResult.value.data ?? []) as StatusSource[];
      for (const source of sources.slice(0, 10)) {
        tasks.push(
          fetchStatusSource(source, signal).catch(() =>
            rejectedSource("statuspage", source.name)
          )
        );
      }
    } else {
      tasks.push(Promise.resolve(rejectedSource("statuspage", "Status pages")));
    }
  } catch {
    tasks.push(Promise.resolve(rejectedSource("statuspage", "Status pages")));
  }

  const settled = await Promise.allSettled(tasks);
  for (const result of settled) {
    results.push(
      result.status === "fulfilled"
        ? result.value
        : rejectedSource("statuspage", "Status pages")
    );
  }

  const snapshot: ServiceHealthSnapshot = {
    incidents: results.flatMap((result) => result.incidents).slice(0, 50),
    sources: results.map(({ source, name, ok, sourceId }) => ({
      source,
      name,
      ok,
      ...(sourceId ? { sourceId } : {}),
    })),
    checkedAt,
  };
  if (snapshot.sources.some((source) => source.ok)) {
    try {
      await setCachedSnapshot(organizationId, snapshot);
    } catch {
      // The in-memory fallback and Redis are both best-effort.
    }
  }
  return snapshot;
}

export async function getAllowedStatusHosts(
  admin: Admin,
  organizationId: string
): Promise<string[]> {
  try {
    const result = await admin
      .from("org_status_sources")
      .select("base_url")
      .eq("organization_id", organizationId)
      .eq("enabled", true)
      .limit(10);
    if (result.error) return [];
    return ((result.data ?? []) as Array<{ base_url: string }>)
      .map((source) => validateStatusBaseUrl(source.base_url))
      .filter((baseUrl): baseUrl is string => baseUrl !== null)
      .map((baseUrl) => new URL(baseUrl).hostname.toLowerCase());
  } catch {
    return [];
  }
}

export type {
  ServiceHealthSnapshot,
  ServiceHealthSource,
  ServiceIncident,
  StatusSource,
} from "./types";
export { matchIncidents } from "./match";
export { isAllowedIncidentUrl } from "./url";
