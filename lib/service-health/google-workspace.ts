import { z } from "zod";
import { fetchStatusJson } from "./http";
import type { ServiceIncident, StatusFetchResult } from "./types";
import { normalizedTimestamp, sanitizeServiceText } from "./url";

export const GOOGLE_WORKSPACE_STATUS_URL =
  "https://www.google.com/appsstatus/dashboard/incidents.json";
export const GOOGLE_WORKSPACE_DASHBOARD_URL =
  "https://www.google.com/appsstatus/dashboard/";

const googleIncidentSchema = z.object({
  id: z.union([z.string(), z.number()]),
  begin: z.string().nullable().optional(),
  end: z.string().nullable().optional(),
  service_name: z.string(),
  status_impact: z.string().optional(),
  severity: z.string().optional(),
  uri: z.string().optional(),
  external_desc: z.string().nullable().optional(),
  most_recent_update: z.string().nullable().optional(),
});

export function parseGoogleWorkspaceIncidents(
  value: unknown
): ServiceIncident[] {
  const incidents = z.array(googleIncidentSchema).parse(value);
  return incidents
    .filter((incident) => incident.end == null)
    .slice(0, 50)
    .map((incident) => {
      const firstLine = (incident.external_desc ?? "").split(/\r?\n/, 1)[0];
      const summary = firstLine.match(/^\s*\*\*Summary:\*\*\s*(.*)$/i)?.[1];
      const title = sanitizeServiceText(summary || incident.service_name, 200);
      const uri = incident.uri ?? "";
      return {
        source: "google_workspace" as const,
        incidentId: String(incident.id),
        service: sanitizeServiceText(incident.service_name, 80),
        title,
        impact:
          incident.status_impact === "SERVICE_OUTAGE"
            ? ("outage" as const)
            : incident.status_impact === "SERVICE_DISRUPTION"
              ? ("degraded" as const)
              : ("informational" as const),
        startedAt: normalizedTimestamp(incident.begin),
        url: /^incidents\/[A-Za-z0-9]{1,64}$/.test(uri)
          ? new URL(uri, GOOGLE_WORKSPACE_DASHBOARD_URL).toString()
          : GOOGLE_WORKSPACE_DASHBOARD_URL,
      };
    })
    .filter(
      (incident) =>
        /^[A-Za-z0-9._:-]{1,128}$/.test(incident.incidentId) &&
        incident.service.length > 0 &&
        incident.title.length > 0
    );
}

export function fetchGoogleWorkspaceIncidents(
  signal: AbortSignal
): Promise<StatusFetchResult<ServiceIncident[]>> {
  return fetchStatusJson(
    GOOGLE_WORKSPACE_STATUS_URL,
    parseGoogleWorkspaceIncidents,
    signal
  );
}
