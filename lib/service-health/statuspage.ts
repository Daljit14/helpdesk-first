import { z } from "zod";
import { fetchStatusJson } from "./http";
import type { ServiceIncident, StatusFetchResult, StatusSource } from "./types";
import {
  normalizedTimestamp,
  sanitizeServiceText,
  validateStatusBaseUrl,
} from "./url";

const statuspageFeedSchema = z.object({
  page: z.object({ name: z.string().optional(), url: z.string().optional() }),
  incidents: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      status: z.string().optional(),
      impact: z.string().nullable().optional(),
      shortlink: z.string().optional(),
      started_at: z.string().nullable().optional(),
      components: z.array(z.object({ name: z.string() })).optional(),
    })
  ),
});

function safeIncidentUrl(shortlink: string | undefined, baseUrl: string) {
  if (!shortlink) return baseUrl;
  try {
    const short = new URL(shortlink);
    const baseHost = new URL(baseUrl).hostname.toLowerCase();
    if (
      short.protocol === "https:" &&
      !short.username &&
      !short.password &&
      (short.port === "" || short.port === "443") &&
      (short.hostname.toLowerCase() === "stspg.io" ||
        short.hostname.toLowerCase() === baseHost)
    )
      return short.toString();
  } catch {
    return baseUrl;
  }
  return baseUrl;
}

export function parseStatuspageIncidents(
  value: unknown,
  source: StatusSource,
  baseUrl: string
): ServiceIncident[] {
  const parsed = statuspageFeedSchema.parse(value);
  const service = sanitizeServiceText(source.name, 80);
  return parsed.incidents
    .slice(0, 50)
    .map((incident) => ({
      source: "statuspage" as const,
      incidentId: `${source.id}:${incident.id}`,
      service,
      title: sanitizeServiceText(incident.name, 200),
      impact:
        incident.impact?.toLowerCase() === "critical" ||
        incident.impact?.toLowerCase() === "major"
          ? ("outage" as const)
          : incident.impact?.toLowerCase() === "minor"
            ? ("degraded" as const)
            : ("informational" as const),
      startedAt: normalizedTimestamp(incident.started_at),
      url: safeIncidentUrl(incident.shortlink, baseUrl),
    }))
    .filter(
      (incident) =>
        /^[A-Za-z0-9._:-]{1,128}$/.test(incident.incidentId) &&
        incident.service.length > 0 &&
        incident.title.length > 0
    );
}

export async function fetchStatuspageIncidents(
  source: StatusSource,
  signal: AbortSignal
): Promise<StatusFetchResult<ServiceIncident[]>> {
  const baseUrl = validateStatusBaseUrl(source.base_url);
  if (!baseUrl) return { ok: false, error: { kind: "invalid_response" } };
  return fetchStatusJson(
    `${baseUrl}/api/v2/incidents/unresolved.json`,
    (value) => parseStatuspageIncidents(value, source, baseUrl),
    signal
  );
}
