export type ServiceHealthSource =
  "microsoft365" | "google_workspace" | "statuspage";

export type ServiceIncident = {
  source: ServiceHealthSource;
  incidentId: string;
  service: string;
  title: string;
  impact: "outage" | "degraded" | "informational";
  startedAt: string | null;
  url: string;
};

export type ServiceHealthSnapshot = {
  incidents: ServiceIncident[];
  sources: Array<{
    source: ServiceHealthSource;
    name: string;
    ok: boolean;
    sourceId?: string;
  }>;
  checkedAt: string;
};

export type StatusSource = {
  id: string;
  name: string;
  base_url: string;
  enabled: boolean;
};

export type StatusFetchResult<T> =
  { ok: true; value: T } | { ok: false; error: { kind: string } };
