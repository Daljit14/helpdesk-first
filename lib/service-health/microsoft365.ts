import { z } from "zod";
import type { ServiceIncident } from "./types";
import { normalizedTimestamp, sanitizeServiceText } from "./url";

export const microsoftHealthIssueSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/),
  title: z.string(),
  service: z.string(),
  status: z.string().optional(),
  isResolved: z.boolean(),
  classification: z.string().nullable().optional(),
  startDateTime: z.string().nullable().optional(),
});

export function mapMicrosoft365Issues(value: unknown): ServiceIncident[] {
  const issues = z.array(microsoftHealthIssueSchema).parse(value);
  return issues
    .filter((issue) => issue.isResolved === false)
    .slice(0, 50)
    .map((issue) => ({
      source: "microsoft365" as const,
      incidentId: issue.id,
      service: sanitizeServiceText(issue.service, 80),
      title: sanitizeServiceText(issue.title, 200),
      impact:
        issue.classification?.toLowerCase() === "incident"
          ? ("outage" as const)
          : issue.classification?.toLowerCase() === "advisory"
            ? ("degraded" as const)
            : ("informational" as const),
      startedAt: normalizedTimestamp(issue.startDateTime),
      url: "https://admin.microsoft.com/Adminportal/Home#/servicehealth",
    }))
    .filter(
      (incident) => incident.service.length > 0 && incident.title.length > 0
    );
}
